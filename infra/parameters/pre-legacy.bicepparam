using '../main.bicep'

// Hosted PRE validation against the legacy/source APIM. The existing
// pre.bicepparam remains the separately prepared Core configuration.
param location = 'spaincentral'
param staticWebAppLocation = 'westeurope'
param environmentName = 'pre'
param spaName = 'apb-apim-portal-legacy-pre'
param bffName = 'apb-apim-portal-bff-legacy-pre'
param appServicePlanName = 'asp-apb-apim-portal-bff-legacy-pre'
param appServicePlanSkuName = 'B1'
param staticWebAppSkuName = 'Free'
param logAnalyticsWorkspaceName = 'log-apb-apim-portal-bff-legacy-pre'
param applicationInsightsName = 'appi-apb-apim-portal-bff-legacy-pre'

param entraTenantId = '3b6f65fd-e602-4e25-a81a-eb5ef7376512'
param entraBffAudience = 'api://6e5d71ad-3705-455b-bb0d-779331e46c78'

param apimSubscriptionId = '1b2f2b67-bfca-4ccc-87ee-f887cf98d217'
param apimResourceGroupName = 'rg-apimgmt'
param apimServiceName = 'apim-cmn-pre'
param apimGatewayOrigin = 'https://apim-cmn-pre.azure-api.net'
