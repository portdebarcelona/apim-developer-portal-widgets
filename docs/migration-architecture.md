# APIM Developer Portal migration architecture

## Executive summary

The repository is three independent Vue 3 custom-widget projects generated from the Azure API Management widget scaffold. The components contain useful catalog UI and business rules, but each component also performs its own APIM calls, pagination, mapping, version grouping, and navigation. Their runtime authentication depends on the managed portal injecting `managementApiUrl`, an authorization token, and (for the product view) `userId` through `askForSecrets("app")`.

That hosting model cannot be the target for `apim-cmn-core`: Microsoft documents that managed-portal custom widgets and the Custom HTML widget aren't available in APIM v2 tiers. The recommended target is therefore a standalone Vue application, deployed independently and linked to/from the managed portal during migration. It should use Microsoft Entra ID with authorization code + PKCE and an authenticated backend-for-frontend (BFF) for APIM catalog/user-entitlement data. No Azure management credential or client secret belongs in browser code.

Phase 1 keeps all three widgets and their UI intact but extracts a host-neutral core package for APIM access, types, version handling, environment configuration, and documentation navigation.

## 1. Current repository structure

```text
.
├── azure-api-management-widget-cw-apislist/
│   ├── deploy.js
│   ├── static/config.msapim.json
│   └── src/
│       ├── components/app/index.vue
│       ├── components/editor/index.vue
│       ├── main.app.ts / main.editor.ts
│       ├── types.ts / values.ts
│       ├── styles/
│       └── utils/
├── azure-api-management-widget-cw-apisperapp/   # same scaffold
├── azure-api-management-widget-cw-prodbygroups/ # same scaffold
├── config/apim-target.json                      # Phase 1 target config
├── packages/apim-core/                          # Phase 1 shared foundation
└── .env.example                                 # Phase 1 public runtime/build config
```

Each widget currently has its own package manifest, lock file, Vite configuration, build output, editor entry point, deployment script, styles, and copies of the scaffold utilities.

## 2. Existing widgets and responsibilities

| Widget | Responsibility | UX retained |
| --- | --- | --- |
| `cw-apislist` | Fetches the complete API list, groups versions, searches, and renders card/table views | Search, view switch, client-side table paging, version selector, Scalar/APIM/Swagger buttons |
| `cw-apisperapp` | Fetches every API and its tags, keeps `app:*` tags, and groups APIs under application names | Search across application/API/version, cards/table, expandable groups, version selector, session cache |
| `cw-prodbygroups` | Requires an authenticated APIM user, fetches products, subscriptions and each product's APIs | Search, cards/table, expandable teams/products, version selector, subscribed-product marker in the model |

The editor components are essentially scaffold placeholders. `values.ts` in every project is also unchanged sample form configuration and is not used by the catalog logic.

## 3. Shared and duplicated logic

Before Phase 1, all three widgets duplicated:

- construction of authenticated APIM requests from managed-widget secrets;
- `nextLink` traversal;
- raw API mapping;
- display-name/version grouping and natural version sorting;
- selected-version state;
- search, local paging, table/card view state;
- three-route API documentation navigation;
- widget resize and parent-style injection helpers;
- nearly identical deployment and Vite target configuration.

`cw-apisperapp` additionally has a generic concurrency runner and a five-minute `sessionStorage` cache. Its tag retrieval is an N+1 pattern: one `/apis` traversal followed by one `/apis/{name}/tags` traversal per API, with concurrency set to 30.

Phase 1 moves the data client, pagination, common APIM types, raw mapping, version-set grouping, subscribed-product extraction, configuration, and documentation URL building into `packages/apim-core`. UI state remains in the widgets for now.

## 4. Hard-coded APIM/environment dependencies found

The legacy source contained the following values in every `deploy.js` and/or `vite.config.ts`:

