namespace PortBarcelona.DeveloperPortal.Bff.Configuration;

public sealed class CatalogOptions
{
    public const string SectionName = "Catalog";
    public int CacheDurationMinutes { get; set; } = 10;
    public int MaxConcurrentProductRequests { get; set; } = 8;
}
