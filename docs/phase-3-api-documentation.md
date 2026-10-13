# Phase 3: API documentation

Phase 3 keeps the Phase 2 trust boundary:

```text
Vue SPA -> authenticated .NET 8 BFF -> DefaultAzureCredential -> APIM ARM API
```

The browser receives an OpenAPI document only after the BFF resolves the requested API,
version and revision against that user's visibility-filtered product catalog. It never
receives an ARM credential or management-plane access token.

## Endpoints and authorization contract

`GET /api/catalog/apis/{apiId}/openapi` accepts optional `version` and `revision`
query parameters. The route requires the portal bearer token. It returns:

- `401` when the portal user is not authenticated;
- `404` when the API, version or revision is unknown **or is not visible** to the user;
- `200 application/json` for a valid OpenAPI/Swagger document;
- `502` when APIM cannot export a valid document.

Using the same `404` for hidden and unknown resources prevents catalog enumeration.
Authorization is evaluated before every cache lookup. Only specifications are cached;
user visibility decisions are not.

## APIM export

The BFF calls the APIM management API with `format=openapi+json-link&export=true` and
API version `2024-05-01`. It supports an inline specification, an inline JSON string,
and APIM's short-lived `value.link` response. Temporary links must use HTTPS and an
allow-listed host suffix (by default `.blob.core.windows.net`), and are fetched without
the ARM Authorization header. The result must contain an OpenAPI `openapi` or Swagger
`swagger` marker before it is returned or cached.

The bounded memory cache defaults to 50 documents for 15 minutes. Its key includes the
resolved concrete API name, API version and revision.

## Scalar and Swagger UI

- The catalog APIM action opens the configured managed portal's native
  `/api-details#api=...&version=...&operation=...` experience.
- `/api/:apiId/scalar?version=v1` uses the locally bundled Scalar Vue component.
- `/api/:apiId/swagger?version=v1` uses the locally bundled Swagger UI distribution.
- both fetch the specification through the authenticated BFF;
- both use Authorization Code + PKCE when an OAuth2 authorization-code flow exists;
- scopes, including API-specific `api://.../.default` values, come from the document;
- valid API-specific OAuth provider URLs remain authoritative; missing, malformed, or
  `example.com` placeholder authorization/token/discovery URLs are replaced in the
  browser-only viewer copy with the configured Entra v2 tenant endpoints;
- Scalar receives `https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration`
  as its OAuth metadata URL, so its built-in `example.com` empty-field placeholder is
  never presented as the configured value; the production build also replaces Scalar's
  bundled OAuth/OIDC placeholder literals with that environment-derived metadata URL;
- no client secret is accepted or stored, and authorization is not persisted locally.

The Scalar/Swagger rendering copy suppresses only APIM's standard generated
subscription-key schemes (`apiKeyHeader`/`apiKeyQuery`, or the exact
`Ocp-Apim-Subscription-Key` header and `subscription-key` query definitions).
API-owned `apiKey` schemes remain visible, and the OpenAPI returned by the BFF and
stored in APIM are unchanged. The legacy managed portal obtains a user's subscription
context inside APIM; the standalone BFF currently has no equivalent user-subscription/
key endpoint or user mapping. Do not solve this by embedding a key in Vite
configuration, the JavaScript bundle, or static files, and do not expose an APIM master
key. Automatic resolution requires a separately designed, authenticated BFF flow that
resolves only the current user's authorized APIM subscription and returns or proxies
credentials with an explicitly reviewed lifecycle.

The documentation OAuth client is separate from the portal-login SPA. Its public IDs
are supplied by environment variables. For each standalone portal origin, register
these exact SPA redirect URIs on documentation client
`76e21c21-a10d-45c2-ac0f-3d4e240a228c`:

```text
<VITE_DOCS_REDIRECT_BASE_URL>/oauth2/scalar-callback
<VITE_DOCS_REDIRECT_BASE_URL>/oauth2/swagger-callback.html
```

For local development these are:

```text
http://localhost:5173/oauth2/scalar-callback
http://localhost:5173/oauth2/swagger-callback.html
```

The Entra registration must be a public SPA client, allow authorization-code PKCE,
and have delegated permissions/consent for every scope users are expected to exercise.
Do not add a client secret to frontend or BFF configuration.

## Configuration

Required frontend production variables:

```text
VITE_AUTH_MODE=entra
VITE_ENTRA_CLIENT_ID=<standalone-portal-SPA-application-client-id>
VITE_ENTRA_TENANT_ID=3b6f65fd-e602-4e25-a81a-eb5ef7376512
VITE_BFF_SCOPE=<delegated-scope-exposed-by-the-BFF-app-registration>
VITE_BFF_BASE_URL=<public-HTTPS-BFF-origin, or empty only for a same-origin proxy>
VITE_APIM_PORTAL_URL=https://apim-cmn-core.developer.azure-api.net/
VITE_APIM_GATEWAY_URL=https://apim-cmn-core.azure-api.net/
VITE_DOCS_CLIENT_ID=76e21c21-a10d-45c2-ac0f-3d4e240a228c
VITE_DOCS_TENANT_ID=3b6f65fd-e602-4e25-a81a-eb5ef7376512
VITE_DOCS_REDIRECT_BASE_URL=<public-HTTPS-SPA-origin, with no trailing slash>
```

Required BFF production variables (checked-in APIM values are defaults, but explicit
deployment settings are recommended):

```text
ASPNETCORE_ENVIRONMENT=Production
AUTHENTICATION_MODE=Entra
ENTRA_TENANT_ID=3b6f65fd-e602-4e25-a81a-eb5ef7376512
ENTRA_BFF_AUDIENCE=<BFF application ID URI/audience>
APIM_SUBSCRIPTION_ID=8b72e64a-ae1a-4ac3-9960-dda8ee63d59e
APIM_RESOURCE_GROUP=rg-common-core
APIM_SERVICE_NAME=apim-cmn-core
Cors__AllowedOrigins__0=<public-HTTPS-SPA-origin>
```

Set `AZURE_CLIENT_ID=<user-assigned-managed-identity-client-id>` only when the BFF
uses a user-assigned identity; omit it for a system-assigned identity. No Azure client
secret is used. BFF tuning and CSP configuration use normal ASP.NET Core double-
underscore environment keys:

```text
OpenApi__CacheEntryLimit
OpenApi__CacheDurationMinutes
OpenApi__MaxDocumentBytes
OpenApi__ExportFormat
OpenApi__AllowedTemporaryLinkHostSuffixes__0
SecurityHeaders__ConnectSources__0
SecurityHeaders__ConnectSources__1
```

The BFF managed identity needs APIM management-plane permission that includes
`Microsoft.ApiManagement/service/apis/read` on `apim-cmn-core` (for example, the
least-privileged applicable APIM read role at the service scope).

Mock authentication is fail-closed outside the ASP.NET Core `Development`
environment. Production must use `AUTHENTICATION_MODE=Entra` (or omit the key,
because Entra is the default) and must set `ENTRA_TENANT_ID` and
`ENTRA_BFF_AUDIENCE`. Production responses also enable HSTS.

## Security headers

The BFF emits a CSP prepared for locally bundled Scalar/Swagger assets, Entra login,
and configured API origins. The production frontend host/CDN must emit the equivalent
policy because the SPA and BFF may be deployed separately. Keep `script-src` restricted
to `self`; `style-src 'unsafe-inline'` is currently needed by the documentation UIs;
allow Entra under `frame-src`; and list only approved test-request origins under
`connect-src`. Also preserve `nosniff`, `no-referrer`, a restrictive permissions policy,
and `frame-ancestors 'none'`.

## Local commands

Copy `.env.example` to `.env`, then run:

The frontend requires Node.js 22 or newer (Scalar's current supported runtime).

```powershell
dotnet run --project apps/developer-portal-bff
cd apps/developer-portal
npm install
npm run dev
```

Verification:

```powershell
dotnet test DeveloperPortal.slnx
cd apps/developer-portal; npm test; npm run build
cd ../../azure-api-management-widget-cw-apislist; npm run build
cd ../azure-api-management-widget-cw-apisperapp; npm run build
cd ../azure-api-management-widget-cw-prodbygroups; npm run build
git diff --check
```

## Remaining validation

- Register and validate both redirect URIs for each deployed portal origin.
- Verify the documentation client has consent for each API-specific scope.
- Assign/confirm the BFF managed identity's APIM read/export permission.
- Exercise Scalar and Swagger against live `apim-cmn-core`, including cancellation,
  expiry/reauthorization and CORS for each API's test-request origin.
- Confirm every APIM definition exposes correct OAuth URLs and scopes; APIs without
  authorization-code metadata remain viewable but cannot synthesize an OAuth grant.
- Apply the documented CSP at the actual SPA host and add only explicitly approved
  non-APIM API origins to `connect-src`.

The existing `/ctr/v1/v1/...` Countries gateway path is not rewritten or normalized.
Phase 3 only exports and renders the APIM document.
