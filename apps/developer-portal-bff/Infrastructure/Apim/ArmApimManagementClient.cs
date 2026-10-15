using System.Net.Http.Headers;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Azure.Core;
using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Domain;

namespace PortBarcelona.DeveloperPortal.Bff.Infrastructure.Apim;

public sealed class ArmApimManagementClient : IApimManagementClient
{
    private static readonly TokenRequestContext ArmTokenContext = new(["https://management.azure.com/.default"]);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;
    private readonly TokenCredential _credential;
    private readonly ApimOptions _options;
    private readonly OpenApiOptions _openApiOptions;
    private readonly Uri _managementEndpoint;
    private readonly ILogger<ArmApimManagementClient> _logger;
    private long _requestCount;

    public ArmApimManagementClient(
        HttpClient httpClient,
        TokenCredential credential,
        IOptions<ApimOptions> options,
        IOptions<OpenApiOptions> openApiOptions,
        ILogger<ArmApimManagementClient> logger)
    {
        _httpClient = httpClient;
        _credential = credential;
        _options = options.Value;
        _openApiOptions = openApiOptions.Value;
        _managementEndpoint = new Uri(_options.ManagementEndpoint.TrimEnd('/') + "/");
        _logger = logger;
    }

    public long RequestCount => Interlocked.Read(ref _requestCount);

    public async Task<IReadOnlyList<ApimApi>> ListApisAsync(CancellationToken cancellationToken)
    {
        var resources = await GetAllAsync<ArmApiResource>($"{_options.ServiceResourcePath}/apis", cancellationToken);
        return resources.Select(MapApi).ToArray();
    }

    public async Task<ApimApi?> GetApiAsync(string apiId, CancellationToken cancellationToken)
    {
        var resource = await GetAsync<ArmApiResource>($"{_options.ServiceResourcePath}/apis/{Escape(apiId)}", cancellationToken);
        return resource is null ? null : MapApi(resource);
    }

    public async Task<IReadOnlyList<ApimApiTagAssociation>> ListApiTagAssociationsAsync(
        CancellationToken cancellationToken)
    {
        var resources = await GetAllAsync<ArmApiTagResource>(
            $"{_options.ServiceResourcePath}/apisByTags?includeNotTaggedApis=true", cancellationToken);
        return resources
            .Where(resource => resource.Api is not null && resource.Tag is not null)
            .Select(resource => new ApimApiTagAssociation(
                ResourceName(resource.Api!.Id, resource.Api.Name),
                resource.Tag!.Properties?.DisplayName ?? resource.Tag.Name ?? ""))
            .Where(association => association.ApiId.Length > 0 && association.TagName.Length > 0)
            .Distinct()
            .ToArray();
    }

    public async Task<IReadOnlyList<ApimProduct>> ListProductsAsync(CancellationToken cancellationToken)
    {
        var resources = await GetAllAsync<ArmProductResource>($"{_options.ServiceResourcePath}/products", cancellationToken);
        return resources.Select(resource => new ApimProduct(
            resource.Id ?? resource.Name ?? "",
            resource.Name ?? "",
            resource.Properties?.DisplayName ?? resource.Name ?? "",
            resource.Properties?.Description ?? "",
            resource.Properties?.State ?? "",
            resource.Properties?.SubscriptionRequired ?? false)).ToArray();
    }

    public async Task<IReadOnlyList<ApimGroup>> ListProductGroupsAsync(string productId, CancellationToken cancellationToken)
    {
        var resources = await GetAllAsync<ArmGroupResource>(
            $"{_options.ServiceResourcePath}/products/{Escape(productId)}/groups", cancellationToken);
        return resources.Select(resource => new ApimGroup(
            resource.Id ?? resource.Name ?? "",
            resource.Name ?? "",
            resource.Properties?.DisplayName ?? resource.Name ?? "",
            resource.Properties?.Type ?? "",
            resource.Properties?.ExternalId ?? "")).ToArray();
    }

    public async Task<IReadOnlyList<ApimApi>> ListProductApisAsync(string productId, CancellationToken cancellationToken)
    {
        var resources = await GetAllAsync<ArmApiResource>(
            $"{_options.ServiceResourcePath}/products/{Escape(productId)}/apis", cancellationToken);
        return resources.Select(MapApi).ToArray();
    }

    public async Task<string> ExportOpenApiAsync(string apiId, CancellationToken cancellationToken)
    {
        var path = $"{_options.ServiceResourcePath}/apis/{Escape(apiId)}" +
                   $"?format={Uri.EscapeDataString(_openApiOptions.ExportFormat)}&export=true";
        using var export = await GetJsonAsync(BuildUri(path), true, cancellationToken);
        var specification = await ResolveExportValueAsync(export.RootElement, cancellationToken);
        return NormalizeOpenApi(specification);
    }

