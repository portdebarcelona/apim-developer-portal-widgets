namespace PortBarcelona.DeveloperPortal.Bff.Configuration;

public sealed class OpenApiOptions
{
    public const string SectionName = "OpenApi";
    public int CacheEntryLimit { get; set; } = 50;
    public int CacheDurationMinutes { get; set; } = 15;
    public int MaxDocumentBytes { get; set; } = 10 * 1024 * 1024;
    public string ExportFormat { get; set; } = "openapi+json-link";
    public string[] AllowedTemporaryLinkHostSuffixes { get; set; } = [".blob.core.windows.net"];
}
