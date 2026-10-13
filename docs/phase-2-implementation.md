# Phase 2 implementation: standalone portal and catalog BFF

## Architecture and folder tree

```text
apps/
├── developer-portal/                  # Vue 3 standalone SPA
│   ├── src/
│   │   ├── api/                       # Explicit BFF contracts/client
│   │   ├── auth/                      # MSAL and mock AuthClient adapters
│   │   ├── components/catalog/        # Reusable catalog UI
│   │   ├── composables/
│   │   ├── views/
│   │   └── styles/
│   └── tests/                         # apim-core behavior tests
├── developer-portal-bff/              # ASP.NET Core .NET 8 BFF
│   ├── Authentication/
│   ├── Authorization/
│   ├── Configuration/
│   ├── Contracts/
│   ├── Domain/
│   ├── Infrastructure/Apim/
│   └── Services/
└── developer-portal-bff-tests/        # xUnit authorization/ARM tests
packages/
└── apim-core/                         # Phase 1 client/types/grouping/navigation
```

The browser calls only the BFF. The BFF obtains an ARM token using `DefaultAzureCredential`, calls the APIM management resource, resolves product visibility, and returns narrow catalog contracts. The old managed widgets remain buildable and are not used to host the new application.

## Frontend routes

| Route | Purpose |
| --- | --- |
| `/` | Home and primary navigation |
| `/apis` | Complete visible API catalog |
| `/applications` | Visible APIs grouped by `app:*` tags |
| `/teams` | Visible APIs grouped by APIM product/team |
| Managed portal `/api-details#api=...` | Native APIM details, based on `VITE_APIM_PORTAL_URL` |
| `/api/:apiId/scalar` | Standalone Scalar documentation |
| `/api/:apiId/swagger` | Standalone Swagger UI documentation |

The catalog UI is composed from `ApiCatalog`, `ApiTable`, `ApiCard`, `ApiActions`, `ApiVersionSelector`, `SearchBox`, `Pagination`, `ApplicationGroup`, and `ProductGroup`. Search, responsive table/card views, client paging, descriptions, tags, version selection and all three actions are retained.

## Authentication flow

1. The SPA reads `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`, `VITE_BFF_SCOPE`, and `VITE_BFF_BASE_URL`.
2. `MsalAuthClient` uses MSAL browser authorization code + PKCE. Its MSAL-managed
   `localStorage` cache and account-storage events support authenticated new tabs;
   application code never stores tokens directly. There is no frontend secret.
3. It obtains an access token for the dedicated BFF delegated scope and sends it only to the BFF.
4. ASP.NET Core validates issuer, signature, tenant authority and BFF audience through `JwtBearer`.
5. The BFF uses its own Azure identity through `DefaultAzureCredential`; it never forwards an ARM token to the browser.

`MockAuthClient` and the BFF `LocalMock` authentication scheme are enabled only through explicit local configuration. The documentation/OAuth client `76e21c21-a10d-45c2-ac0f-3d4e240a228c` is not referenced by the new login implementation.

## Authorization and product visibility

For every catalog operation, the BFF:

1. resolves the authenticated user from validated token claims;
2. reads Entra group object IDs from `groups` claims;
3. detects `hasgroups` and `_claim_names.groups` overage indicators;
4. delegates overage resolution to `IGraphGroupMembershipClient`;
5. lists published APIM products and each product's associated APIM groups;
6. allows a product when one of these rules is true:
   - the caller has the configured portal administrator app role;
   - the product is associated with the built-in authenticated `Developers` APIM group;
   - an associated external APIM group's `externalId` matches a resolved Entra group object ID;
7. denies products with no matching group;
8. when overage cannot be resolved, continues to allow only built-in authenticated products and denies external-group matches;
9. builds the API catalog from the union of APIs in visible products, so a management identity's broader ARM visibility never leaks directly to the caller.

`IGraphGroupMembershipClient` is intentionally unconfigured in Phase 2. It is the isolated extension point for a later Graph implementation and prevents Graph permissions from spreading into catalog code.

## BFF endpoints

`GET /healthz` is anonymous. All other endpoints require authentication:

- `GET /api/me`
- `GET /api/catalog/apis`
- `GET /api/catalog/applications`
- `GET /api/catalog/products`
- `GET /api/catalog/products/{productId}/apis`
- `GET /api/catalog/apis/{apiId}`

