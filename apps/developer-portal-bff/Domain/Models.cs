namespace PortBarcelona.DeveloperPortal.Bff.Domain;

public sealed record ApimApi(
    string Id,
    string Name,
    string DisplayName,
    string Description,
    string ApiVersion,
    string ApiRevision,
    string ApiVersionSetId,
    IReadOnlyList<string> Tags);

public sealed record ApimGroup(
    string Id,
    string Name,
    string DisplayName,
    string Type,
    string ExternalId);

public sealed record ApimProduct(
    string Id,
    string Name,
    string DisplayName,
    string Description,
    string State,
    bool SubscriptionRequired);

public sealed record ApimApiTagAssociation(
    string ApiId,
    string TagName);

public sealed record ResolvedUserGroups(
    IReadOnlySet<string> EntraGroupObjectIds,
    bool IsComplete,
    bool IsAdministrator);
