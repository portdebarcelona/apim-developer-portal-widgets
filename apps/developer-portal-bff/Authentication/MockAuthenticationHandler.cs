using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace PortBarcelona.DeveloperPortal.Bff.Authentication;

public sealed class MockAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string AuthenticationScheme = "LocalMock";
    private readonly IConfiguration _configuration;

    public MockAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IConfiguration configuration) : base(options, logger, encoder) =>
        _configuration = configuration;

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new List<Claim>
        {
            new Claim("oid", "00000000-0000-0000-0000-000000000001"),
            new Claim(ClaimTypes.NameIdentifier, "local-developer"),
            new Claim(ClaimTypes.Name, "Desarrollo local"),
            new Claim("preferred_username", "developer@localhost"),
            new Claim("scp", "access_as_user")
        };
        claims.AddRange((_configuration.GetSection("Authentication:MockRoles").Get<string[]>() ?? [])
            .Where(role => !string.IsNullOrWhiteSpace(role))
            .Select(role => new Claim("roles", role)));
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, AuthenticationScheme));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, AuthenticationScheme)));
    }
}
