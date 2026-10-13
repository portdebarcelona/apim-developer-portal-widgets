using System.Net;
using System.Text;
using Azure.Core;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Infrastructure.Apim;
using Xunit;

namespace DeveloperPortal.Bff.Tests;

public sealed class ArmApimManagementClientTests
{
    [Fact]
    public async Task TraversesEveryTrustedNextLink()
    {
        var handler = new QueueHandler([
            Json("""{"value":[{"id":"one","name":"one","properties":{"displayName":"One","state":"published"}}],"nextLink":"https://management.azure.com/subscriptions/8b72e64a-ae1a-4ac3-9960-dda8ee63d59e/resourceGroups/rg-common-core/providers/Microsoft.ApiManagement/service/apim-cmn-core/products?page=2"}"""),
            Json("""{"value":[{"id":"two","name":"two","properties":{"displayName":"Two","state":"published"}}]}""")
        ]);
        var client = CreateClient(handler);

        var products = await client.ListProductsAsync(CancellationToken.None);

        Assert.Equal(["one", "two"], products.Select(product => product.Name));
        Assert.All(handler.Requests, uri => Assert.Contains("api-version=2024-05-01", uri.Query));
    }

    [Fact]
    public async Task RejectsUntrustedNextLink()
    {
        var handler = new QueueHandler([
            Json("""{"value":[],"nextLink":"https://attacker.example/steal"}""")
        ]);
        var client = CreateClient(handler);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            client.ListProductsAsync(CancellationToken.None));
        Assert.Contains("untrusted origin", error.Message);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task DetectsRepeatedNextLink()
    {
        const string repeated = "https://management.azure.com/subscriptions/8b72e64a-ae1a-4ac3-9960-dda8ee63d59e/resourceGroups/rg-common-core/providers/Microsoft.ApiManagement/service/apim-cmn-core/products?api-version=2024-05-01";
        var handler = new QueueHandler([
            Json($"{{\"value\":[],\"nextLink\":\"{repeated}\"}}"),
            Json($"{{\"value\":[],\"nextLink\":\"{repeated}\"}}")
        ]);
        var client = CreateClient(handler);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            client.ListProductsAsync(CancellationToken.None));
    }

    [Fact]
    public async Task ListsApiTagAssociationsAcrossPages()
    {
        const string secondPage = "https://management.azure.com/subscriptions/8b72e64a-ae1a-4ac3-9960-dda8ee63d59e/resourceGroups/rg-common-core/providers/Microsoft.ApiManagement/service/apim-cmn-core/apisByTags?includeNotTaggedApis=true&$skip=100";
        var handler = new QueueHandler([
            Json("""{"value":[{"tag":{"name":"app:Countries","properties":{"displayName":"app:Countries"}},"api":{"id":"/apis/countries-v1","name":"countries-v1","properties":{}}}],"nextLink":"SECOND_PAGE"}"""
                .Replace("SECOND_PAGE", secondPage, StringComparison.Ordinal)),
            Json("""{"value":[{"tag":{"name":"env:PRE","properties":{"displayName":"env:PRE"}},"api":{"id":"/apis/countries-v1","name":"countries-v1","properties":{}}}]}""")
        ]);

        var associations = await CreateClient(handler).ListApiTagAssociationsAsync(CancellationToken.None);

        Assert.Equal(2, associations.Count);
        Assert.All(associations, association => Assert.Equal("countries-v1", association.ApiId));
        Assert.Equal(["app:Countries", "env:PRE"], associations.Select(association => association.TagName));
        Assert.All(handler.Requests, uri => Assert.Contains("api-version=2024-05-01", uri.Query));
    }

    [Fact]
    public async Task ExportsInlineOpenApiJson()
    {
        var handler = new QueueHandler([
            Json("""{"format":"openapi+json","value":{"openapi":"3.0.1","info":{"title":"Countries","version":"v1"},"paths":{}}}""")
        ]);

        var result = await CreateClient(handler).ExportOpenApiAsync("apb-api-countries-v1", CancellationToken.None);

        Assert.Contains("\"openapi\":\"3.0.1\"", result);
        Assert.Contains("format=openapi%2Bjson-link", handler.Requests.Single().Query);
    }

    [Fact]
    public async Task FetchesTemporaryExportLinkWithoutArmAuthorization()
    {
        var handler = new QueueHandler([
            Json("""{"format":"openapi-link","value":{"link":"https://exports.blob.core.windows.net/specs/countries.json?sig=redacted"}}"""),
            Json("""{"openapi":"3.0.1","info":{"title":"Countries","version":"v1"},"paths":{}}""")
        ]);

        var result = await CreateClient(handler).ExportOpenApiAsync("apb-api-countries-v1", CancellationToken.None);

        Assert.Contains("Countries", result);
        Assert.Equal("Bearer", handler.AuthorizationSchemes[0]);
        Assert.Null(handler.AuthorizationSchemes[1]);
    }

    [Fact]
    public async Task FetchesTemporaryExportLinkFromLegacyArmResourceEnvelope()
    {
        var handler = new QueueHandler([
            Json("""{"id":"api","type":"Microsoft.ApiManagement/service/apis","name":"countries","properties":{"format":"openapi+json-link","value":{"link":"https://exports.blob.core.windows.net/specs/countries.json?sig=redacted"}}}"""),
            Json("""{"openapi":"3.0.1","info":{"title":"Countries","version":"v1"},"paths":{}}""")
        ]);

        var result = await CreateClient(handler).ExportOpenApiAsync("apb-api-countries-v1", CancellationToken.None);

        Assert.Contains("Countries", result);
        Assert.Equal("Bearer", handler.AuthorizationSchemes[0]);
        Assert.Null(handler.AuthorizationSchemes[1]);
    }

    [Fact]
    public async Task RejectsMalformedExport()
    {
        var handler = new QueueHandler([Json("""{"format":"openapi+json","value":{"info":{}}}""")]);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateClient(handler).ExportOpenApiAsync("broken", CancellationToken.None));
    }

    private static ArmApimManagementClient CreateClient(HttpMessageHandler handler) => new(
        new HttpClient(handler),
        new StaticCredential(),
        Options.Create(new ApimOptions
        {
            SubscriptionId = "8b72e64a-ae1a-4ac3-9960-dda8ee63d59e",
            ResourceGroup = "rg-common-core",
            ServiceName = "apim-cmn-core"
        }),
        Options.Create(new OpenApiOptions()),
        NullLogger<ArmApimManagementClient>.Instance);

    private static HttpResponseMessage Json(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    private sealed class StaticCredential : TokenCredential
    {
        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken) =>
            new("test-token", DateTimeOffset.MaxValue);

        public override ValueTask<AccessToken> GetTokenAsync(
            TokenRequestContext requestContext,
            CancellationToken cancellationToken) => ValueTask.FromResult(GetToken(requestContext, cancellationToken));
    }

    private sealed class QueueHandler(IEnumerable<HttpResponseMessage> responses) : HttpMessageHandler
    {
        private readonly Queue<HttpResponseMessage> _responses = new(responses);
        public List<Uri> Requests { get; } = [];
        public List<string?> AuthorizationSchemes { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri!);
            AuthorizationSchemes.Add(request.Headers.Authorization?.Scheme);
            return Task.FromResult(_responses.Dequeue());
        }
    }
}
