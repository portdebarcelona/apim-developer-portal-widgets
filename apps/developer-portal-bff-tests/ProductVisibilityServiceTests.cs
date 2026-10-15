using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Authorization;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Domain;
using Xunit;

namespace DeveloperPortal.Bff.Tests;

public sealed class ProductVisibilityServiceTests
{
    private readonly ProductVisibilityService _service = new(Options.Create(new PortalAuthorizationOptions()));

    [Fact]
    public void AllowsAuthenticatedDeveloperGroup()
    {
        var groups = new[] { Group("developers", "Developers", "system", "") };
        Assert.True(_service.CanView(groups, User([], isComplete: false)));
    }

    [Fact]
    public void AllowsMatchingExternalEntraGroup()
    {
        var groups = new[] { Group("internal", "APB-APIM-Developers-Internal", "external", "entra-group-id") };
        Assert.True(_service.CanView(groups, User(["entra-group-id"], isComplete: true)));
    }

    [Fact]
    public void DeniesExternalProductWhenOverageCannotBeResolved()
    {
        var groups = new[] { Group("external", "APB-APIM-Developers-External", "external", "entra-group-id") };
        Assert.False(_service.CanView(groups, User(["entra-group-id"], isComplete: false)));
    }

    [Fact]
    public void DeniesProductWithoutMatchingGroups()
    {
        var groups = new[] { Group("guests", "Guests", "system", "") };
        Assert.False(_service.CanView(groups, User([], isComplete: true)));
    }

    [Fact]
    public void AllowsConfiguredPortalAdministrator()
    {
        Assert.True(_service.CanView([], User([], isComplete: false, isAdministrator: true)));
    }

    private static ApimGroup Group(string name, string displayName, string type, string externalId) =>
        new(name, name, displayName, type, externalId);

    private static ResolvedUserGroups User(
        IEnumerable<string> groups,
        bool isComplete,
        bool isAdministrator = false) => new(
            groups.ToHashSet(StringComparer.OrdinalIgnoreCase),
            isComplete,
            isAdministrator);
}
