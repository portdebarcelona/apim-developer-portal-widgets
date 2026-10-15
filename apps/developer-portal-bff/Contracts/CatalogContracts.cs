namespace PortBarcelona.DeveloperPortal.Bff.Contracts;

public sealed record ApiContract(
    string Id,
    string Name,
    string DisplayName,
    string Description,
    string ApiVersion,
    string ApiRevision,
    string VersionSetId,
    IReadOnlyList<string> Tags);

public sealed record ApiGroupContract(
    string Id,
    string DisplayName,
    IReadOnlyList<ApiContract> Versions);

public sealed record ApplicationContract(
    string Name,
    IReadOnlyList<ApiGroupContract> Apis);

public sealed record ProductContract(
    string Id,
    string Name,
    string DisplayName,
    string Description,
    int ApiCount,
    IReadOnlyList<ApiGroupContract> Apis);

public sealed record CurrentUserContract(
    string Id,
    string DisplayName,
    string Email,
    bool GroupResolutionComplete);
