using System.Security.Claims;
using System.Diagnostics;
using System.Text.RegularExpressions;
using PortBarcelona.DeveloperPortal.Bff.Authorization;
using PortBarcelona.DeveloperPortal.Bff.Contracts;
using PortBarcelona.DeveloperPortal.Bff.Domain;

namespace PortBarcelona.DeveloperPortal.Bff.Services;

public sealed class CatalogService : ICatalogService
{
    private readonly ICatalogMetadataProvider _metadata;
    private readonly IUserGroupResolver _groupResolver;
    private readonly IProductVisibilityService _visibility;
    private readonly ILogger<CatalogService> _logger;

    public CatalogService(
        ICatalogMetadataProvider metadata,
        IUserGroupResolver groupResolver,
        IProductVisibilityService visibility,
        ILogger<CatalogService> logger)
    {
        _metadata = metadata;
        _groupResolver = groupResolver;
        _visibility = visibility;
        _logger = logger;
    }

    public async Task<IReadOnlyList<ApiGroupContract>> GetApisAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var visible = await GetVisibleApisAsync(user, cancellationToken);
        var timer = Stopwatch.StartNew();
        var result = GroupApis(visible);
        LogMapping("APIs", result.Count, timer);
        return result;
    }

    public async Task<IReadOnlyList<ApplicationContract>> GetApplicationsAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var visible = await GetVisibleApisAsync(user, cancellationToken);
        var timer = Stopwatch.StartNew();
        var applications = new Dictionary<string, List<ApimApi>>(StringComparer.OrdinalIgnoreCase);

        foreach (var api in visible)
        {
            foreach (var application in ExtractApplicationNames(api.Tags))
            {
                if (!applications.TryGetValue(application, out var apis))
                    applications[application] = apis = [];
                apis.Add(api);
            }
        }

        var result = applications
            .OrderBy(item => item.Key, StringComparer.Create(new System.Globalization.CultureInfo("es"), true))
            .Select(item => new ApplicationContract(item.Key, GroupApis(item.Value)))
            .ToArray();
        LogMapping("applications", result.Length, timer);
        return result;
    }

    public async Task<IReadOnlyList<ProductContract>> GetProductsAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var visibleProducts = await GetVisibleProductsAsync(user, cancellationToken);
        var timer = Stopwatch.StartNew();
        var result = visibleProducts.Select(item =>
        {
            var groups = GroupApis(item.Apis);
            return new ProductContract(
                item.Product.Id,
                item.Product.Name,
                item.Product.DisplayName,
                item.Product.Description,
                groups.Count,
                groups);
        }).ToArray();
        LogMapping("products", result.Length, timer);
        return result;
    }

    public async Task<IReadOnlyList<ApiGroupContract>?> GetProductApisAsync(
        string productId,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var products = await GetVisibleProductsAsync(user, cancellationToken);
        var product = products.FirstOrDefault(item => MatchesResource(item.Product.Id, item.Product.Name, productId));
        return product is null ? null : GroupApis(product.Apis);
    }

    public async Task<ApiContract?> GetApiAsync(
        string apiId,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var visible = await GetVisibleApisAsync(user, cancellationToken);
        var api = visible.FirstOrDefault(item => MatchesResource(item.Id, item.Name, apiId));
        return api is null ? null : MapApi(api);
    }

    public async Task<ApimApi?> ResolveVisibleApiAsync(
        string apiId,
        string? version,
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var visible = await GetVisibleApisAsync(user, cancellationToken);
        return ResolveVersion(visible, apiId, version);
    }

    private async Task<IReadOnlyList<VisibleProduct>> GetVisibleProductsAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var groups = await _groupResolver.ResolveAsync(user, cancellationToken);
        var metadata = await _metadata.GetAsync(cancellationToken);
        return metadata.Products
            .Where(product => _visibility.CanView(product.Groups, groups))
            .Select(product => new VisibleProduct(product.Product, product.Apis))
            .ToArray();
    }

    private async Task<IReadOnlyList<ApimApi>> GetVisibleApisAsync(
        ClaimsPrincipal user,
        CancellationToken cancellationToken)
    {
        var products = await GetVisibleProductsAsync(user, cancellationToken);
        return products.SelectMany(product => product.Apis)
            .GroupBy(api => api.Id, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(api => api.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    internal static IReadOnlyList<string> ExtractApplicationNames(IEnumerable<string> tags) => tags
        .Where(tag => tag.StartsWith("app:", StringComparison.Ordinal))
        .Select(tag => tag[4..].Trim())
        .Where(name => name.Length > 0)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

    internal static IReadOnlyList<ApiGroupContract> GroupApis(IEnumerable<ApimApi> apis) => apis
        .GroupBy(api => string.IsNullOrWhiteSpace(api.ApiVersionSetId)
            ? api.DisplayName.Trim().ToLowerInvariant()
            : api.ApiVersionSetId, StringComparer.OrdinalIgnoreCase)
        .Select(group => new ApiGroupContract(
            group.Key,
            group.First().DisplayName,
            group.OrderBy(api => api.ApiVersion.Length > 0 ? api.ApiVersion : api.ApiRevision, NaturalStringComparer.Instance)
                .Select(MapApi)
                .ToArray()))
        .OrderBy(group => group.DisplayName, StringComparer.OrdinalIgnoreCase)
        .ToArray();

    private static ApiContract MapApi(ApimApi api) => new(
        api.Id, api.Name, api.DisplayName, api.Description, api.ApiVersion,
        api.ApiRevision, api.ApiVersionSetId, api.Tags);

    private static bool MatchesResource(string resourceId, string name, string candidate) =>
        string.Equals(name, candidate, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(resourceId, candidate, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(resourceId.TrimEnd('/').Split('/').LastOrDefault(), candidate, StringComparison.OrdinalIgnoreCase);

    private static bool MatchesVersionSet(string versionSetId, string candidate) =>
        !string.IsNullOrWhiteSpace(versionSetId) &&
        (string.Equals(versionSetId, candidate, StringComparison.OrdinalIgnoreCase) ||
         string.Equals(versionSetId.TrimEnd('/').Split('/').LastOrDefault(), candidate, StringComparison.OrdinalIgnoreCase));

    private static bool VersionMatches(string actual, string requested)
    {
        static string Normalize(string value) => value.Trim().TrimStart('v', 'V');
        return string.Equals(actual.Trim(), requested.Trim(), StringComparison.OrdinalIgnoreCase) ||
               string.Equals(Normalize(actual), Normalize(requested), StringComparison.OrdinalIgnoreCase);
    }

    internal static ApimApi? ResolveVersion(IEnumerable<ApimApi> visible, string apiId, string? version)
    {
        var apis = visible.ToArray();
        var requested = apis.FirstOrDefault(item => MatchesResource(item.Id, item.Name, apiId))
            ?? apis.FirstOrDefault(item => MatchesVersionSet(item.ApiVersionSetId, apiId));
        if (requested is null) return null;
        if (string.IsNullOrWhiteSpace(version) || VersionMatches(requested.ApiVersion, version)) return requested;
        if (string.IsNullOrWhiteSpace(requested.ApiVersionSetId)) return null;
        return apis.FirstOrDefault(item =>
            string.Equals(item.ApiVersionSetId, requested.ApiVersionSetId, StringComparison.OrdinalIgnoreCase) &&
            VersionMatches(item.ApiVersion, version));
    }

    private void LogMapping(string view, int count, Stopwatch timer) =>
        _logger.LogInformation(
            "Catalog {View} grouping/mapping completed: {ItemCount} items in {DurationMs} ms",
            view, count, timer.ElapsedMilliseconds);

    private sealed record VisibleProduct(ApimProduct Product, IReadOnlyList<ApimApi> Apis);

    private sealed class NaturalStringComparer : IComparer<string>
    {
        public static readonly NaturalStringComparer Instance = new();
        private static readonly Regex Parts = new("(\\d+)|(\\D+)", RegexOptions.Compiled);

        public int Compare(string? x, string? y)
        {
            var left = Parts.Matches(x ?? "").Select(match => match.Value).ToArray();
            var right = Parts.Matches(y ?? "").Select(match => match.Value).ToArray();
            for (var index = 0; index < Math.Min(left.Length, right.Length); index++)
            {
                var comparison = long.TryParse(left[index], out var leftNumber) && long.TryParse(right[index], out var rightNumber)
                    ? leftNumber.CompareTo(rightNumber)
                    : string.Compare(left[index], right[index], StringComparison.OrdinalIgnoreCase);
                if (comparison != 0) return comparison;
            }
            return left.Length.CompareTo(right.Length);
        }
    }
}