- old subscription `1b2f2b67-bfca-4ccc-87ee-f887cf98d217`;
- old resource group `rg-common`;
- old service `apbapipre`;
- old portal `https://apbapipre.developer.azure-api.net/`;
- Azure management endpoint `https://management.azure.com`;
- widget development port `3000` and credential redirect port `1337`;
- portal routes `custom-api-details`, `api-details`, and `custom-apis-swagger`;
- application tag prefix `app:`;
- Spanish locale and fixed page size `6`;
- app cache TTL (five minutes) and concurrency (30).

No `apim-cmn-pre` reference was present. The old resource identifiers and portal URL have been removed. The new non-secret target is centralized in `config/apim-target.json`; overridable values and standalone endpoints/routes are documented in `.env.example`. Deployment remains only a compatibility path and now reads `APIM_SUBSCRIPTION_ID`, `APIM_RESOURCE_GROUP`, `APIM_SERVICE_NAME`, and `AZURE_MANAGEMENT_API_ENDPOINT` when supplied.

## 5. Current authentication mechanism

The widgets do not implement Entra authentication themselves. `main.app.ts` calls `askForSecrets("app")` from `@azure/api-management-custom-widgets-tools`. The managed portal host returns:

- `managementApiUrl`;
- `apiVersion`;
- an authorization token when available;
- `userId` for the authenticated portal user (used by `cw-prodbygroups`).

The old code applied the token to every request. Phase 1 preserves that bridge through `createWidgetClient`; the standalone target must replace the bridge with an MSAL token provider/BFF session. The tenant and existing documentation client ID supplied for the migration were not present in the original repository and are now public configuration only. No secret has been added.

## 6. Existing data retrieval flows

### APIs

- `cw-apislist`: `GET /apis`, then all `nextLink` pages.
- `cw-apisperapp`: `GET /apis`, then all `nextLink` pages.
- `cw-prodbygroups`: for every product, `GET /products/{productName}/apis`, then all `nextLink` pages.

### Tags and application grouping

`cw-apisperapp` calls `GET /apis/{apiName}/tags` for every API, follows each tag collection's `nextLink`, reads `properties.displayName` (falling back to `name`), keeps case-sensitive names beginning with `app:`, removes the prefix, and groups the API into every matching application.

### Products and user visibility

`cw-prodbygroups` requires `secrets.userId`, then:

1. calls `GET /users/{userId}/subscriptions` and extracts product names from subscription scopes;
2. calls `GET /products`;
3. calls `GET /products/{productName}/apis` for every returned product;
4. records `isSubscribed`, although the current template does not display or filter on that field.

The effective product visibility currently relies on the managed portal's authenticated request context filtering `/products`. Subscription membership is metadata, not the actual filter. A standalone service account calling the Azure management API would therefore risk returning more than the signed-in developer may see. The BFF must explicitly reproduce the product/group/subscription authorization rule before returning data.

### API versions

- `cw-apisperapp` already prefers `properties.apiVersionSetId`, then display name, then API name as its group key. It labels a version from `apiVersion`, then `apiRevision`, then `default`.
- `cw-apislist` and `cw-prodbygroups` originally grouped only by normalized display name and used only `apiVersion`, which could merge unrelated APIs or split a renamed version set.
- Phase 1 now centralizes grouping and prefers `apiVersionSetId`, with display-name fallback for legacy APIs. It retains API revisions as a fallback label and natural/numeric version ordering.

### Pagination

Every collection previously implemented a local loop over `nextLink`. `ApimClient.getAll` now owns this behavior, rejects failed pages, detects repeated links, and refuses absolute next links from an origin other than the configured data endpoint. All API, tag, product, product-API, and subscription methods use it.

## 7. Scalar/Swagger navigation today

Every action called `openApi(apiName, route)`. The utility opened a new window at the parent portal origin using `/{route}#api={encodedApiName}` and redirected the current iframe if the popup was blocked. The Scalar and Swagger viewer implementations are not present in this repository; only links to their managed-portal pages exist. OAuth behavior inside those pages therefore cannot be verified from this codebase.

Phase 1 centralizes navigation and passes both `api` and `version`. Each destination independently supports `hash` (backward compatibility) or `query` mode. A standalone deployment should use routes such as `/docs/scalar?api=orders-v2&version=2` and `/docs/swagger?...`, while the compatibility widgets default to the existing hash mode.

