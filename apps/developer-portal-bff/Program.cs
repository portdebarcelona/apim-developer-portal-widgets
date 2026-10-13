using System.Security.Claims;
using Azure.Core;
using Azure.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using PortBarcelona.DeveloperPortal.Bff.Authentication;
using PortBarcelona.DeveloperPortal.Bff.Authorization;
using PortBarcelona.DeveloperPortal.Bff.Configuration;
using PortBarcelona.DeveloperPortal.Bff.Contracts;
using PortBarcelona.DeveloperPortal.Bff.Infrastructure.Apim;
using PortBarcelona.DeveloperPortal.Bff.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddPortalOptions(builder.Configuration);
builder.Services.AddHealthChecks();
builder.Services.AddProblemDetails();
builder.Services.AddMemoryCache(options =>
    options.SizeLimit = builder.Configuration.GetValue<int?>("OpenApi:CacheEntryLimit") ?? 50);

var authenticationMode = builder.Configuration["AUTHENTICATION_MODE"]
    ?? builder.Configuration["Authentication:Mode"]
    ?? "Entra";

if (string.Equals(authenticationMode, "Mock", StringComparison.OrdinalIgnoreCase))
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("Mock authentication is permitted only in the Development environment.");

    builder.Services.AddAuthentication(MockAuthenticationHandler.AuthenticationScheme)
        .AddScheme<AuthenticationSchemeOptions, MockAuthenticationHandler>(MockAuthenticationHandler.AuthenticationScheme, _ => { });
}
else
{
    var tenantId = builder.Configuration["ENTRA_TENANT_ID"] ?? builder.Configuration["Authentication:TenantId"];
    var audience = builder.Configuration["ENTRA_BFF_AUDIENCE"] ?? builder.Configuration["Authentication:Audience"];
    if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(audience))
        throw new InvalidOperationException("ENTRA_TENANT_ID and ENTRA_BFF_AUDIENCE are required in Entra authentication mode.");

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.MapInboundClaims = false;
            options.Authority = $"https://login.microsoftonline.com/{tenantId}/v2.0";
            options.Audience = audience;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers =
                [
                    $"https://sts.windows.net/{tenantId}/",
                    $"https://login.microsoftonline.com/{tenantId}/v2.0"
                ],
                ValidateAudience = true,
                ValidAudience = audience,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                NameClaimType = "name",
                RoleClaimType = "roles"
            };
            options.Events = new JwtBearerEvents
            {
                OnTokenValidated = context =>
                {
                    var principal = context.Principal;
                    var hasGroupOverage = principal?.HasClaim(claim => claim.Type == "hasgroups") == true ||
                        principal?.FindFirst("_claim_names")?.Value.Contains(
                            "groups", StringComparison.OrdinalIgnoreCase) == true;
                    var logger = context.HttpContext.RequestServices
                        .GetRequiredService<ILoggerFactory>()
                        .CreateLogger("EntraAuthentication");
                    logger.LogInformation(
                        "Entra {TokenVersion} token validated for object {ObjectId} in tenant {TenantId}: {GroupCount} group claims, overage {HasGroupOverage}, {RoleCount} roles",
                        principal?.FindFirstValue("ver"),
                        principal?.FindFirstValue("oid"),
                        principal?.FindFirstValue("tid"),
                        principal?.FindAll("groups").Count() ?? 0,
                        hasGroupOverage,
                        principal?.FindAll("roles").Count() ?? 0);
                    return Task.CompletedTask;
                },
                OnAuthenticationFailed = context =>
                {
                    var logger = context.HttpContext.RequestServices
                        .GetRequiredService<ILoggerFactory>()
                        .CreateLogger("EntraAuthentication");
                    logger.LogWarning(
                        "Entra token validation failed with {ExceptionType}",
                        context.Exception.GetType().Name);
                    return Task.CompletedTask;
                }
            };
        });
}

builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"];
    if (!builder.Environment.IsDevelopment() &&
        (origins.Length == 0 || origins.Any(origin =>
            !Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)))
        throw new InvalidOperationException("Production CORS origins must be explicit HTTPS origins.");
    policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
}));

