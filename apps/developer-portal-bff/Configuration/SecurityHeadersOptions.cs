namespace PortBarcelona.DeveloperPortal.Bff.Configuration;

public sealed class SecurityHeadersOptions
{
    public const string SectionName = "SecurityHeaders";
    public string[] ConnectSources { get; set; } =
        ["https://login.microsoftonline.com", "https://apim-cmn-core.azure-api.net"];
}
