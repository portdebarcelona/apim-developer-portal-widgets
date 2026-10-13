using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Domain;

namespace PortBarcelona.DeveloperPortal.Bff.Authorization;

public sealed class ProductVisibilityService : IProductVisibilityService
{
    private readonly PortalAuthorizationOptions _options;

    public ProductVisibilityService(IOptions<PortalAuthorizationOptions> options) => _options = options.Value;

    public bool CanView(IReadOnlyList<ApimGroup> productGroups, ResolvedUserGroups userGroups)
    {
        if (userGroups.IsAdministrator) return true;

        foreach (var group in productGroups)
        {
            if (_options.AuthenticatedApimGroups.Contains(group.Name) ||
                _options.AuthenticatedApimGroups.Contains(group.DisplayName))
                return true;

            if (!userGroups.IsComplete || string.IsNullOrWhiteSpace(group.ExternalId))
                continue;

            if (ExternalIdCandidates(group.ExternalId).Any(userGroups.EntraGroupObjectIds.Contains))
                return true;
        }

        return false;
    }

    private static IEnumerable<string> ExternalIdCandidates(string externalId)
    {
        yield return externalId;
        var lastSegment = externalId.TrimEnd('/').Split('/').LastOrDefault();
        if (!string.IsNullOrWhiteSpace(lastSegment) && !string.Equals(lastSegment, externalId, StringComparison.Ordinal))
            yield return Uri.UnescapeDataString(lastSegment);
    }
}