## 8. Recommended target architecture

```text
Browser
  ├── Vue standalone portal
  │     ├── APIs view
  │     ├── Applications view
  │     ├── Teams/products view
  │     └── Scalar / Swagger routes
  ├── MSAL (authorization code + PKCE)
  └── same-site secure session or bearer token
             │
             ▼
Authenticated BFF / catalog API
  ├── validates Entra identity
  ├── maps identity to APIM user/groups
  ├── enforces product/API visibility
  ├── normalizes APIM paging and errors
  ├── caches non-user catalog data safely
  └── uses managed identity / workload identity
             │
             ▼
apim-cmn-core management/developer APIs and gateway
```

Key decisions:

- Keep presentation components ignorant of tokens and endpoint construction.
- Put authorization enforcement server-side. A browser token with broad Azure management-plane RBAC is not an acceptable replacement for managed-portal filtering.
- Use `packages/apim-core` in both compatibility widgets and the new frontend; later split browser-safe domain helpers from server adapters only if needed.
- Use APIM version-set IDs as stable grouping keys and concrete API names as navigation/spec keys.
- Treat native APIM, Scalar, and Swagger as route adapters over one `{apiName, apiVersion}` selection.
- Retrieve OpenAPI documents through an authenticated BFF endpoint. Do not embed subscription keys, OAuth client secrets, or Azure credentials.
- Keep native APIM details on the managed portal during coexistence; host Scalar and Swagger in the standalone app when ready.

## 9. Proposed folder structure

```text
apps/
├── developer-portal/             # Vue 3 + router standalone SPA
│   └── src/
│       ├── auth/                  # MSAL/session adapter
│       ├── components/catalog/    # extracted existing cards/tables
│       ├── views/ApisView.vue
│       ├── views/ApplicationsView.vue
│       ├── views/ProductsView.vue
│       └── views/docs/            # Scalar and Swagger shells
└── catalog-bff/                   # authenticated server/API
    └── src/
        ├── auth/
        ├── apim/
        └── routes/
packages/
├── apim-core/                     # present: client, types, grouping, config, navigation
└── portal-ui/                     # later: extracted shared UI/styles
legacy-widgets/                    # move only after standalone parity
config/
└── apim-target.json
docs/
└── migration-architecture.md
```

The physical move of the existing directories is intentionally deferred to avoid disrupting the compatibility builds in Phase 1.

## 10. Concrete migration phases

1. **Foundation (implemented here).** Inventory current behavior; centralize APIM access, pagination, types, version logic, environment config, and navigation; remove legacy environment references; keep all widgets buildable.
2. **BFF and identity contract.** Define catalog endpoints, implement Entra validation and APIM identity/group mapping, enforce visibility, add managed identity/RBAC, CORS and audit logging, and integration-test `nextLink` behavior.
3. **Standalone shell.** Create Vue router/layout, MSAL authorization-code/PKCE integration, error/session handling, and links back to the managed portal.
4. **UI extraction.** Move the existing catalog, application and product components/styles into the standalone app with minimal markup changes; replace widget resize/parent-style behavior with responsive layout primitives.
5. **Documentation viewers.** Add native APIM deep link, Scalar and Swagger routes, spec retrieval, OAuth2 PKCE configuration, token isolation, and CSP/security headers.
6. **Parity and authorization validation.** Compare catalogs for anonymous users, authenticated users, product groups and subscriptions; test version sets, revisions, tag edge cases, paging, revoked access, and empty/error states.
7. **Coexistence and cutover.** Publish the standalone app, link it from the managed portal, collect telemetry, switch primary navigation after acceptance, and only then retire/archive the legacy widgets.

## 11. Files modified or created in Phase 1

Created:

- `.env.example`
- `config/apim-target.json`
- `packages/apim-core/package.json`
- `packages/apim-core/src/{types,client,apis,config,navigation,index}.ts`
- `docs/migration-architecture.md`

Modified in each widget:

- `package.json` and `package-lock.json`: local shared-core dependency;
- `main.app.ts`: managed secrets are adapted into `ApimClient`;
- `components/app/index.vue`: calls shared client/paging and shared version utilities;
- `types.ts`: re-exports shared types and retains view-specific models;
- `utils/navigation.ts`: delegates to shared configurable navigation;
- `vite.config.ts` and `tsconfig.node.json`: centralized target/env loading;
- `deploy.js`: target config plus environment overrides; retained only for compatibility.

## 12. Standard v2 risks and incompatibilities

- **Blocking:** Microsoft states that custom widgets and Custom HTML aren't available in APIM v2 tiers. The three current deployments cannot be the production integration mechanism for Standard v2. See the [developer portal FAQ](https://learn.microsoft.com/azure/api-management/developer-portal-faq).
- **Self-hosting tradeoff:** Microsoft lists Standard v2 as supported for the open-source self-hosted developer portal, but notes that self-hosting does not support all managed-portal visibility/access controls and makes the customer responsible for hosting, patching and upgrades. See [self-host the developer portal](https://learn.microsoft.com/azure/api-management/developer-portal-self-host). A focused standalone companion frontend is lower-coupling than forking the full portal.
- **Authorization mismatch:** management-plane RBAC, managed-portal sign-in, product visibility, subscription state and gateway OAuth are distinct concerns. Reusing one token/client for all of them can overexpose catalog data or fail at runtime.
- **Entra app suitability:** the supplied client ID may have been configured for documentation OAuth rather than as a SPA/BFF login client. Redirect URIs, public-client/PKCE settings, scopes and consent must be verified before reuse.
- **OAuth viewers:** configuring OAuth in APIM enables token acquisition for the test console, but token validation still belongs in gateway policy/backend. See [configure OAuth 2.0 in the developer portal test console](https://learn.microsoft.com/azure/api-management/api-management-howto-oauth2).
- **CORS/CSP:** independently hosted viewers and BFF endpoints need explicit allowed origins, frame/connect/script policies, and redirect URIs for every environment.
- **Rate/latency:** application grouping currently has an API-to-tags N+1 pattern and product grouping has a product-to-APIs N+1 pattern. The BFF should cache shared catalog metadata, bound concurrency, and preserve continuation links.
- **Cache isolation:** the current application cache is keyed globally in session storage, not by APIM service/user/config version. It must be namespaced before reuse in a multi-environment standalone app.
- **Version ambiguity:** APIs without version-set IDs still fall back to display-name grouping. These APIs should be audited in `apim-cmn-core` and assigned version sets where appropriate.
- **Dependency health:** current builds report Sass deprecations and npm audit findings in the legacy toolchains. These are not fixed automatically in Phase 1 because forced upgrades could break the widgets; the standalone app should start on supported dependencies.

## Azure and Entra configuration required for later phases

- Enable/configure Microsoft Entra identity for the `apim-cmn-core` managed portal and republish it.
- Verify whether client `76e21c21-a10d-45c2-ac0f-3d4e240a228c` is safe to reuse. If it is a public documentation client, configure authorization code + PKCE and exact SPA redirect/logout URIs; otherwise register a separate SPA/BFF client.
- Configure the required delegated scope(s), admin/user consent policy, token audience and tenant `3b6f65fd-e602-4e25-a81a-eb5ef7376512`.
- Register local, test and production redirect URIs. Never create or commit a SPA client secret.
- Give the BFF a managed identity/workload identity and the least APIM read permissions needed. Do not grant those management permissions to every portal user.
- Define and test the identity-to-APIM-user/group mapping and product group assignments. Treat subscriptions and product visibility as separate checks.
- Configure OAuth 2.0/OpenID Connect servers on `apim-cmn-core`, associate them with APIs, and apply `validate-azure-ad-token`/`validate-jwt` gateway policies as appropriate.
- Allow only the standalone frontend origins at the BFF; configure APIM/gateway CORS only for actual browser calls.
- Add Scalar/Swagger redirect URIs and approved scopes for try-it flows, plus CSP headers that allow only required identity/spec/gateway endpoints.
