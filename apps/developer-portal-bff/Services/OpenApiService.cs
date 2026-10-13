using System.Diagnostics;
using System.Security.Claims;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Domain;
using PortBarcelona.DeveloperPortal.Bff.Infrastructure.Apim;

namespace PortBarcelona.DeveloperPortal.Bff.Services;

public sealed class OpenApiService : IOpenApiService
{
    private readonly ICatalogService _catalog;
    private readonly IApimManagementClient _apim;
    private readonly IMemoryCache _cache;
    private readonly OpenApiOptions _options;
    private readonly ILogger<OpenApiService> _logger;

    public OpenApiService(
        ICatalogService catalog,
        IApimManagementClient apim,
        IMemoryCache cache,
        IOptions<OpenApiOptions> options,
        ILogger<OpenApiService> logger)
    {
        _catalog = catalog;
        _apim = apim;
        _cache = cache;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<OpenApiDocument?> GetAsync(
        string apiId,
        string? version,
        string? revision,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        // Authorization is intentionally resolved before every cache lookup. Cached documents
        // are reusable, but a previous user's visibility decision never is.
        var visibleApi = await _catalog.ResolveVisibleApiAsync(apiId, version, user, cancellationToken);
        if (visibleApi is null) return null;

        var exportApi = await ResolveRevisionAsync(visibleApi, revision, cancellationToken);
        if (exportApi is null) return null;

        var cacheKey = BuildCacheKey(exportApi.Name, exportApi.ApiVersion, exportApi.ApiRevision);
        if (_cache.TryGetValue(cacheKey, out string? cached) && cached is not null)
            return ToDocument(cached, exportApi);

        var stopwatch = Stopwatch.StartNew();
        try
        {
            var content = await _apim.ExportOpenApiAsync(exportApi.Name, cancellationToken);
            _cache.Set(cacheKey, content, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(_options.CacheDurationMinutes),
                Size = 1
            });
            _logger.LogInformation(
                "Exported OpenAPI for {ApiId} version {Version} revision {Revision} in {ExportDurationMs} ms",
                exportApi.Name, exportApi.ApiVersion, exportApi.ApiRevision, stopwatch.ElapsedMilliseconds);
            return ToDocument(content, exportApi);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogError(exception,
                "APIM OpenAPI export failed for {ApiId} version {Version} revision {Revision} after {ExportDurationMs} ms",
                exportApi.Name, exportApi.ApiVersion, exportApi.ApiRevision, stopwatch.ElapsedMilliseconds);
            throw new OpenApiExportException("APIM could not export a valid OpenAPI document.", exception);
        }
    }

    internal static string BuildCacheKey(string apiId, string version, string revision) =>
        $"openapi::{apiId.Trim().ToLowerInvariant()}::{version.Trim().ToLowerInvariant()}::{revision.Trim().ToLowerInvariant()}";

    private async Task<ApimApi?> ResolveRevisionAsync(
        ApimApi visibleApi,
        string? requestedRevision,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(requestedRevision) ||
            string.Equals(visibleApi.ApiRevision, requestedRevision, StringComparison.OrdinalIgnoreCase))
            return visibleApi;

        var revision = await _apim.GetApiAsync($"{visibleApi.Name};rev={requestedRevision.Trim()}", cancellationToken);
        if (revision is null) return null;

        var sameVersionSet = !string.IsNullOrWhiteSpace(visibleApi.ApiVersionSetId) && string.Equals(
            visibleApi.ApiVersionSetId, revision.ApiVersionSetId, StringComparison.OrdinalIgnoreCase);
        var sameUnversionedApi = string.IsNullOrWhiteSpace(visibleApi.ApiVersionSetId) &&
            revision.Name.StartsWith(visibleApi.Name + ";rev=", StringComparison.OrdinalIgnoreCase);
        return sameVersionSet || sameUnversionedApi ? revision : null;
    }

    private static OpenApiDocument ToDocument(string content, ApimApi api) =>
        new(content, api.Name, api.ApiVersion, api.ApiRevision);
}
