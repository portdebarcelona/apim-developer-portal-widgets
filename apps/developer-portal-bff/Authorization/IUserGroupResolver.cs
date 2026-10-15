using System.Security.Claims;
using PortBarcelona.DeveloperPortal.Bff.Domain;

namespace PortBarcelona.DeveloperPortal.Bff.Authorization;

public interface IUserGroupResolver
{
    Task<ResolvedUserGroups> ResolveAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
}
