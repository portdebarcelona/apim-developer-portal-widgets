using System.Security.Claims;
using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Domain;

namespace PortBarcelona.DeveloperPortal.Bff.Authorization;

public sealed class ClaimsUserGroupResolver : IUserGroupResolver
{
    private readonly IGraphGroupMembershipClient _graph;
    private readonly PortalAuthorizationOptions _options;
    private readonly ILogger<ClaimsUserGroupResolver> _logger;

    public ClaimsUserGroupResolver(
        IGraphGroupMembershipClient graph,
        IOptions<PortalAuthorizationOptions> options,
        ILogger<ClaimsUserGroupResolver> logger)
    {
        _graph = graph;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<ResolvedUserGroups> ResolveAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var isAdministrator = user.FindAll("roles")
            .Select(claim => claim.Value)
            .Any(role => _options.AdministratorRoles.Contains(role));
        var tokenGroups = user.FindAll("groups").Select(claim => claim.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var hasOverage = user.HasClaim(claim => claim.Type == "hasgroups") ||
            user.FindFirst("_claim_names")?.Value.Contains("groups", StringComparison.OrdinalIgnoreCase) == true;

        if (!hasOverage)
            return new ResolvedUserGroups(tokenGroups, true, isAdministrator);

        var graphGroups = await _graph.GetTransitiveGroupIdsAsync(user, cancellationToken);
        if (graphGroups is not null)
            return new ResolvedUserGroups(graphGroups, true, isAdministrator);

        _logger.LogWarning(
            "Group claim overage detected for user {ObjectId}, but Graph group resolution is not configured. External-group products will be denied.",
            user.FindFirstValue("oid") ?? user.FindFirstValue(ClaimTypes.NameIdentifier));
        return new ResolvedUserGroups(tokenGroups, false, isAdministrator);
    }
}
