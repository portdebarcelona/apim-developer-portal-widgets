using PortBarcelona.DeveloperPortal.Bff.Domain;
using PortBarcelona.DeveloperPortal.Bff.Services;
using Xunit;

namespace DeveloperPortal.Bff.Tests;

public sealed class CatalogMappingTests
{
    [Fact]
    public void ExtractsApplicationTags()
    {
        var result = CatalogService.ExtractApplicationNames(["app:MPT-AEATService", "domain:port", "app: Billing "]);
        Assert.Equal(["MPT-AEATService", "Billing"], result);
    }

    [Fact]
    public void GroupsVersionsByVersionSetBeforeDisplayName()
    {
        var result = CatalogService.GroupApis([
            Api("one-v1", "Name before rename", "1", "/versionSets/one"),
            Api("one-v2", "Name after rename", "2", "/versionSets/one"),
            Api("plain", "Plain", "", "")
        ]);

        Assert.Equal(2, result.Count);
        Assert.Equal(["1", "2"], result.Single(group => group.Id == "/versionSets/one").Versions.Select(api => api.ApiVersion));
    }

    [Fact]
    public void ResolvesConcreteCountriesVersionWithoutChangingGatewayRouting()
    {
        var result = CatalogService.ResolveVersion([
            Api("apb-api-countries-v1", "APB.API.COUNTRIES", "v1", "/apiVersionSets/ctr-versionset"),
            Api("apb-api-countries-v2", "APB.API.COUNTRIES", "v2", "/apiVersionSets/ctr-versionset")
        ], "apb-api-countries-v1", "v1");

        Assert.Equal("apb-api-countries-v1", result?.Name);
    }

    [Fact]
    public void ResolvesAnotherVisibleVersionFromTheSameVersionSet()
    {
        var result = CatalogService.ResolveVersion([
            Api("countries-v1", "Countries", "1", "/apiVersionSets/countries"),
            Api("countries-v2", "Countries", "2", "/apiVersionSets/countries")
        ], "countries-v1", "v2");

        Assert.Equal("countries-v2", result?.Name);
    }

    [Fact]
    public void RejectsVersionForApiWithoutVersionSet()
    {
        var result = CatalogService.ResolveVersion([Api("plain", "Plain", "", "")], "plain", "v2");
        Assert.Null(result);
    }

    private static ApimApi Api(string name, string displayName, string version, string versionSetId) =>
        new(name, name, displayName, "", version, "", versionSetId, []);
}
