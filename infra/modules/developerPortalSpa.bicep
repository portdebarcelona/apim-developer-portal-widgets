targetScope = 'resourceGroup'

@allowed([
  'Free'
  'Standard'
])
param skuName string = 'Free'
param name string
param location string
param tags object = {}

resource staticSite 'Microsoft.Web/staticSites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuName
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

output id string = staticSite.id
output name string = staticSite.name
output defaultHostname string = staticSite.properties.defaultHostname
output httpsUrl string = 'https://${staticSite.properties.defaultHostname}'
