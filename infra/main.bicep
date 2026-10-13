targetScope = 'resourceGroup'

@description('Azure region for the BFF and its regional supporting resources.')
param location string = resourceGroup().location

@description('Azure region for Static Web Apps. Defaults to the workload region but can be set separately when the service is unavailable there.')
param staticWebAppLocation string = location

@allowed([
  'pre'
  'pro'
])
param environmentName string = 'pre'

@description('Globally unique Azure Static Web App name.')
param spaName string = 'apb-apim-portal-pre'

@description('Globally unique Linux App Service name for the BFF.')
param bffName string = 'apb-apim-portal-bff-pre'

param appServicePlanName string = 'asp-${bffName}'
param appServicePlanSkuName string = 'B1'
param staticWebAppSkuName string = 'Free'
param logAnalyticsWorkspaceName string = 'log-${bffName}'
param applicationInsightsName string = 'appi-${bffName}'

param entraTenantId string = '3b6f65fd-e602-4e25-a81a-eb5ef7376512'

@description('Audience/Application ID URI exposed by the BFF Entra app registration. Leave empty only for the initial infrastructure bootstrap; reapply before deploying the BFF.')
param entraBffAudience string = ''

param apimSubscriptionId string = '8b72e64a-ae1a-4ac3-9960-dda8ee63d59e'
param apimResourceGroupName string = 'rg-common-core'
param apimServiceName string = 'apim-cmn-core'
param apimGatewayOrigin string = 'https://apim-cmn-core.azure-api.net'

param tags object = {
  workload: 'apim-developer-portal'
  environment: environmentName
  managedBy: 'bicep'
}

module spa 'modules/developerPortalSpa.bicep' = {
  name: 'developer-portal-spa-${environmentName}'
  params: {
    name: spaName
    location: staticWebAppLocation
    skuName: staticWebAppSkuName
    tags: tags
  }
}

module bff 'modules/developerPortalBff.bicep' = {
  name: 'developer-portal-bff-${environmentName}'
  params: {
    name: bffName
    location: location
    appServicePlanName: appServicePlanName
    appServicePlanSkuName: appServicePlanSkuName
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    applicationInsightsName: applicationInsightsName
    entraTenantId: entraTenantId
    entraBffAudience: entraBffAudience
    corsAllowedOrigin: spa.outputs.httpsUrl
    apimSubscriptionId: apimSubscriptionId
    apimResourceGroupName: apimResourceGroupName
    apimServiceName: apimServiceName
    apimGatewayOrigin: apimGatewayOrigin
    tags: tags
  }
}

module apimReaderRole 'modules/roleAssignments.bicep' = {
  name: 'developer-portal-apim-reader-${environmentName}'
  scope: resourceGroup(apimSubscriptionId, apimResourceGroupName)
  params: {
    principalId: bff.outputs.managedIdentityPrincipalId
    apimServiceName: apimServiceName
  }
}

output spaHostname string = spa.outputs.defaultHostname
output spaHttpsUrl string = spa.outputs.httpsUrl
output bffHostname string = bff.outputs.defaultHostname
output bffHttpsUrl string = bff.outputs.httpsUrl
output bffManagedIdentityPrincipalId string = bff.outputs.managedIdentityPrincipalId
output apimReaderRoleAssignmentId string = apimReaderRole.outputs.roleAssignmentId
