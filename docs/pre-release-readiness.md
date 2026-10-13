# Hosted PRE release readiness

This runbook is for the first hosted deployment of the standalone portal against
the existing legacy/source APIM. It does not replace the separately prepared
Core configuration in `infra/parameters/pre.bicepparam` and it does not modify
APIM or Entra.

## PRE target

- Subscription: `1b2f2b67-bfca-4ccc-87ee-f887cf98d217`
- Deployment resource group: `rg-apimgmt`
- APIM service: `apim-cmn-pre`
- APIM gateway: `https://apim-cmn-pre.azure-api.net/`
- Managed APIM portal: `https://apim-cmn-pre.developer.azure-api.net/`
- Tenant: `3b6f65fd-e602-4e25-a81a-eb5ef7376512`
- SPA client: `77d0c0da-28fa-497c-abb1-92e4467e3fcb`
- BFF client: `6e5d71ad-3705-455b-bb0d-779331e46c78`
- BFF scope: `api://6e5d71ad-3705-455b-bb0d-779331e46c78/access_as_user`
- Documentation client: `76e21c21-a10d-45c2-ac0f-3d4e240a228c`

Use `infra/parameters/pre-legacy.bicepparam`. The BFF, App Service plan, Log
Analytics workspace, and Application Insights are placed in Spain Central.
Azure currently does not advertise Spain Central for `Microsoft.Web/staticSites`,
so the Static Web App is placed in West Europe through the separate
`staticWebAppLocation` parameter.

## Proposed resources

| Resource | Name | Location |
| --- | --- | --- |
| Static Web App | `apb-apim-portal-legacy-pre` | West Europe |
| Linux App Service | `apb-apim-portal-bff-legacy-pre` | Spain Central |
| App Service plan | `asp-apb-apim-portal-bff-legacy-pre` | Spain Central |
| Log Analytics workspace | `log-apb-apim-portal-bff-legacy-pre` | Spain Central |
| Application Insights | `appi-apb-apim-portal-bff-legacy-pre` | Spain Central |
| APIM Service Reader assignment | deterministic GUID | exact `apim-cmn-pre` resource |

All resources are proposed in the existing `rg-apimgmt` resource group. Confirm
that ownership, cost allocation, naming, public-network exposure, and the Free
Static Web Apps/B1 App Service SKUs are approved before deployment.

## Validate and preview

The following commands are operator instructions only. The what-if is read-only;
the create command must not be run until the reviewed what-if is approved.

```powershell
az bicep build --file infra/main.bicep
az bicep lint --file infra/main.bicep

az deployment group what-if `
  --subscription 1b2f2b67-bfca-4ccc-87ee-f887cf98d217 `
  --resource-group rg-apimgmt `
  --name apim-portal-legacy-pre-what-if `
  --template-file infra/main.bicep `
  --parameters infra/parameters/pre-legacy.bicepparam
```

Approved deployment command, intentionally not executed:

```powershell
az deployment group create `
  --subscription 1b2f2b67-bfca-4ccc-87ee-f887cf98d217 `
  --resource-group rg-apimgmt `
  --name apim-portal-legacy-pre `
  --template-file infra/main.bicep `
  --parameters infra/parameters/pre-legacy.bicepparam
```

Expected outputs are `spaHostname`, `spaHttpsUrl`, `bffHostname`, `bffHttpsUrl`,
`bffManagedIdentityPrincipalId`, and `apimReaderRoleAssignmentId`. If the proposed
names are available, the BFF URL will be
`https://apb-apim-portal-bff-legacy-pre.azurewebsites.net`. Azure assigns the Static Web
Apps hostname, returned as `https://<generated-host>.azurestaticapps.net`.

## Entra updates after the SPA hostname is known

No Entra object is changed by Bicep. Apply these changes manually:

1. On SPA client `77d0c0da-28fa-497c-abb1-92e4467e3fcb`, add the Single-page
   application redirect URI `https://<SPA-HOST>` and set the front-channel logout
   URL to the same origin. The code uses `window.location.origin`.
