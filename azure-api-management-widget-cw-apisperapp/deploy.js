const {deployNodeJS} = require("@azure/api-management-custom-widgets-tools")

const serviceInformation = {
	"resourceId": "subscriptions/1b2f2b67-bfca-4ccc-87ee-f887cf98d217/resourceGroups/rg-common/providers/Microsoft.ApiManagement/service/apbapipre",
	"managementApiEndpoint": "https://management.azure.com"
}
const name = "cw-apisperapp"
const fallbackConfigPath = "./static/config.msapim.json"
const config = {
	"interactiveBrowserCredentialOptions": {
		"redirectUri": "http://localhost:1337"
	}
}

deployNodeJS(serviceInformation, name, fallbackConfigPath, config)