builder.Services.AddSingleton<TokenCredential>(_ =>
{
    var managedIdentityClientId = builder.Configuration["AZURE_CLIENT_ID"];
    return new DefaultAzureCredential(new DefaultAzureCredentialOptions
    {
        ManagedIdentityClientId = string.IsNullOrWhiteSpace(managedIdentityClientId) ? null : managedIdentityClientId
    });
});
builder.Services.AddHttpClient<IApimManagementClient, ArmApimManagementClient>()
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<IGraphGroupMembershipClient, UnconfiguredGraphGroupMembershipClient>();
builder.Services.AddScoped<IUserGroupResolver, ClaimsUserGroupResolver>();
builder.Services.AddScoped<IProductVisibilityService, ProductVisibilityService>();
builder.Services.AddSingleton<ICatalogMetadataProvider, CatalogMetadataProvider>();
builder.Services.AddScoped<ICatalogService, CatalogService>();
builder.Services.AddScoped<IOpenApiService, OpenApiService>();

var app = builder.Build();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.Use(async (context, next) =>
{
    var sources = app.Configuration.GetSection("SecurityHeaders:ConnectSources").Get<string[]>() ?? [];
    var connectSources = string.Join(' ', new[] { "'self'" }.Concat(sources));
    context.Response.OnStarting(() =>
    {
        context.Response.Headers.ContentSecurityPolicy =
            $"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            $"img-src 'self' data: blob:; font-src 'self' data:; connect-src {connectSources}; " +
            "frame-src https://login.microsoftonline.com; worker-src 'self' blob:; " +
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; " +
            "form-action 'self' https://login.microsoftonline.com";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        return Task.CompletedTask;
    });
    await next();
});
app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/healthz").AllowAnonymous();

var api = app.MapGroup("/api").RequireAuthorization();

api.MapGet("/me", async (
    ClaimsPrincipal user,
    IUserGroupResolver groups,
    CancellationToken cancellationToken) =>
{
    var resolved = await groups.ResolveAsync(user, cancellationToken);
    return Results.Ok(new CurrentUserContract(
        user.FindFirstValue("oid") ?? user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
        user.FindFirstValue("name") ?? user.Identity?.Name ?? "",
        user.FindFirstValue("preferred_username") ?? user.FindFirstValue(ClaimTypes.Email) ?? "",
        resolved.IsComplete));
});

api.MapGet("/catalog/apis", async (ClaimsPrincipal user, ICatalogService catalog, CancellationToken token) =>
    Results.Ok(await catalog.GetApisAsync(user, token)));

api.MapGet("/catalog/applications", async (ClaimsPrincipal user, ICatalogService catalog, CancellationToken token) =>
    Results.Ok(await catalog.GetApplicationsAsync(user, token)));

api.MapGet("/catalog/products", async (ClaimsPrincipal user, ICatalogService catalog, CancellationToken token) =>
    Results.Ok(await catalog.GetProductsAsync(user, token)));

api.MapGet("/catalog/products/{productId}/apis", async (
    string productId, ClaimsPrincipal user, ICatalogService catalog, CancellationToken token) =>
{
    var result = await catalog.GetProductApisAsync(productId, user, token);
    return result is null ? Results.NotFound() : Results.Ok(result);
});

api.MapGet("/catalog/apis/{apiId}", async (
    string apiId, ClaimsPrincipal user, ICatalogService catalog, CancellationToken token) =>
{
    var result = await catalog.GetApiAsync(apiId, user, token);
    return result is null ? Results.NotFound() : Results.Ok(result);
});

api.MapGet("/catalog/apis/{apiId}/openapi", async (
    string apiId,
    string? version,
    string? revision,
    HttpRequest request,
    ClaimsPrincipal user,
    IOpenApiService openApi,
    ILogger<Program> logger,
    CancellationToken token) =>
{
    var viewerHeader = request.Headers["X-Documentation-Viewer"].FirstOrDefault();
    var viewer = viewerHeader is "scalar" or "swagger" ? viewerHeader : "direct";
    logger.LogInformation(
        "OpenAPI access requested for {ApiId} version {Version} revision {Revision} via {Viewer}",
        apiId, version, revision, viewer);

    try
    {
        var result = await openApi.GetAsync(apiId, version, revision, user, token);
        // Hidden and unknown APIs share the same response to avoid catalog enumeration.
        return result is null
            ? Results.NotFound()
            : Results.Content(result.Content, "application/json");
    }
    catch (OpenApiExportException)
    {
        return Results.Problem(
            statusCode: StatusCodes.Status502BadGateway,
            title: "APIM OpenAPI export failed",
            detail: "The API is visible, but its OpenAPI document could not be exported.");
    }
});

app.Run();

public partial class Program;
