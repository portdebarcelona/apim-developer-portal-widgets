using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Domain;
using PortBarcelona.DeveloperPortal.Bff.Infrastructure.Apim;

namespace PortBarcelona.DeveloperPortal.Bff.Services;

public interface ICatalogMetadataProvider
{
    Task<CatalogMetadataSnapshot> GetAsync(CancellationToken cancellationToken);
}

public sealed record CatalogProductMetadata(
    ApimProduct Product,
    IReadOnlyList<ApimGroup> Groups,
    IReadOnlyList<ApimApi> Apis);

public sealed record CatalogMetadataSnapshot(
    IReadOnlyList<ApimApi> Apis,
    IReadOnlyList<CatalogProductMetadata> Products);

public sealed class CatalogMetadataProvider : ICatalogMetadataProvider, IDisposable
{
    private const string CacheKey = "apim-catalog-metadata-v1";
    private readonly IApimManagementClient _apim;
    private readonly IMemoryCache _cache;
    private readonly CatalogOptions _options;
    private readonly ILogger<CatalogMetadataProvider> _logger;
    private readonly SemaphoreSlim _refreshGate = new(1, 1);

    public CatalogMetadataProvider(
        IApimManagementClient apim,
        IMemoryCache cache,
        IOptions<CatalogOptions> options,
        ILogger<CatalogMetadataProvider> logger)
    {
        _apim = apim;
        _cache = cache;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<CatalogMetadataSnapshot> GetAsync(CancellationToken cancellationToken)
    {
        if (_cache.TryGetValue(CacheKey, out CatalogMetadataSnapshot? cached) && cached is not null)
            return cached;

        await _refreshGate.WaitAsync(cancellationToken);
        try
        {
            if (_cache.TryGetValue(CacheKey, out cached) && cached is not null)
                return cached;

            var snapshot = await LoadAsync(cancellationToken);
            _cache.Set(CacheKey, snapshot, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(_options.CacheDurationMinutes),
                Size = 1
            });
            return snapshot;
        }
        finally
        {
            _refreshGate.Release();
        }
    }

    private async Task<CatalogMetadataSnapshot> LoadAsync(CancellationToken cancellationToken)
    {
        var total = Stopwatch.StartNew();
        var initialRequestCount = _apim.RequestCount;

        var apiTask = MeasureAsync("API list", _apim.ListApisAsync(cancellationToken));
        var productTask = MeasureAsync("product list", _apim.ListProductsAsync(cancellationToken));
        var tagTask = MeasureAsync("tag/API associations", _apim.ListApiTagAssociationsAsync(cancellationToken));
        await Task.WhenAll(apiTask, productTask, tagTask);

        var mappingTimer = Stopwatch.StartNew();
        var tagsByApi = tagTask.Result
            .GroupBy(association => association.ApiId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<string>)group.Select(item => item.TagName)
                    .Distinct(StringComparer.Ordinal)
                    .OrderBy(tag => tag, StringComparer.Ordinal)
                    .ToArray(),
                StringComparer.OrdinalIgnoreCase);
        var apis = apiTask.Result
            .Select(api => api with { Tags = tagsByApi.GetValueOrDefault(ResourceName(api.Id, api.Name)) ?? [] })
            .ToArray();
        var apiByName = apis.ToDictionary(
            api => ResourceName(api.Id, api.Name), api => api, StringComparer.OrdinalIgnoreCase);
        _logger.LogInformation(
            "Catalog tag/API mapping completed: {ApiCount} APIs and {TagCount} tags in {DurationMs} ms",
            apis.Length, tagsByApi.Values.Sum(tags => tags.Count), mappingTimer.ElapsedMilliseconds);

        var versionSetTimer = Stopwatch.StartNew();
        var versionSetCount = apis.Select(api => api.ApiVersionSetId)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();
        _logger.LogInformation(
            "Catalog version-set mapping completed: {VersionSetCount} sets in {DurationMs} ms",
            versionSetCount, versionSetTimer.ElapsedMilliseconds);

