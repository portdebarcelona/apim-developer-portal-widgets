namespace PortBarcelona.DeveloperPortal.Bff.Configuration;

public sealed class PortalAuthorizationOptions
{
    public const string SectionName = "PortalAuthorization";
    public HashSet<string> AuthenticatedApimGroups { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        "developers",
        "Developers"
    };
    public HashSet<string> AdministratorRoles { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        "Portal.Administrator"
    };
}
