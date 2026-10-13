# APIM Developer Portal Widgets

Custom widgets used by the Port de Barcelona Azure API Management developer portal.

The repository is being migrated to a standalone/self-hostable frontend for the
`apim-cmn-core` Standard v2 service. The existing widgets remain as compatibility
implementations until feature parity is reached. See the
[migration architecture](docs/migration-architecture.md) for the repository
analysis, target design, risks, and phased plan.

Phase 2 adds `apps/developer-portal` (Vue 3 + MSAL) and
`apps/developer-portal-bff` (.NET 8 + DefaultAzureCredential). See the
[Phase 2 implementation guide](docs/phase-2-implementation.md) for the runtime
flow, authorization rules, endpoints, configuration, and local commands.

Phase 3 adds visibility-gated OpenAPI export plus locally bundled Scalar and Swagger
documentation with OAuth2 Authorization Code + PKCE. See the
[Phase 3 API documentation guide](docs/phase-3-api-documentation.md).

Phase 4 prepares a non-production Azure Static Web Apps and Linux App Service
deployment without creating Azure or Entra resources. See the
[Hosted PRE release-readiness guide](docs/pre-release-readiness.md), the preserved
[Phase 4 Core deployment guide](docs/phase-4-deployment.md), and the
[manual Entra configuration guide](docs/phase-4-entra-configuration.md).

For read-only local validation against the existing legacy PRE APIM, use the
[local PRE validation guide](docs/local-pre-validation.md). This does not replace
the Core deployment target.

## Widgets

| Directory | Widget | Purpose |
| --- | --- | --- |
| `azure-api-management-widget-cw-apislist` | `cw-apislist` | Displays the complete API catalog. |
| `azure-api-management-widget-cw-apisperapp` | `cw-apisperapp` | Groups APIs by `app:` tags. |
| `azure-api-management-widget-cw-prodbygroups` | `cw-prodbygroups` | Groups APIs by products available to the signed-in user. |

All widgets support APIM server-side pagination by following `nextLink`, so filtering and grouping operate on the complete result set.

## Shared foundation

`packages/apim-core` contains the host-neutral APIM client, continuation-link
pagination, common types, version-set grouping, environment configuration, and
documentation navigation. Each legacy widget consumes this package through a
local file dependency.

Copy `.env.example` to `.env` when overriding the checked-in non-secret target
configuration. Never add client secrets or Azure credentials to `.env` or source
control.

## Requirements

- Node.js and npm
- Azure CLI authenticated against the target subscription
- Permissions to deploy custom widgets to the APIM instance

## Local development

Run commands from the directory of the widget you want to work on:

```bash
npm install
npm run start
```

## Build

```bash
npm run build
```

Generated `dist` directories are intentionally excluded from Git.

## Deploy

Each widget contains its own deployment configuration and script:

```bash
npm run deploy
```

The legacy deployment scripts target the centralized `config/apim-target.json`
values and accept `APIM_SUBSCRIPTION_ID`, `APIM_RESOURCE_GROUP`,
`APIM_SERVICE_NAME`, and `AZURE_MANAGEMENT_API_ENDPOINT` overrides. Managed
custom-widget deployment is not the target architecture for Standard v2.
