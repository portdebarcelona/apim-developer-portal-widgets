using System.Net;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Encodings.Web;
using System.Security.Claims;
using PortBarcelona.DeveloperPortal.Bff.Services;
using Xunit;

namespace DeveloperPortal.Bff.Tests;

public sealed class AuthenticationEndpointTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("read_catalog")]
    [InlineData("prefixaccess_as_user")]
    [InlineData("access_as_user.extra")]
    [InlineData("ACCESS_AS_USER")]
    public async Task ApiRejectsAuthenticatedPrincipalWithoutExactDelegatedScope(string? scopes)
    {
        await using var factory = CreateScopedAuthenticationFactory();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/me");
        if (scopes is not null) request.Headers.Add("X-Test-Scopes", scopes);

        var response = await CreateHttpsClient(factory).SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("access_as_user")]
    [InlineData("read_catalog access_as_user other_permission")]
    public async Task ApiAcceptsExactDelegatedScopeAmongGrantedScopes(string scopes)
    {
        await using var factory = CreateScopedAuthenticationFactory();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/me");
        request.Headers.Add("X-Test-Scopes", scopes);

        var response = await CreateHttpsClient(factory).SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("scope-test-user", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public void EntraProfileValidatesIssuerSignatureAudienceAndLifetime()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("AUTHENTICATION_MODE", "Entra");
            builder.UseSetting("ENTRA_TENANT_ID", "3b6f65fd-e602-4e25-a81a-eb5ef7376512");
            builder.UseSetting(
                "ENTRA_BFF_AUDIENCE",
                "api://6e5d71ad-3705-455b-bb0d-779331e46c78");
        });

        var options = factory.Services
            .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(JwtBearerDefaults.AuthenticationScheme);

        Assert.Equal(
            "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/v2.0",
            options.Authority);
        Assert.Equal("api://6e5d71ad-3705-455b-bb0d-779331e46c78", options.Audience);
        Assert.True(options.TokenValidationParameters.ValidateIssuer);
        Assert.Contains(
            "https://sts.windows.net/3b6f65fd-e602-4e25-a81a-eb5ef7376512/",
            options.TokenValidationParameters.ValidIssuers!);
        Assert.Contains(
            "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/v2.0",
            options.TokenValidationParameters.ValidIssuers!);
        Assert.True(options.TokenValidationParameters.ValidateIssuerSigningKey);
        Assert.True(options.TokenValidationParameters.ValidateAudience);
        Assert.Equal(
            "api://6e5d71ad-3705-455b-bb0d-779331e46c78",
            options.TokenValidationParameters.ValidAudience);
        Assert.True(options.TokenValidationParameters.ValidateLifetime);
    }

    [Fact]
    public async Task OpenApiEndpointRejectsUnauthenticatedRequest()
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = RejectAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = RejectAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, RejectAuthenticationHandler>(RejectAuthenticationHandler.SchemeName, _ => { });
            });
        });
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync("/api/catalog/apis/apb-api-countries-v1/openapi?version=v1");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task HiddenOpenApiEndpointUsesNonEnumeratingNotFoundContract()
    {
        await using var factory = CreateOpenApiFactory(null);
        var response = await CreateHttpsClient(factory)
            .GetAsync("/api/catalog/apis/hidden-api/openapi");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task VisibleOpenApiEndpointReturnsJson()
    {
        await using var factory = CreateOpenApiFactory(new OpenApiDocument(
            "{\"openapi\":\"3.0.1\",\"info\":{\"title\":\"Countries\",\"version\":\"v1\"},\"paths\":{}}",
            "apb-api-countries-v1", "v1", "1"));
        var response = await CreateHttpsClient(factory)
            .GetAsync("/api/catalog/apis/apb-api-countries-v1/openapi?version=v1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task ExportFailureReturnsBadGateway()
    {
        await using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IOpenApiService>();
                services.AddSingleton<IOpenApiService, FailingOpenApiService>();
            });
        });

        var response = await CreateHttpsClient(factory)
            .GetAsync("/api/catalog/apis/apb-api-countries-v1/openapi?version=v1");

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    private static WebApplicationFactory<Program> CreateOpenApiFactory(OpenApiDocument? result) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IOpenApiService>();
                services.AddSingleton<IOpenApiService>(new StaticOpenApiService(result));
            });
        });

    private static WebApplicationFactory<Program> CreateScopedAuthenticationFactory() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("AUTHENTICATION_MODE", "Mock");
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = ScopedAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = ScopedAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = ScopedAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, ScopedAuthenticationHandler>(
                    ScopedAuthenticationHandler.SchemeName, _ => { });
            });
        });

    private static HttpClient CreateHttpsClient(WebApplicationFactory<Program> factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

    private sealed class StaticOpenApiService(OpenApiDocument? result) : IOpenApiService
    {
        public Task<OpenApiDocument?> GetAsync(
            string apiId, string? version, string? revision, ClaimsPrincipal user, CancellationToken token) =>
            Task.FromResult(result);
    }

    private sealed class FailingOpenApiService : IOpenApiService
    {
        public Task<OpenApiDocument?> GetAsync(
            string apiId, string? version, string? revision, ClaimsPrincipal user, CancellationToken token) =>
            throw new OpenApiExportException("test failure");
    }

    private sealed class ScopedAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "TestScoped";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var claims = new List<Claim> { new("oid", "scope-test-user") };
            if (Request.Headers.TryGetValue("X-Test-Scopes", out var scopes))
                claims.Add(new Claim("scp", scopes.ToString()));
            var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
        }
    }

    private sealed class RejectAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "TestReject";
        protected override Task<AuthenticateResult> HandleAuthenticateAsync() =>
            Task.FromResult(AuthenticateResult.NoResult());
    }
}
