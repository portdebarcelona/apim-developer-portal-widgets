const {deployNodeJS} = require("@azure/api-management-custom-widgets-tools")
const target = require("../config/apim-target.json")

const subscriptionId = process.env.APIM_SUBSCRIPTION_ID || target.subscriptionId
const resourceGroup = process.env.APIM_RESOURCE_GROUP || target.resourceGroup
const serviceName = process.env.APIM_SERVICE_NAME || target.serviceName

const serviceInformation = {
	"resourceId": `subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ApiManagement/service/${serviceName}`,
	"managementApiEndpoint": process.env.AZURE_MANAGEMENT_API_ENDPOINT || "https://management.azure.com"
}
const name = "cw-apisperapp"
const fallbackConfigPath = "./static/config.msapim.json"
const config = {
	"interactiveBrowserCredentialOptions": {
		"redirectUri": "http://localhost:1337"
	}
}

deployNodeJS(serviceInformation, name, fallbackConfigPath, config)
