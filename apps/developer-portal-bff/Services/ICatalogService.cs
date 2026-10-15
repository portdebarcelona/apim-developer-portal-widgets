using System.Security.Claims;
using PortBarcelona.DeveloperPortal.Bff.Contracts;
using PortBarcelona.DeveloperPortal.Bff.Domain;

namespace PortBarcelona.DeveloperPortal.Bff.Services;

public interface ICatalogService
{
    Task<IReadOnlyList<ApiGroupContract>> GetApisAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<IReadOnlyList<ApplicationContract>> GetApplicationsAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<IReadOnlyList<ProductContract>> GetProductsAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<IReadOnlyList<ApiGroupContract>?> GetProductApisAsync(string productId, ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<ApiContract?> GetApiAsync(string apiId, ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<ApimApi?> ResolveVisibleApiAsync(
        string apiId, string? version, ClaimsPrincipal user, CancellationToken cancellationToken);
}
