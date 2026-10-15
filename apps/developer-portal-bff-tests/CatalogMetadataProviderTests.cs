using System.Security.Claims;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Authorization;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Domain;
using PortBarcelona.DeveloperPortal.Bff.Infrastructure.Apim;
using PortBarcelona.DeveloperPortal.Bff.Services;
using Xunit;

namespace DeveloperPortal.Bff.Tests;

public sealed class CatalogMetadataProviderTests
{
    [Fact]
    public async Task ConcurrentMissesShareOneBulkMetadataLoad()
    {
        var apim = new FakeApim();
        using var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 50 });
        using var provider = CreateProvider(apim, cache);

        var snapshots = await Task.WhenAll(
            provider.GetAsync(CancellationToken.None),
            provider.GetAsync(CancellationToken.None));

        Assert.Same(snapshots[0], snapshots[1]);
        Assert.Equal(1, apim.ApiListCalls);
        Assert.Equal(1, apim.ProductListCalls);
        Assert.Equal(1, apim.TagAssociationCalls);
        Assert.Equal(1, apim.ProductGroupCalls);
        Assert.Equal(1, apim.ProductApiCalls);
        Assert.Contains("app:Countries", snapshots[0].Apis.Single().Tags);
    }

    [Fact]
    public async Task UserVisibilityIsEvaluatedForEveryCatalogRequest()
    {
        var api = Api();
        var product = new ApimProduct("/products/private", "private", "Private", "", "published", true);
        var snapshot = new CatalogMetadataSnapshot(
            [api],
            [new CatalogProductMetadata(product, [new ApimGroup("/groups/team", "team", "Team", "external", "group-1")], [api])]);
        var provider = new StaticMetadataProvider(snapshot);
        var resolver = new ClaimGroupResolver();
        var visibility = new ProductVisibilityService(Options.Create(new PortalAuthorizationOptions()));
        var service = new CatalogService(provider, resolver, visibility, NullLogger<CatalogService>.Instance);

        var visible = await service.GetApisAsync(User("group-1"), CancellationToken.None);
        var hidden = await service.GetApisAsync(User("group-2"), CancellationToken.None);

        Assert.Single(visible);
        Assert.Empty(hidden);
        Assert.Equal(2, resolver.CallCount);
    }

    private static CatalogMetadataProvider CreateProvider(FakeApim apim, IMemoryCache cache) => new(
        apim,
        cache,
        Options.Create(new CatalogOptions { CacheDurationMinutes = 10, MaxConcurrentProductRequests = 4 }),
        NullLogger<CatalogMetadataProvider>.Instance);

    private static ClaimsPrincipal User(string group) => new(new ClaimsIdentity([
        new Claim("oid", Guid.NewGuid().ToString()),
        new Claim("groups", group)
    ], "test"));

    private static ApimApi Api() => new(
        "/apis/apb-api-countries-v1", "apb-api-countries-v1", "APB.API.COUNTRIES", "",
        "v1", "1", "/apiVersionSets/ctr-versionset", []);

    private sealed class StaticMetadataProvider(CatalogMetadataSnapshot snapshot) : ICatalogMetadataProvider
    {
        public Task<CatalogMetadataSnapshot> GetAsync(CancellationToken cancellationToken) => Task.FromResult(snapshot);
    }

    private sealed class ClaimGroupResolver : IUserGroupResolver
    {
        public int CallCount { get; private set; }
        public Task<ResolvedUserGroups> ResolveAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(new ResolvedUserGroups(
                user.FindAll("groups").Select(claim => claim.Value).ToHashSet(StringComparer.OrdinalIgnoreCase),
                true,
                false));
        }
    }

    private sealed class FakeApim : IApimManagementClient
    {
        public int ApiListCalls { get; private set; }
        public int ProductListCalls { get; private set; }
        public int TagAssociationCalls { get; private set; }
        public int ProductGroupCalls { get; private set; }
        public int ProductApiCalls { get; private set; }

        public async Task<IReadOnlyList<ApimApi>> ListApisAsync(CancellationToken cancellationToken)
        {
            ApiListCalls++;
            await Task.Delay(10, cancellationToken);
            return [Api()];
        }

        public Task<IReadOnlyList<ApimProduct>> ListProductsAsync(CancellationToken cancellationToken)
        {
            ProductListCalls++;
            return Task.FromResult<IReadOnlyList<ApimProduct>>([
                new ApimProduct("/products/team", "team", "Team", "", "published", true)
            ]);
        }

        public Task<IReadOnlyList<ApimApiTagAssociation>> ListApiTagAssociationsAsync(CancellationToken cancellationToken)
        {
            TagAssociationCalls++;
            return Task.FromResult<IReadOnlyList<ApimApiTagAssociation>>([
                new ApimApiTagAssociation("apb-api-countries-v1", "app:Countries")
            ]);
        }

        public Task<IReadOnlyList<ApimGroup>> ListProductGroupsAsync(string productId, CancellationToken cancellationToken)
        {
            ProductGroupCalls++;
            return Task.FromResult<IReadOnlyList<ApimGroup>>([]);
        }

        public Task<IReadOnlyList<ApimApi>> ListProductApisAsync(string productId, CancellationToken cancellationToken)
        {
            ProductApiCalls++;
            return Task.FromResult<IReadOnlyList<ApimApi>>([Api()]);
        }

        public Task<ApimApi?> GetApiAsync(string apiId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<string> ExportOpenApiAsync(string apiId, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
