using '../main.bicep'

param location = 'spaincentral'
param environmentName = 'pre'
param spaName = 'apb-apim-portal-pre'
param bffName = 'apb-apim-portal-bff-pre'
param appServicePlanName = 'asp-apb-apim-portal-bff-pre'
param appServicePlanSkuName = 'B1'
param staticWebAppSkuName = 'Free'
param logAnalyticsWorkspaceName = 'log-apb-apim-portal-bff-pre'
param applicationInsightsName = 'appi-apb-apim-portal-bff-pre'

param entraTenantId = '3b6f65fd-e602-4e25-a81a-eb5ef7376512'
// Empty is supported only for the first infrastructure pass, before the BFF
// Entra application exists. Set ENTRA_BFF_AUDIENCE and reapply before app deploy.
param entraBffAudience = readEnvironmentVariable('ENTRA_BFF_AUDIENCE', '')

param apimSubscriptionId = '8b72e64a-ae1a-4ac3-9960-dda8ee63d59e'
param apimResourceGroupName = 'rg-common-core'
param apimServiceName = 'apim-cmn-core'
param apimGatewayOrigin = 'https://apim-cmn-core.azure-api.net'