    private async Task<IReadOnlyList<T>> GetAllAsync<T>(string path, CancellationToken cancellationToken)
    {
        var values = new List<T>();
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        Uri? next = BuildUri(path);

        while (next is not null)
        {
            if (visited.Count >= _options.MaxPaginationPages)
                throw new InvalidOperationException("APIM pagination exceeded the configured page limit.");
            if (!visited.Add(next.AbsoluteUri))
                throw new InvalidOperationException($"APIM pagination loop detected for {next}.");
            EnsureTrusted(next);

            var page = await SendAsync<ArmListResponse<T>>(next, cancellationToken);
            values.AddRange(page.Value ?? []);
            next = string.IsNullOrWhiteSpace(page.NextLink) ? null : EnsureApiVersion(new Uri(page.NextLink, UriKind.Absolute));
        }

        return values;
    }

    private async Task<T?> GetAsync<T>(string path, CancellationToken cancellationToken) where T : class
    {
        var uri = BuildUri(path);
        using var request = await CreateRequestAsync(uri, cancellationToken);
        using var response = await SendArmAsync(request, uri, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        await EnsureSuccessAsync(response, cancellationToken);
        return await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken);
    }

    private async Task<T> SendAsync<T>(Uri uri, CancellationToken cancellationToken)
    {
        using var request = await CreateRequestAsync(uri, cancellationToken);
        using var response = await SendArmAsync(request, uri, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        return await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("Azure returned an empty APIM response.");
    }

    private async Task<JsonDocument> GetJsonAsync(Uri uri, bool useArmAuthentication, CancellationToken cancellationToken)
    {
        using var request = useArmAuthentication
            ? await CreateRequestAsync(uri, cancellationToken)
            : CreateAnonymousJsonRequest(uri);
        using var response = useArmAuthentication
            ? await SendArmAsync(request, uri, cancellationToken)
            : await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
        if (response.Content.Headers.ContentLength > _openApiOptions.MaxDocumentBytes)
            throw new InvalidOperationException("APIM OpenAPI export exceeded the configured size limit.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var content = new MemoryStream();
        var buffer = new byte[8192];
        while (true)
        {
            var remaining = (long)_openApiOptions.MaxDocumentBytes - content.Length + 1;
            var read = await stream.ReadAsync(
                buffer.AsMemory(0, (int)Math.Min(buffer.Length, remaining)), cancellationToken);
            if (read == 0) break;
            if (content.Length + read > _openApiOptions.MaxDocumentBytes)
                throw new InvalidOperationException("APIM OpenAPI export exceeded the configured size limit.");
            content.Write(buffer, 0, read);
        }
        return JsonDocument.Parse(content.ToArray());
    }

    private async Task<JsonElement> ResolveExportValueAsync(JsonElement root, CancellationToken cancellationToken)
    {
        if (IsOpenApi(root)) return root.Clone();
        if (root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty("properties", out var properties) &&
            properties.ValueKind == JsonValueKind.Object)
            return await ResolveExportValueAsync(properties, cancellationToken);
        if (!root.TryGetProperty("value", out var value))
        {
            var shape = root.ValueKind == JsonValueKind.Object
                ? string.Join(", ", root.EnumerateObject().Select(property => property.Name))
                : root.ValueKind.ToString();
            throw new InvalidOperationException(
                $"APIM export response did not contain a specification or value. Response shape: {shape}.");
        }

        if (value.ValueKind == JsonValueKind.Object)
        {
            if (IsOpenApi(value)) return value.Clone();
            if (value.TryGetProperty("link", out var linkElement) && linkElement.ValueKind == JsonValueKind.String)
                return await FetchTemporaryExportAsync(linkElement.GetString()!, cancellationToken);
        }

        if (value.ValueKind == JsonValueKind.String)
        {
            var text = value.GetString() ?? "";
            if (Uri.TryCreate(text, UriKind.Absolute, out var link))
                return await FetchTemporaryExportAsync(link.ToString(), cancellationToken);
            using var inline = JsonDocument.Parse(text);
            return inline.RootElement.Clone();
        }

        throw new InvalidOperationException("APIM export response contained an unsupported value.");
    }

    private async Task<JsonElement> FetchTemporaryExportAsync(string value, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps ||
            !_openApiOptions.AllowedTemporaryLinkHostSuffixes.Any(suffix =>
                uri.Host.EndsWith(suffix, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("APIM returned an untrusted OpenAPI export link.");

        using var document = await GetJsonAsync(uri, false, cancellationToken);
        return document.RootElement.Clone();
    }

    private static string NormalizeOpenApi(JsonElement specification)
    {
        if (!IsOpenApi(specification))
            throw new InvalidOperationException("APIM returned malformed OpenAPI JSON.");
        return JsonSerializer.Serialize(specification, JsonOptions);
    }

    private static bool IsOpenApi(JsonElement value) => value.ValueKind == JsonValueKind.Object &&
        (value.TryGetProperty("openapi", out _) || value.TryGetProperty("swagger", out _));

    private static HttpRequestMessage CreateAnonymousJsonRequest(Uri uri)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private async Task<HttpRequestMessage> CreateRequestAsync(Uri uri, CancellationToken cancellationToken)
    {
        EnsureTrusted(uri);
        var token = await _credential.GetTokenAsync(ArmTokenContext, cancellationToken);
        var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private async Task<HttpResponseMessage> SendArmAsync(
        HttpRequestMessage request,
        Uri uri,
        CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref _requestCount);
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var response = await _httpClient.SendAsync(
                request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            _logger.LogInformation(
                "APIM ARM GET {Path} completed with {StatusCode} in {DurationMs} ms",
                uri.AbsolutePath, (int)response.StatusCode, stopwatch.ElapsedMilliseconds);
            return response;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogError(exception,
                "APIM ARM GET {Path} failed after {DurationMs} ms",
                uri.AbsolutePath, stopwatch.ElapsedMilliseconds);
            throw;
        }
    }

    private Uri BuildUri(string path)
    {
        var builder = new UriBuilder(new Uri(_managementEndpoint, path.TrimStart('/')));
        var query = string.IsNullOrWhiteSpace(builder.Query) ? "" : builder.Query.TrimStart('&', '?') + "&";
        builder.Query = $"{query}api-version={Uri.EscapeDataString(_options.ApiVersion)}";
        return builder.Uri;
    }

    private Uri EnsureApiVersion(Uri uri)
    {
        if (uri.Query.Contains("api-version=", StringComparison.OrdinalIgnoreCase)) return uri;
        var builder = new UriBuilder(uri);
        var query = string.IsNullOrWhiteSpace(builder.Query) ? "" : builder.Query.TrimStart('&', '?') + "&";
        builder.Query = $"{query}api-version={Uri.EscapeDataString(_options.ApiVersion)}";
        return builder.Uri;
    }

    private void EnsureTrusted(Uri uri)
    {
        if (!string.Equals(uri.Scheme, _managementEndpoint.Scheme, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(uri.Host, _managementEndpoint.Host, StringComparison.OrdinalIgnoreCase) ||
            uri.Port != _managementEndpoint.Port)
            throw new InvalidOperationException($"Refusing APIM nextLink from untrusted origin: {uri.GetLeftPart(UriPartial.Authority)}");

        if (!uri.AbsolutePath.StartsWith(_options.ServiceResourcePath + "/", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Refusing APIM nextLink outside the configured service: {uri.AbsolutePath}");
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var buffer = new byte[4096];
        var read = await stream.ReadAtLeastAsync(
            buffer, buffer.Length, throwOnEndOfStream: false, cancellationToken: cancellationToken);
        var body = Encoding.UTF8.GetString(buffer, 0, read);
        throw new HttpRequestException(
            $"Azure APIM request failed with status {(int)response.StatusCode}: {body}", null, response.StatusCode);
    }

    private static ApimApi MapApi(ArmApiResource resource) => new(
        resource.Id ?? resource.Name ?? "",
        resource.Name ?? "",
        resource.Properties?.DisplayName ?? resource.Name ?? "",
        resource.Properties?.Description ?? "",
        resource.Properties?.ApiVersion ?? "",
        resource.Properties?.ApiRevision ?? "",
        resource.Properties?.ApiVersionSetId ?? "",
        []);

    private static string Escape(string value) => Uri.EscapeDataString(value);

    private static string ResourceName(string? resourceId, string? fallback) =>
        resourceId?.TrimEnd('/').Split('/').LastOrDefault() ?? fallback ?? "";

    private sealed record ArmListResponse<T>(
        [property: JsonPropertyName("value")] IReadOnlyList<T>? Value,
        [property: JsonPropertyName("nextLink")] string? NextLink);

    private sealed record ArmApiResource(string? Id, string? Name, ArmApiProperties? Properties);
    private sealed record ArmApiProperties(
        string? DisplayName, string? Description, string? ApiVersion,
        string? ApiRevision, string? ApiVersionSetId);
    private sealed record ArmTagResource(string? Name, ArmTagProperties? Properties);
    private sealed record ArmTagProperties(string? DisplayName);
    private sealed record ArmApiTagResource(ArmTagResource? Tag, ArmApiResource? Api);
    private sealed record ArmProductResource(string? Id, string? Name, ArmProductProperties? Properties);
    private sealed record ArmProductProperties(
        string? DisplayName, string? Description, string? State, bool? SubscriptionRequired);
    private sealed record ArmGroupResource(string? Id, string? Name, ArmGroupProperties? Properties);
    private sealed record ArmGroupProperties(string? DisplayName, string? Type, string? ExternalId);
}
