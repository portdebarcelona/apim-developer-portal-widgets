using System.Security.Claims;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Contracts;
using PortBarcelona.DeveloperPortal.Bff.Domain;
using PortBarcelona.DeveloperPortal.Bff.Infrastructure.Apim;
using PortBarcelona.DeveloperPortal.Bff.Services;
using Xunit;

namespace DeveloperPortal.Bff.Tests;

public sealed class OpenApiServiceTests
{
    private static readonly ClaimsPrincipal User = new(new ClaimsIdentity([new Claim("oid", "user-1")], "test"));

    [Fact]
    public async Task HiddenApiReturnsNullWithoutExport()
    {
        var apim = new FakeApim();
        using var cache = CreateCache();
        var service = CreateService(new FakeCatalog((_, _) => null), apim, cache);

        var result = await service.GetAsync("hidden", null, null, User, CancellationToken.None);

        Assert.Null(result);
        Assert.Empty(apim.ExportedApiIds);
    }

    [Fact]
    public async Task VisibleCountriesApiIsExported()
    {
        var apim = new FakeApim();
        using var cache = CreateCache();
        var countries = Api("apb-api-countries-v1", "v1", "1", "/apiVersionSets/ctr-versionset");
        var service = CreateService(new FakeCatalog((_, _) => countries), apim, cache);

        var result = await service.GetAsync(countries.Name, "v1", null, User, CancellationToken.None);

        Assert.Equal("apb-api-countries-v1", result?.ApiId);
        Assert.Single(apim.ExportedApiIds, "apb-api-countries-v1");
    }

    [Fact]
    public async Task VisibilityIsCheckedAgainBeforeUsingCachedDocument()
    {
        var allowed = true;
        var apim = new FakeApim();
        using var cache = CreateCache();
        var service = CreateService(
            new FakeCatalog((_, _) => allowed ? Api("countries-v1", "v1", "1", "/sets/countries") : null),
            apim,
            cache);

        Assert.NotNull(await service.GetAsync("countries-v1", "v1", null, User, CancellationToken.None));
        allowed = false;
        Assert.Null(await service.GetAsync("countries-v1", "v1", null, User, CancellationToken.None));
        Assert.Single(apim.ExportedApiIds);
    }

    [Fact]
    public async Task CacheSeparatesApiVersionAndRevision()
    {
        var apim = new FakeApim
        {
            Revisions = { ["countries-v1;rev=2"] = Api("countries-v1;rev=2", "v1", "2", "/sets/countries") }
        };
        using var cache = CreateCache();
        var service = CreateService(new FakeCatalog((_, version) =>
            version == "v2" ? Api("countries-v2", "v2", "1", "/sets/countries") :
            Api("countries-v1", "v1", "1", "/sets/countries")), apim, cache);

        await service.GetAsync("countries-v1", "v1", null, User, CancellationToken.None);
        await service.GetAsync("countries-v1", "v1", null, User, CancellationToken.None);
        await service.GetAsync("countries-v1", "v2", null, User, CancellationToken.None);
        await service.GetAsync("countries-v1", "v1", "2", User, CancellationToken.None);

        Assert.Equal(["countries-v1", "countries-v2", "countries-v1;rev=2"], apim.ExportedApiIds);
        Assert.NotEqual(
            OpenApiService.BuildCacheKey("countries-v1", "v1", "1"),
            OpenApiService.BuildCacheKey("countries-v1", "v1", "2"));
    }

    private static OpenApiService CreateService(ICatalogService catalog, IApimManagementClient apim, IMemoryCache cache) =>
        new(catalog, apim, cache, Options.Create(new OpenApiOptions()), NullLogger<OpenApiService>.Instance);

    private static MemoryCache CreateCache() => new(new MemoryCacheOptions { SizeLimit = 50 });

    private static ApimApi Api(string name, string version, string revision, string versionSet) =>
        new(name, name, "Countries", "", version, revision, versionSet, []);

    private sealed class FakeCatalog(Func<string, string?, ApimApi?> resolve) : ICatalogService
    {
        public int ResolveCount { get; private set; }
        public Task<ApimApi?> ResolveVisibleApiAsync(string apiId, string? version, ClaimsPrincipal user, CancellationToken token)
        {
            ResolveCount++;
            return Task.FromResult(resolve(apiId, version));
        }
        public Task<IReadOnlyList<ApiGroupContract>> GetApisAsync(ClaimsPrincipal u, CancellationToken t) => throw new NotSupportedException();
        public Task<IReadOnlyList<ApplicationContract>> GetApplicationsAsync(ClaimsPrincipal u, CancellationToken t) => throw new NotSupportedException();
        public Task<IReadOnlyList<ProductContract>> GetProductsAsync(ClaimsPrincipal u, CancellationToken t) => throw new NotSupportedException();
        public Task<IReadOnlyList<ApiGroupContract>?> GetProductApisAsync(string id, ClaimsPrincipal u, CancellationToken t) => throw new NotSupportedException();
        public Task<ApiContract?> GetApiAsync(string id, ClaimsPrincipal u, CancellationToken t) => throw new NotSupportedException();
    }

    private sealed class FakeApim : IApimManagementClient
    {
        public List<string> ExportedApiIds { get; } = [];
        public Dictionary<string, ApimApi> Revisions { get; } = new(StringComparer.OrdinalIgnoreCase);
        public Task<string> ExportOpenApiAsync(string apiId, CancellationToken token)
        {
            ExportedApiIds.Add(apiId);
            return Task.FromResult("{\"openapi\":\"3.0.1\",\"info\":{\"title\":\"" + apiId +
                                   "\",\"version\":\"1\"},\"paths\":{}}");
        }
        public Task<ApimApi?> GetApiAsync(string apiId, CancellationToken token) =>
            Task.FromResult(Revisions.GetValueOrDefault(apiId));
        public Task<IReadOnlyList<ApimApi>> ListApisAsync(CancellationToken t) => throw new NotSupportedException();
        public Task<IReadOnlyList<ApimProduct>> ListProductsAsync(CancellationToken t) => throw new NotSupportedException();
        public Task<IReadOnlyList<ApimGroup>> ListProductGroupsAsync(string id, CancellationToken t) => throw new NotSupportedException();
        public Task<IReadOnlyList<ApimApi>> ListProductApisAsync(string id, CancellationToken t) => throw new NotSupportedException();
    }
}