The applications endpoint extracts exact, case-sensitive `app:` prefixes. Version grouping prefers `apiVersionSetId`; unversioned APIs fall back to a normalized display name. All ARM list operations follow every `nextLink`, add the configured API version when absent, cap the number of pages, detect repeated URLs, and reject a continuation URL outside the configured management origin.

## Local development

Prerequisites: Node.js, .NET 8 SDK or newer, Azure CLI, and ARM read access to `apim-cmn-core`.

```powershell
Copy-Item .env.example .env
az login --tenant 3b6f65fd-e602-4e25-a81a-eb5ef7376512
az account set --subscription 8b72e64a-ae1a-4ac3-9960-dda8ee63d59e

dotnet run --project apps/developer-portal-bff/DeveloperPortal.Bff.csproj --launch-profile https
```

In a second terminal:

```powershell
Set-Location apps/developer-portal
npm install
npm run dev
```

The checked-in development configuration uses mock user authentication, but ARM data still comes from `DefaultAzureCredential`/Azure CLI. Set `AUTHENTICATION_MODE=Entra` and the real Entra variables to exercise token validation.

Verification:

```powershell
Set-Location apps/developer-portal
npm run build
npm test

Set-Location ../..
dotnet build DeveloperPortal.slnx
dotnet test apps/developer-portal-bff-tests/DeveloperPortal.Bff.Tests.csproj
```

## Azure and Entra configuration required

Create a dedicated SPA app registration:

- add exact SPA redirect URIs for localhost and each deployed frontend;
- enable authorization code + PKCE/public client behavior;
- request only the delegated BFF scope;
- configure logout URIs;
- do not create a client secret.

Create/configure a dedicated BFF API registration:

- expose a delegated scope such as `access_as_user`;
- configure the BFF audience and tenant;
- authorize the SPA registration for that scope;
- emit group object IDs if practical and emit the `Portal.Administrator` app role only to intended administrators;
- keep this app separate from the documentation/OAuth application.

For Graph overage support, choose and approve one model before production:

- application permission on the BFF managed identity (for example the minimum permission needed to read transitive group membership), or
- an on-behalf-of implementation whose confidential credential is stored in Key Vault/managed hosting configuration, never source control.

Configure CORS with the exact standalone frontend origins. Configure the deployed service with `APIM_SUBSCRIPTION_ID`, `APIM_RESOURCE_GROUP`, `APIM_SERVICE_NAME`, `ENTRA_TENANT_ID`, and `ENTRA_BFF_AUDIENCE`.

## BFF RBAC

Assign the BFF managed identity **API Management Service Reader Role** (`71522526-b88f-4d52-b57f-d31fc3546d0d`) at the narrow APIM service scope:

```text
/subscriptions/8b72e64a-ae1a-4ac3-9960-dda8ee63d59e/resourceGroups/rg-common-core/providers/Microsoft.ApiManagement/service/apim-cmn-core
```

This provides read access to APIM entities without write access. If governance requires a custom role, restrict it to the exact read operations used for service APIs, tags, products, product API links, and groups. Do not grant Contributor, Owner, subscription-key reads, or credential/list-secret actions.

## Known gaps

- Graph group-overage lookup is an interface with safe-deny fallback; production Graph permissions and implementation remain pending.
- The BFF does not yet map the Entra identity to an APIM user/subscription record. Phase 2 visibility is product-group based, which is the APIM product discovery rule; subscription-status UX can be added after identity mapping is agreed.
- API tag retrieval is one request per visible API. Add bounded parallelism and user-safe caching after measuring the new service.
- No distributed cache, rate limiting, telemetry correlation, deployment manifests, WAF/CDN settings, or production security headers are included yet.
- Mock auth is intentionally convenient for local development and must not be enabled in a deployed environment.
- The legacy packages still have their pre-existing dependency audit/Sass warnings.

## Phase 3: Scalar and Swagger

1. Add an authorized OpenAPI/spec endpoint that first validates API visibility.
2. Define revision/version-to-spec resolution and cache/ETag behavior.
3. Implement Scalar at `/api/:apiId/scalar` and Swagger UI at `/api/:apiId/swagger`.
4. Configure OAuth2 authorization code + PKCE for try-it flows using the documentation client, not the portal login client.
5. Resolve per-API scopes, authorization server metadata, redirect URIs and logout behavior.
6. Keep access tokens in memory where possible and never expose subscription keys or confidential credentials.
7. Add CSP/connect-src/frame-src rules for Entra, the BFF, and APIM gateway.
8. Test version selection, inaccessible APIs, revoked group membership, token renewal, OAuth cancellation/errors, and gateway JWT validation.
