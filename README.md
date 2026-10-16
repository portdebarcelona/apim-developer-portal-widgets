# APIM Developer Portal Widgets

Custom widgets used by the Port de Barcelona Azure API Management developer portal.

## Widgets

| Directory | Widget | Purpose |
| --- | --- | --- |
| `azure-api-management-widget-cw-apislist` | `cw-apislist` | Displays the complete API catalog. |
| `azure-api-management-widget-cw-apisperapp` | `cw-apisperapp` | Groups APIs by `app:` tags. |
| `azure-api-management-widget-cw-prodbygroups` | `cw-prodbygroups` | Groups APIs by products available to the signed-in user. |

All widgets support APIM server-side pagination by following `nextLink`, so filtering and grouping operate on the complete result set.

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

Review the APIM resource configured in `deploy.js` before deploying to another environment.
