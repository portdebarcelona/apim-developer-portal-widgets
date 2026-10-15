namespace PortBarcelona.DeveloperPortal.Bff.Configuration;

public sealed class ApimOptions
{
    public const string SectionName = "Apim";
    public string SubscriptionId { get; set; } = "";
    public string ResourceGroup { get; set; } = "";
    public string ServiceName { get; set; } = "";
    public string ManagementEndpoint { get; set; } = "https://management.azure.com";
    public string ApiVersion { get; set; } = "2024-05-01";
    public int MaxPaginationPages { get; set; } = 1000;

    public string ServiceResourcePath =>
        $"/subscriptions/{Uri.EscapeDataString(SubscriptionId)}" +
        $"/resourceGroups/{Uri.EscapeDataString(ResourceGroup)}" +
        $"/providers/Microsoft.ApiManagement/service/{Uri.EscapeDataString(ServiceName)}";
}
