targetScope = 'resourceGroup'

param name string
param location string
param appServicePlanName string
param appServicePlanSkuName string = 'B1'
param logAnalyticsWorkspaceName string
param applicationInsightsName string
param entraTenantId string
param entraBffAudience string
param corsAllowedOrigin string
param apimSubscriptionId string
param apimResourceGroupName string
param apimServiceName string
param apimGatewayOrigin string
param tags object = {}

resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: appServicePlanSkuName
  }
  properties: {
    reserved: true
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    IngestionMode: 'LogAnalytics'
    Request_Source: 'rest'
    RetentionInDays: 30
    WorkspaceResourceId: logAnalytics.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

var appSettings = [
  {
    name: 'ASPNETCORE_ENVIRONMENT'
    value: 'Production'
  }
  {
    name: 'AUTHENTICATION_MODE'
    value: 'Entra'
  }
  {
    name: 'ENTRA_TENANT_ID'
    value: entraTenantId
  }
  {
    name: 'ENTRA_BFF_AUDIENCE'
    value: entraBffAudience
  }
  {
    name: 'APIM_SUBSCRIPTION_ID'
    value: apimSubscriptionId
  }
  {
    name: 'APIM_RESOURCE_GROUP'
    value: apimResourceGroupName
  }
  {
    name: 'APIM_SERVICE_NAME'
    value: apimServiceName
  }
  {
    name: 'Cors__AllowedOrigins__0'
    value: corsAllowedOrigin
  }
  {
    name: 'SecurityHeaders__ConnectSources__0'
    value: environment().authentication.loginEndpoint
  }
  {
    name: 'SecurityHeaders__ConnectSources__1'
    value: apimGatewayOrigin
  }
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: applicationInsights.properties.ConnectionString
  }
  {
    name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
    value: '~3'
  }
  {
    name: 'ASPNETCORE_FORWARDEDHEADERS_ENABLED'
    value: 'true'
  }
  {
    name: 'WEBSITE_HEALTHCHECK_MAXPINGFAILURES'
    value: '3'
  }
]

resource webApp 'Microsoft.Web/sites@2024-04-01' = {
  name: name
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|8.0'
      alwaysOn: true
      healthCheckPath: '/healthz'
      http20Enabled: true
      httpLoggingEnabled: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      appSettings: appSettings
    }
  }
}

output id string = webApp.id
output name string = webApp.name
output defaultHostname string = webApp.properties.defaultHostName
output httpsUrl string = 'https://${webApp.properties.defaultHostName}'
output managedIdentityPrincipalId string = webApp.identity.principalId
output applicationInsightsName string = applicationInsights.name
output logAnalyticsWorkspaceName string = logAnalytics.name
