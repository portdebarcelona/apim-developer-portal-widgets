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

    [Fact]
    public async Task StopsUnknownLengthExportAfterReadingLimitPlusOneBytes()
    {
        const int limit = 512;
        using var stream = new CountingReadStream(Encoding.UTF8.GetBytes(new string(' ', limit * 8)));
        var content = new StreamContent(stream);
        Assert.Null(content.Headers.ContentLength);
        var handler = new QueueHandler([
            Json("""{"value":{"link":"https://exports.blob.core.windows.net/specs/countries.json"}}"""),
            new HttpResponseMessage(HttpStatusCode.OK) { Content = content }
        ]);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateClient(handler, limit).ExportOpenApiAsync("countries", CancellationToken.None));

        Assert.Contains("size limit", error.Message);
        Assert.Equal(limit + 1, stream.BytesRead);
        Assert.Equal(2, handler.Requests.Count);
        Assert.Null(handler.AuthorizationSchemes[1]);
    }

    [Theory]
    [InlineData(511)]
    [InlineData(512)]
    public async Task AcceptsUnknownLengthExportAtOrBelowLimit(int documentBytes)
    {
        const string specification = """{"openapi":"3.0.1","info":{"title":"Countries","version":"v1"},"paths":{}}""";
        using var stream = new CountingReadStream(Encoding.UTF8.GetBytes(specification.PadRight(documentBytes)));
        var content = new StreamContent(stream);
        Assert.Null(content.Headers.ContentLength);
        var handler = new QueueHandler([
            Json("""{"value":{"link":"https://exports.blob.core.windows.net/specs/countries.json"}}"""),
            new HttpResponseMessage(HttpStatusCode.OK) { Content = content }
        ]);

        var result = await CreateClient(handler, 512).ExportOpenApiAsync("countries", CancellationToken.None);

        Assert.Contains("\"openapi\":\"3.0.1\"", result);
        Assert.Equal(documentBytes, stream.BytesRead);
    }

    [Fact]
    public async Task RejectsDeclaredOversizedExportWithoutReadingBody()
    {
        using var stream = new CountingReadStream(new byte[1024]);
        var content = new StreamContent(stream);
        content.Headers.ContentLength = 1024;
        var handler = new QueueHandler([new HttpResponseMessage(HttpStatusCode.OK) { Content = content }]);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateClient(handler, 512).ExportOpenApiAsync("countries", CancellationToken.None));

        Assert.Contains("size limit", error.Message);
        Assert.Equal(0, stream.BytesRead);
    }

    [Fact]
    public async Task CapsUnknownLengthErrorResponseWhilePreservingUpstreamStatus()
    {
        using var stream = new CountingReadStream(Encoding.UTF8.GetBytes("upstream unavailable".PadRight(32768)));
        var content = new StreamContent(stream);
        Assert.Null(content.Headers.ContentLength);
        var handler = new QueueHandler([
            new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) { Content = content }
        ]);

        var error = await Assert.ThrowsAsync<HttpRequestException>(() =>
            CreateClient(handler).ExportOpenApiAsync("countries", CancellationToken.None));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, error.StatusCode);
        Assert.Contains("503", error.Message);
        Assert.Contains("upstream unavailable", error.Message);
        Assert.Equal(4096, stream.BytesRead);
        Assert.Single(handler.Requests);
    }

    private static ArmApimManagementClient CreateClient(HttpMessageHandler handler, int maxDocumentBytes = 10 * 1024 * 1024) => new(
        new HttpClient(handler),
        new StaticCredential(),
        Options.Create(new ApimOptions
        {
            SubscriptionId = "8b72e64a-ae1a-4ac3-9960-dda8ee63d59e",
            ResourceGroup = "rg-common-core",
            ServiceName = "apim-cmn-core"
        }),
        Options.Create(new OpenApiOptions { MaxDocumentBytes = maxDocumentBytes }),
        NullLogger<ArmApimManagementClient>.Instance);

    private static HttpResponseMessage Json(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    private sealed class CountingReadStream(byte[] content) : Stream
    {
        private readonly MemoryStream _inner = new(content);
        public int BytesRead { get; private set; }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            var read = _inner.Read(buffer, offset, count);
            BytesRead += read;
            return read;
        }

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            var read = await _inner.ReadAsync(buffer, cancellationToken);
            BytesRead += read;
            return read;
        }

        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing)
        {
            if (disposing) _inner.Dispose();
            base.Dispose(disposing);
        }
    }

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