2. Ensure that SPA client is authorized for
   `api://6e5d71ad-3705-455b-bb0d-779331e46c78/access_as_user`, with required
   tenant consent.
3. On BFF client `6e5d71ad-3705-455b-bb0d-779331e46c78`, retain Application ID
   URI `api://6e5d71ad-3705-455b-bb0d-779331e46c78`, expose `access_as_user`, use
   v2 access tokens, and emit the approved security-group claims.
4. On documentation client `76e21c21-a10d-45c2-ac0f-3d4e240a228c`, add these SPA
   redirect URIs:
   - `https://<SPA-HOST>/oauth2/scalar-callback`
   - `https://<SPA-HOST>/oauth2/swagger-callback.html`
5. Do not create a browser client secret. Portal login and documentation testing
   use authorization code with PKCE.

The BFF is a bearer-token API and does not need an interactive redirect URI.

## GitHub PRE environment

Configure the protected `PRE` environment with the deployment identity and:

- `AZURE_SUBSCRIPTION_ID=1b2f2b67-bfca-4ccc-87ee-f887cf98d217`
- `AZURE_RESOURCE_GROUP=rg-apimgmt`
- `AZURE_STATIC_WEB_APP_NAME=apb-apim-portal-legacy-pre`
- `AZURE_WEBAPP_NAME=apb-apim-portal-bff-legacy-pre`
- `VITE_AUTH_MODE=entra`
- `VITE_ENTRA_CLIENT_ID=77d0c0da-28fa-497c-abb1-92e4467e3fcb`
- `VITE_ENTRA_TENANT_ID=3b6f65fd-e602-4e25-a81a-eb5ef7376512`
- `VITE_BFF_SCOPE=api://6e5d71ad-3705-455b-bb0d-779331e46c78/access_as_user`
- `VITE_BFF_BASE_URL=<bffHttpsUrl output>`
- `VITE_APIM_PORTAL_URL=https://apim-cmn-pre.developer.azure-api.net/`
- `VITE_APIM_GATEWAY_URL=https://apim-cmn-pre.azure-api.net/`
- `VITE_DOCS_CLIENT_ID=76e21c21-a10d-45c2-ac0f-3d4e240a228c`
- `VITE_DOCS_TENANT_ID=3b6f65fd-e602-4e25-a81a-eb5ef7376512`
- `VITE_DOCS_REDIRECT_BASE_URL=<spaHttpsUrl output>`

The deployment identity client ID remains organization-specific. Configure its
GitHub OIDC federated credential for the exact repository and `PRE` environment.
The frontend workflow needs permission to retrieve the deployment token from the
exact Static Web App; the BFF workflow needs deployment permission on the exact
App Service.

## RBAC and gates

The BFF system-assigned managed identity receives API Management Service Reader
(`71522526-b88f-4d52-b57f-d31fc3546d0d`) only on:

`/subscriptions/1b2f2b67-bfca-4ccc-87ee-f887cf98d217/resourceGroups/rg-apimgmt/providers/Microsoft.ApiManagement/service/apim-cmn-pre`

The infrastructure deployment identity needs resource deployment permissions on
`rg-apimgmt` plus `Microsoft.Authorization/roleAssignments/write` at that APIM
scope. It does not need APIM write permissions.

Before release, approve the what-if, verify global name availability, complete
the Entra changes, configure GitHub OIDC/environment values, deploy BFF before
SPA, run `scripts/Test-DeveloperPortalDeployment.ps1`, and complete authenticated
catalog/Scalar/Swagger/APIM-link smoke tests with representative users.

## Later Core differences

Core reuses the application code but requires its own deployment parameter file,
resource names/environment approval, deployment subscription/resource group,
APIM values for `apim-cmn-core`, BFF managed-identity role assignment, hosted
URLs, SPA/BFF Entra registrations or approved Core-specific configuration, GitHub
environment, CORS origin, and redirect URIs. Do not copy PRE hostnames, client
IDs, scope, or APIM identifiers into Core without explicit approval.
