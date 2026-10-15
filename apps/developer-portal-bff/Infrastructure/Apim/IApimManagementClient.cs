using PortBarcelona.DeveloperPortal.Bff.Domain;

namespace PortBarcelona.DeveloperPortal.Bff.Infrastructure.Apim;

public interface IApimManagementClient
{
    long RequestCount => 0;
    Task<IReadOnlyList<ApimApi>> ListApisAsync(CancellationToken cancellationToken);
    Task<ApimApi?> GetApiAsync(string apiId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ApimApiTagAssociation>> ListApiTagAssociationsAsync(CancellationToken cancellationToken) =>
        throw new NotSupportedException();
    Task<IReadOnlyList<ApimProduct>> ListProductsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<ApimGroup>> ListProductGroupsAsync(string productId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ApimApi>> ListProductApisAsync(string productId, CancellationToken cancellationToken);
    Task<string> ExportOpenApiAsync(string apiId, CancellationToken cancellationToken);
}