        var products = productTask.Result
            .Where(product => string.Equals(product.State, "published", StringComparison.OrdinalIgnoreCase))
            .ToArray();
        var loadedProducts = new ConcurrentDictionary<string, CatalogProductMetadata>(StringComparer.OrdinalIgnoreCase);
        long groupDurationMs = 0;
        long apiAssociationDurationMs = 0;
        var associationWallTime = Stopwatch.StartNew();

        await Parallel.ForEachAsync(products, new ParallelOptions
        {
            MaxDegreeOfParallelism = _options.MaxConcurrentProductRequests,
            CancellationToken = cancellationToken
        }, async (product, token) =>
        {
            var groupTask = TimedAsync(_apim.ListProductGroupsAsync(product.Name, token));
            var productApiTask = TimedAsync(_apim.ListProductApisAsync(product.Name, token));
            await Task.WhenAll(groupTask, productApiTask);
            Interlocked.Add(ref groupDurationMs, groupTask.Result.DurationMs);
            Interlocked.Add(ref apiAssociationDurationMs, productApiTask.Result.DurationMs);

            var enrichedProductApis = productApiTask.Result.Value.Select(api =>
            {
                var apiName = ResourceName(api.Id, api.Name);
                return apiByName.GetValueOrDefault(apiName)
                    ?? api with { Tags = tagsByApi.GetValueOrDefault(apiName) ?? [] };
            }).ToArray();
            loadedProducts[product.Name] = new CatalogProductMetadata(product, groupTask.Result.Value, enrichedProductApis);
        });

        _logger.LogInformation(
            "Catalog product groups completed: {ProductCount} products, {CumulativeDurationMs} cumulative ms, {WallDurationMs} wall ms",
            products.Length, groupDurationMs, associationWallTime.ElapsedMilliseconds);
        _logger.LogInformation(
            "Catalog product/API associations completed: {ProductCount} products, {CumulativeDurationMs} cumulative ms, {WallDurationMs} wall ms",
            products.Length, apiAssociationDurationMs, associationWallTime.ElapsedMilliseconds);

        mappingTimer.Restart();
        var snapshot = new CatalogMetadataSnapshot(
            apis,
            products.Select(product => loadedProducts[product.Name])
                .OrderBy(item => item.Product.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ToArray());
        _logger.LogInformation(
            "Catalog product mapping completed: {ProductCount} products in {DurationMs} ms",
            snapshot.Products.Count, mappingTimer.ElapsedMilliseconds);
        _logger.LogInformation(
            "Catalog metadata refresh completed: {ApiCount} APIs, {TagAssociationCount} tag associations, {ProductCount} products, {ArmRequestCount} ARM requests, {DurationMs} ms",
            snapshot.Apis.Count, tagTask.Result.Count, snapshot.Products.Count,
            _apim.RequestCount - initialRequestCount, total.ElapsedMilliseconds);
        return snapshot;
    }

    private async Task<T> MeasureAsync<T>(string segment, Task<T> operation)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = await operation;
        var count = result is System.Collections.ICollection collection ? collection.Count : (int?)null;
        _logger.LogInformation(
            "Catalog {Segment} completed: {ItemCount} items in {DurationMs} ms",
            segment, count, stopwatch.ElapsedMilliseconds);
        return result;
    }

    private static async Task<TimedResult<T>> TimedAsync<T>(Task<T> operation)
    {
        var stopwatch = Stopwatch.StartNew();
        return new TimedResult<T>(await operation, stopwatch.ElapsedMilliseconds);
    }

    private static string ResourceName(string resourceId, string fallback) =>
        resourceId.TrimEnd('/').Split('/').LastOrDefault() ?? fallback;

    public void Dispose() => _refreshGate.Dispose();

    private sealed record TimedResult<T>(T Value, long DurationMs);
}
