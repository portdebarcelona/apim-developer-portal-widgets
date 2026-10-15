using System.Security.Claims;

namespace PortBarcelona.DeveloperPortal.Bff.Services;

public interface IOpenApiService
{
    Task<OpenApiDocument?> GetAsync(
        string apiId, string? version, string? revision, ClaimsPrincipal user, CancellationToken cancellationToken);
}

public sealed record OpenApiDocument(
    string Content,
    string ApiId,
    string ApiVersion,
    string ApiRevision);

public sealed class OpenApiExportException(string message, Exception? innerException = null)
    : Exception(message, innerException);
