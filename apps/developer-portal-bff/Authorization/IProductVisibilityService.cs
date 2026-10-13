using PortBarcelona.DeveloperPortal.Bff.Domain;

namespace PortBarcelona.DeveloperPortal.Bff.Authorization;

public interface IProductVisibilityService
{
    bool CanView(IReadOnlyList<ApimGroup> productGroups, ResolvedUserGroups userGroups);
}
