export type DocumentationTarget = "native" | "scalar" | "swagger"
export type DocumentationParameterMode = "query" | "hash"

export interface DocumentationRoute {
  path: string
  parameterMode: DocumentationParameterMode
}

export interface PortalConfig {
  apim: {
    serviceName: string
    resourceGroup: string
    subscriptionId: string
    portalUrl: string
    gatewayUrl: string
    dataApiBaseUrl: string
    dataApiVersion?: string
  }
  entra: {
    tenantId: string
    clientId: string
  }
  documentation: Record<DocumentationTarget, DocumentationRoute>
}

export type EnvironmentValues = Record<string, string | boolean | undefined>

export function createPortalConfig(env: EnvironmentValues): PortalConfig {
  return {
    apim: {
      serviceName: stringValue(env.VITE_APIM_SERVICE_NAME),
      resourceGroup: stringValue(env.VITE_APIM_RESOURCE_GROUP),
      subscriptionId: stringValue(env.VITE_AZURE_SUBSCRIPTION_ID),
      portalUrl: stringValue(env.VITE_APIM_PORTAL_URL),
      gatewayUrl: stringValue(env.VITE_APIM_GATEWAY_URL),
      dataApiBaseUrl: stringValue(env.VITE_APIM_DATA_API_BASE_URL, "/api/apim"),
      dataApiVersion: optionalString(env.VITE_APIM_DATA_API_VERSION),
    },
    entra: {
      tenantId: stringValue(env.VITE_AZURE_TENANT_ID),
      clientId: stringValue(env.VITE_AZURE_CLIENT_ID),
    },
    documentation: {
      native: route(env, "NATIVE", "/api-details"),
      scalar: route(env, "SCALAR", "/custom-api-details"),
      swagger: route(env, "SWAGGER", "/custom-apis-swagger"),
    },
  }
}

function route(env: EnvironmentValues, name: string, fallbackPath: string): DocumentationRoute {
  const mode = optionalString(env[`VITE_DOCS_${name}_PARAMETER_MODE`])
  return {
    path: stringValue(env[`VITE_DOCS_${name}_PATH`], fallbackPath),
    parameterMode: mode === "query" ? "query" : "hash",
  }
}

function optionalString(value: string | boolean | undefined): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : ""
  return normalized || undefined
}

function stringValue(value: string | boolean | undefined, fallback = ""): string {
  return optionalString(value) || fallback
}
