import {defineConfig, loadEnv} from "vite"
import vue from "@vitejs/plugin-vue"
import {readFileSync, writeFileSync} from "node:fs"
import {fileURLToPath} from "node:url"

const appDirectory = fileURLToPath(new URL(".", import.meta.url))

function getHttpsOrigin(value: string, variableName: string): string {
  if (!value) return ""
  const url = new URL(value)
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error(`${variableName} must use HTTPS outside localhost`)
  }
  return url.origin
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, "../..", "")

  if (mode === "production") {
    if (env.VITE_AUTH_MODE !== "entra") {
      throw new Error("Production builds require VITE_AUTH_MODE=entra")
    }

    const requiredVariables = [
      "VITE_ENTRA_CLIENT_ID",
      "VITE_ENTRA_TENANT_ID",
      "VITE_BFF_SCOPE",
      "VITE_BFF_BASE_URL",
      "VITE_APIM_PORTAL_URL",
      "VITE_APIM_GATEWAY_URL",
      "VITE_DOCS_CLIENT_ID",
      "VITE_DOCS_TENANT_ID",
      "VITE_DOCS_REDIRECT_BASE_URL",
    ]
    const missingVariables = requiredVariables.filter((name) => !env[name])
    if (missingVariables.length > 0) {
      throw new Error(`Production build is missing: ${missingVariables.join(", ")}`)
    }
  }

  const bffUrl = env.VITE_BFF_BASE_URL || "https://localhost:7247"
  const bffConnectSource = getHttpsOrigin(env.VITE_BFF_BASE_URL || "", "VITE_BFF_BASE_URL")
  const apimGatewaySource = getHttpsOrigin(env.VITE_APIM_GATEWAY_URL || "", "VITE_APIM_GATEWAY_URL")
  const docsMetadataUrl = env.VITE_DOCS_TENANT_ID
    ? `https://login.microsoftonline.com/${encodeURIComponent(env.VITE_DOCS_TENANT_ID)}/v2.0/.well-known/openid-configuration`
    : ""

  return {
    appType: "spa",
    plugins: [
      vue(),
      {
        name: "scalar-oauth-metadata",
        generateBundle(_options, bundle) {
          if (!docsMetadataUrl) return
          for (const output of Object.values(bundle)) {
            if (output.type !== "chunk") continue
            output.code = output.code
              .replaceAll("https://example.com/.well-known/oauth-authorization-server", docsMetadataUrl)
              .replaceAll("https://example.com/.well-known/openid-configuration", docsMetadataUrl)
          }
        },
      },
      {
        name: "azure-static-web-app-config",
        writeBundle: {
          sequential: true,
          handler() {
            const template = readFileSync(`${appDirectory}/staticwebapp.config.json`, "utf8")
            const rendered = template
              .replace("__BFF_CONNECT_SOURCE__", bffConnectSource)
              .replace("__APIM_GATEWAY_SOURCE__", apimGatewaySource)
            if (rendered.includes("__BFF_CONNECT_SOURCE__") || rendered.includes("__APIM_GATEWAY_SOURCE__")) {
              throw new Error("Static Web Apps configuration contains an unresolved CSP placeholder")
            }
            JSON.parse(rendered)
            writeFileSync(`${appDirectory}/dist/staticwebapp.config.json`, rendered)
          },
        },
      },
    ],
    envDir: "../..",
    server: {
      port: 5173,
      proxy: {
        "/api/catalog": {target: bffUrl, changeOrigin: true, secure: false},
        "/api/me": {target: bffUrl, changeOrigin: true, secure: false},
        "/healthz": {target: bffUrl, changeOrigin: true, secure: false},
      },
    },
    test: {
      environment: "node",
    },
  }
})
