# Phase 4 Entra configuration

This document describes the manual Entra configuration required after the PRE
infrastructure deployment returns the final SPA and BFF hostnames. It is an
operator runbook only: the repository does not create or modify Entra objects.

Record these Bicep outputs first:

- `spaHttpsUrl`, for example `https://<SPA-HOST>`
- `bffHttpsUrl`, for example `https://<BFF-HOST>`

Use the tenant `3b6f65fd-e602-4e25-a81a-eb5ef7376512`. The recommended account
type for all three registrations is single tenant (this organizational directory
only). No client secret is required by the SPA, the BFF, or the documentation
browser clients.

## A. Standalone Portal SPA app registration

Create a dedicated app registration for interactive portal login. Do not reuse
the documentation client.

1. Add a **Single-page application** platform.
2. Add the exact redirect URI `https://<SPA-HOST>/`.
3. Set the front-channel logout URL to `https://<SPA-HOST>/`.
4. Under API permissions, add the delegated BFF permission created in section B.
5. Grant tenant admin consent if required by Port de Barcelona policy.
6. Under the BFF app registration's **Expose an API** page, authorize this SPA
   client for that scope so consent is controlled centrally.
7. Do not create a client secret. MSAL uses Authorization Code with PKCE for the
   public browser client.

Record the SPA application (client) ID as `VITE_ENTRA_CLIENT_ID`.

## B. BFF app registration

Create a separate app registration representing the BFF API.

1. Set an Application ID URI. The recommended value is
   `api://<BFF-APPLICATION-CLIENT-ID>`.
2. Expose a delegated scope named `access_as_user` for users and administrators.
3. The full recommended scope is
   `api://<BFF-APPLICATION-CLIENT-ID>/access_as_user`.
4. Add the standalone SPA client as an authorized client application for this
   scope.
5. Configure access tokens issued for this API as version 2.
6. Do not add a client secret. The BFF validates incoming bearer tokens and uses
   its App Service system-assigned managed identity for Azure ARM calls.

Set:

- `ENTRA_BFF_AUDIENCE` to the exact Application ID URI, normally
  `api://<BFF-APPLICATION-CLIENT-ID>`.
- `VITE_BFF_SCOPE` to the exact delegated scope, normally
  `api://<BFF-APPLICATION-CLIENT-ID>/access_as_user`.

Reapply the Bicep deployment with `ENTRA_BFF_AUDIENCE` set before deploying the
BFF. An empty audience is accepted by Bicep only to bootstrap the Azure
hostnames; the production BFF deliberately refuses to start without it.

## C. Documentation OAuth application

Update the existing documentation application whose client ID is
`76e21c21-a10d-45c2-ac0f-3d4e240a228c`.

Add these exact **Single-page application** redirect URIs:

- `https://<SPA-HOST>/oauth2/scalar-callback`
- `https://<SPA-HOST>/oauth2/swagger-callback.html`

Keep it as a public browser client and do not create or expose a client secret.
Add delegated permissions for each API that users may test. Preserve the
API-specific scopes published through APIM/OpenAPI, including scopes such as
`api://<resource-app-id>/.default` where they are intentionally configured.
Scalar and Swagger UI use Authorization Code with PKCE.

## D. Group claims and group overage

The BFF currently resolves APIM visibility from security-group object IDs in the
validated BFF access token. Configure the BFF enterprise application's token
claims to emit security groups. Validate with representative PRE users that the
token contains the expected `groups` claim and the APIM group mappings use the
same object IDs.

Entra replaces the direct `groups` array with an overage indicator when a user
has too many memberships. The current BFF intentionally fails closed when that
happens because no Microsoft Graph group-membership client is configured. Before
production, either:

- confirm the target population stays below Entra's group-claim limit; or
- implement and approve Graph-based transitive membership resolution, with the
  least-privileged application permission, admin consent, managed-identity or
  workload-identity access, caching, telemetry, and explicit failure behavior.

Do not grant Graph permissions merely to complete the PRE infrastructure
deployment. This is a production-readiness decision requiring security approval.
