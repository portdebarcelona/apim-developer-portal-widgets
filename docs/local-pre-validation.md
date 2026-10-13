# Local validation against legacy PRE APIM

This profile runs the standalone Vue SPA and .NET BFF locally against the
existing `apim-cmn-pre` service. It is read-only and does not replace or modify
the Phase 4 Core deployment configuration, Bicep templates, or PRE parameters.

## Target and request flow

```text
Browser http://localhost:5173
  -> Microsoft Entra ID authorization code + PKCE
  -> delegated BFF access token
  -> Vite same-origin /api proxy
  -> BFF https://localhost:7247
  -> DefaultAzureCredential / Azure CLI
  -> ARM reads for apim-cmn-pre
```

The browser receives only the BFF catalog and OpenAPI responses. It never
receives an ARM token or calls `management.azure.com`.

Local target:

- subscription: `1b2f2b67-bfca-4ccc-87ee-f887cf98d217`
- resource group: `rg-apimgmt`
- APIM service: `apim-cmn-pre`
- gateway: `https://apim-cmn-pre.azure-api.net/`
- managed portal: `https://apim-cmn-pre.developer.azure-api.net/`
- tenant: `3b6f65fd-e602-4e25-a81a-eb5ef7376512`

## Prerequisites

- Node.js 22 or newer and npm.
- .NET 8 SDK.
- Azure CLI signed into the target tenant.
- The local ASP.NET Core HTTPS development certificate trusted.
- API Management Service Reader access, or an equivalent custom read-only role,
  on the exact `apim-cmn-pre` service.
- The SPA registration `77d0c0da-28fa-497c-abb1-92e4467e3fcb` must contain
  `http://localhost:5173` as an SPA redirect URI and be allowed the delegated
  BFF scope `api://6e5d71ad-3705-455b-bb0d-779331e46c78/access_as_user`.
- The BFF registration must expose that enabled delegated scope and emit the
  Entra group claims required by the current authorization model.

Sign in and select the test subscription:

```powershell
az login --tenant 3b6f65fd-e602-4e25-a81a-eb5ef7376512
az account set --subscription 1b2f2b67-bfca-4ccc-87ee-f887cf98d217
az account show --query '{subscription:id, tenant:tenantId, user:user.name}'
dotnet dev-certs https --trust
```

`DefaultAzureCredential` runs only in the BFF. This local profile selects its
Azure CLI credential explicitly so the identity shown by `az account show` is
the one used for ARM. Do not create a browser ARM application or put an ARM token
in any `VITE_*` value.

## Configure and start the BFF with real Entra authentication

From the repository root:

```powershell
dotnet run `
  --project apps/developer-portal-bff/DeveloperPortal.Bff.csproj `
  --launch-profile https-local-pre-entra
```

The profile sets:

```text
ASPNETCORE_ENVIRONMENT=Development
AUTHENTICATION_MODE=Entra
ENTRA_TENANT_ID=3b6f65fd-e602-4e25-a81a-eb5ef7376512
ENTRA_BFF_AUDIENCE=api://6e5d71ad-3705-455b-bb0d-779331e46c78
APIM_SUBSCRIPTION_ID=1b2f2b67-bfca-4ccc-87ee-f887cf98d217
APIM_RESOURCE_GROUP=rg-apimgmt
APIM_SERVICE_NAME=apim-cmn-pre
AZURE_TOKEN_CREDENTIALS=AzureCliCredential
SecurityHeaders__ConnectSources__1=https://apim-cmn-pre.azure-api.net
Catalog__CacheDurationMinutes=10
Catalog__MaxConcurrentProductRequests=8
```

Verify `https://localhost:7247/healthz` returns `Healthy` before starting the
SPA. The BFF validates token issuer, signing key, audience, and lifetime. The
current BFF registration emits v1 access tokens, so validation accepts only the
exact v1 and v2 issuers for this tenant while retaining the single configured
`api://...` audience. APIM
management requests use the signed-in Azure CLI identity independently through
`DefaultAzureCredential`; neither the delegated user token nor the ARM token is
forwarded to the browser or reused for the other trust boundary.

## Configure and start the SPA with real Entra authentication

Create the ignored local mode file once:

```powershell
Copy-Item .env.local-pre.example .env.local-pre
```

Review it, then start Vite:

```powershell
Set-Location apps/developer-portal
npm ci
npm run dev:local-pre
```

