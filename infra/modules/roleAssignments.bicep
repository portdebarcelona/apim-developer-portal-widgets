targetScope = 'resourceGroup'

param principalId string
param apimServiceName string

var apiManagementServiceReaderRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '71522526-b88f-4d52-b57f-d31fc3546d0d'
)

resource apim 'Microsoft.ApiManagement/service@2024-05-01' existing = {
  name: apimServiceName
}

resource apimReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(apim.id, principalId, apiManagementServiceReaderRoleId)
  scope: apim
  properties: {
    roleDefinitionId: apiManagementServiceReaderRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

output roleAssignmentId string = apimReaderRoleAssignment.id
