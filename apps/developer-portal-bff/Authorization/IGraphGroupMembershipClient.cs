using System.Security.Claims;

namespace PortBarcelona.DeveloperPortal.Bff.Authorization;

public interface IGraphGroupMembershipClient
{
    Task<IReadOnlySet<string>?> GetTransitiveGroupIdsAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken);
}

public sealed class UnconfiguredGraphGroupMembershipClient : IGraphGroupMembershipClient
{
    public Task<IReadOnlySet<string>?> GetTransitiveGroupIdsAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken) => Task.FromResult<IReadOnlySet<string>?>(null);
}