Open `http://localhost:5173`. An anonymous user sees the legacy-style sign-in
page. **Iniciar sesión con Microsoft Entra ID** starts an MSAL popup against:

```text
https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/oauth2/v2.0/authorize
```

MSAL uses authorization code + PKCE and requests exactly:

```text
api://6e5d71ad-3705-455b-bb0d-779331e46c78/access_as_user
```

Keep `VITE_BFF_BASE_URL` empty: Vite proxies `/api` and `/healthz` to
`https://localhost:7247`, preserving same-origin browser calls. MSAL owns the
account and token cache in `localStorage`, allowing protected Scalar/Swagger
links opened in another tab to restore the same active account and use
`acquireTokenSilent`. MSAL account-storage events synchronize login/logout state
between open tabs. The application never reads, copies, or stores access tokens
itself. Logout clears the active MSAL account/session through `MsalAuthClient`.

## Retained mock local PRE profile

Mock testing remains available and cannot run in Production. Create its ignored
mode file and start the matching BFF/SPA profiles:

```powershell
Copy-Item .env.local-pre-mock.example .env.local-pre-mock
dotnet run `
  --project apps/developer-portal-bff/DeveloperPortal.Bff.csproj `
  --launch-profile https-local-pre
```

In a second terminal:

```powershell
Set-Location apps/developer-portal
npm run dev:local-pre-mock
```

`VITE_MOCK_AUTH_STATE=anonymous` starts on the sign-in page;
`authenticated` starts as the local mock administrator.

The first catalog request builds a shared APIM metadata snapshot. API and
product lists, bulk API/tag associations, and bounded product associations are
cached for 10 minutes by default. User groups and product visibility are still
evaluated for every request. Concurrent cold requests share one metadata load;
later navigation between APIs, Applications, and Teams reuses the snapshot.

Override the metadata TTL (5-15 minutes) or product request concurrency (1-16)
with `Catalog__CacheDurationMinutes` and
`Catalog__MaxConcurrentProductRequests`. The BFF logs segment timings and an
ARM request count for each metadata refresh without logging credentials.

## Manual validation checklist

### APIs

- The complete catalog loads without direct browser requests to Azure ARM.
- Search, tags, card/table views, paging, and version selectors work.
- Compare the total and several final-page entries with the legacy portal to
  catch incomplete `nextLink` traversal.
- If `APB.API.COUNTRIES` is present, select `v1` and confirm its APIM identity and
  existing `/ctr/v1/v1/...` gateway route remain unchanged.
- The APIM action opens the native `apim-cmn-pre` managed-portal details page.

### Applications

- APIs are grouped only by `app:<application-name>` tags.
- Search and version selection continue to work inside groups.
- APIs with multiple tags or no application tag behave as expected.

### Teams

- Product/team groups load and contain the expected APIs.
- Product pagination is complete.
- `/api/me` reports whether group resolution is complete.
- Direct `groups` claims are matched against APIM external-group IDs.
- If the token contains `hasgroups` or a groups entry in `_claim_names`, Graph
  overage resolution is required. Graph is intentionally not configured yet,
  so external-group products fail closed and the BFF logs a warning.

### Scalar

- Open `/api/<api-id>/scalar`, including `?version=<version>` when applicable.
- The document title, version, description, servers, operations, and security
  schemes render from the BFF OpenAPI endpoint.
- Browser developer tools show the spec coming from local `/api/catalog/...`,
  never from Azure ARM.
- OAuth authorization requires the localhost Scalar redirect to already be
  registered on the documentation client; spec viewing does not.

### Swagger

- Open `/api/<api-id>/swagger`, including `?version=<version>` when applicable.
- Confirm the same API/version renders and the physical Swagger OAuth callback
  asset loads.
- OAuth authorization requires
  `http://localhost:5173/oauth2/swagger-callback.html` to already be registered;
  do not create it merely for catalog/spec validation.

Documentation OAuth remains separate from portal login. Client
`76e21c21-a10d-45c2-ac0f-3d4e240a228c` requires these SPA redirect URIs:

```text
http://localhost:5173/oauth2/scalar-callback
http://localhost:5173/oauth2/swagger-callback.html
```

## Read-only boundary

The BFF client implemented by this repository issues ARM `GET` and APIM export
requests only. Do not run legacy widget deployment scripts, Bicep deployment
commands, `az apim` mutation commands, or any API/product/tag/policy/portal update
during this validation.

Stop both local processes with `Ctrl+C`. `.env.local-pre` remains ignored and
must never contain credentials or tokens.
