export interface PortalRuntimeConfig {
  authMode: "entra" | "mock"
  mockAuthInitialState: "anonymous" | "authenticated"
  entraClientId: string
  entraTenantId: string
  bffScope: string
  bffBaseUrl: string
  managedPortalUrl: string
  docsClientId: string
  docsTenantId: string
  docsRedirectBaseUrl: string
}

export function readRuntimeConfig(env: ImportMetaEnv = import.meta.env): PortalRuntimeConfig {
  const authMode = env.VITE_AUTH_MODE === "mock" ? "mock" : "entra"
  const config: PortalRuntimeConfig = {
    authMode,
    mockAuthInitialState: env.VITE_MOCK_AUTH_STATE === "anonymous" ? "anonymous" : "authenticated",
    entraClientId: env.VITE_ENTRA_CLIENT_ID || "",
    entraTenantId: env.VITE_ENTRA_TENANT_ID || "",
    bffScope: env.VITE_BFF_SCOPE || "",
    bffBaseUrl: (env.VITE_BFF_BASE_URL || "").replace(/\/$/, ""),
    managedPortalUrl: env.VITE_APIM_PORTAL_URL || "https://apim-cmn-core.developer.azure-api.net/",
    docsClientId: env.VITE_DOCS_CLIENT_ID || "",
    docsTenantId: env.VITE_DOCS_TENANT_ID || "",
    docsRedirectBaseUrl: (env.VITE_DOCS_REDIRECT_BASE_URL ||
      (typeof window === "undefined" ? "" : window.location.origin)).replace(/\/$/, ""),
  }

  if (!config.docsClientId || !config.docsTenantId || !config.docsRedirectBaseUrl) {
    throw new Error("VITE_DOCS_CLIENT_ID, VITE_DOCS_TENANT_ID and VITE_DOCS_REDIRECT_BASE_URL are required")
  }

  if (authMode === "entra" && (!config.entraClientId || !config.entraTenantId || !config.bffScope)) {
    throw new Error("VITE_ENTRA_CLIENT_ID, VITE_ENTRA_TENANT_ID and VITE_BFF_SCOPE are required")
  }

  return config
}
