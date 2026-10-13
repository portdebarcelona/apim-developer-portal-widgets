import {describe, expect, it, vi} from "vitest"
import {createSSRApp} from "vue"
import {renderToString} from "@vue/server-renderer"
import {
  ApimClient,
  buildApiDocumentationUrl,
  extractApplicationNames,
  groupApisByVersion,
  type ApiItem,
  type PortalConfig,
} from "@portdebarcelona/apim-core"
import {buildDocumentationHref, buildManagedPortalApiDetailsUrl} from "../src/documentation/navigation"
import {createDocumentationOAuthConfiguration} from "../src/documentation/oauth"
import type {JsonObject} from "../src/documentation/types"
import {MockAuthClient} from "../src/auth/mockAuthClient"
import {createMsalConfiguration, selectCachedAccount} from "../src/auth/msalAuthClient"
import {BffClient} from "../src/api/bffClient"
import ApiActions from "../src/components/catalog/ApiActions.vue"
import DocksLinksMenu from "../src/components/navigation/DocksLinksMenu.vue"
import {docksPortalLinks} from "../src/navigation/externalLinks"
import type {AuthClient, PortalAccount} from "../src/auth/types"
import {readRuntimeConfig, type PortalRuntimeConfig} from "../src/config"

function api(overrides: Partial<ApiItem>): ApiItem {
  return {
    id: overrides.id || overrides.name || "api",
    name: overrides.name || "api",
    displayName: overrides.displayName || "API",
    description: "",
    apiVersion: "",
    apiRevision: "",
    versionSetId: "",
    tags: [],
    ...overrides,
  }
}

describe("application tags", () => {
  it("extracts unique non-empty app names and ignores unrelated tags", () => {
    expect(extractApplicationNames([
      "domain:port", "app:MPT-AEATService", "app:MPT-AEATService", "app: Billing ", "App:ignored",
    ])).toEqual(["MPT-AEATService", "Billing"])
  })
})

describe("API version grouping", () => {
  it("prefers version set ID and supports unversioned APIs", () => {
    const groups = groupApisByVersion([
      api({id: "one-v1", name: "one-v1", displayName: "Renamed one", apiVersion: "1", versionSetId: "/versionSets/one"}),
      api({id: "one-v2", name: "one-v2", displayName: "One", apiVersion: "2", versionSetId: "/versionSets/one"}),
      api({id: "plain", name: "plain", displayName: "Plain API"}),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.id === "/versionSets/one")?.versions.map((item) => item.apiVersion)).toEqual(["1", "2"])
    expect(groups.find((group) => group.id === "plain api")?.versions[0].name).toBe("plain")
  })
})

describe("APIM pagination", () => {
  it("follows nextLink and adds the API version", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      return new Response(JSON.stringify(url.includes("page=2")
        ? {value: [{name: "two"}]}
        : {value: [{name: "one"}], nextLink: "https://example.test/apim/apis?page=2"}),
      {status: 200, headers: {"Content-Type": "application/json"}})
    })
    const client = new ApimClient({baseUrl: "https://example.test/apim/", apiVersion: "2024-05-01", fetchImpl})

    await expect(client.getAll<{name: string}>("/apis")).resolves.toEqual([{name: "one"}, {name: "two"}])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[1][0])).toContain("api-version=2024-05-01")
  })

  it("rejects pagination loops", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      value: [], nextLink: "https://example.test/apim/apis",
    }), {status: 200, headers: {"Content-Type": "application/json"}}))
    const client = new ApimClient({baseUrl: "https://example.test/apim/", fetchImpl})
    await expect(client.getAll("/apis")).rejects.toThrow("pagination loop")
  })
})

describe("documentation navigation", () => {
  const config: Pick<PortalConfig, "apim" | "documentation"> = {
    apim: {
      serviceName: "apim-cmn-core", resourceGroup: "rg-common-core", subscriptionId: "subscription",
      portalUrl: "https://portal.example/", gatewayUrl: "https://gateway.example/",
      dataApiBaseUrl: "/api/apim",
    },
    documentation: {
      native: {path: "/api-details", parameterMode: "hash"},
      scalar: {path: "/api/:apiId/scalar", parameterMode: "query"},
      swagger: {path: "/api/:apiId/swagger", parameterMode: "query"},
    },
  }

  it("generates managed portal hash navigation", () => {
    expect(buildApiDocumentationUrl("native", {apiName: "orders-v2", apiVersion: "2"}, config))
      .toBe("https://portal.example/api-details#api=orders-v2&version=2")
  })

  it("generates standalone query navigation", () => {
    expect(buildApiDocumentationUrl("swagger", {apiName: "orders/v2", apiVersion: "2"}, config))
      .toBe("https://portal.example/api/:apiId/swagger?api=orders%2Fv2&version=2")
  })

  it.each(["scalar", "swagger"] as const)("generates the internal %s href with the selected version", (viewer) => {
    expect(buildDocumentationHref(viewer, api({name: "apb-api-countries-v1", apiVersion: "v1"})))
      .toBe(`/api/apb-api-countries-v1/${viewer}?version=v1`)
  })

  it("omits a version query for an API without a version set", () => {
    expect(buildDocumentationHref("scalar", api({name: "plain-api"})))
      .toBe("/api/plain-api/scalar")
  })

  it("builds the Local-PRE managed APIM details link with API, version, and operation", () => {
    expect(buildManagedPortalApiDetailsUrl(
      "https://apim-cmn-pre.developer.azure-api.net/",
      api({name: "apb-api-countries-v1", apiVersion: "v1"}),
      "post-api-v1-countrypoc",
    )).toBe(
      "https://apim-cmn-pre.developer.azure-api.net/api-details#api=apb-api-countries-v1&version=v1&operation=post-api-v1-countrypoc",
    )
  })

  it("uses the configured Core managed portal and omits absent optional parameters", () => {
    expect(buildManagedPortalApiDetailsUrl(
      "https://apim-cmn-core.developer.azure-api.net/",
      api({name: "plain-api"}),
    )).toBe("https://apim-cmn-core.developer.azure-api.net/api-details#api=plain-api")
  })
})

describe("catalog documentation actions", () => {
  it("renders Scalar, APIM, and Swagger as semantic links", async () => {
    const selectedApi = api({name: "apb-api-countries-v1", apiVersion: "v1"})
    const app = createSSRApp(ApiActions, {api: selectedApi, operationId: "get-api-v1-country"})
    app.provide("runtimeConfig", {
      authMode: "mock",
      mockAuthInitialState: "authenticated",
      entraClientId: "",
      entraTenantId: "tenant",
      bffScope: "",
      bffBaseUrl: "",
      managedPortalUrl: "https://apim-cmn-pre.developer.azure-api.net/",
      docsClientId: "docs",
      docsTenantId: "tenant",
      docsRedirectBaseUrl: "http://localhost:5173",
    } satisfies PortalRuntimeConfig)

    const html = await renderToString(app)

    expect(html.match(/<a\b/g)).toHaveLength(3)
    expect(html).not.toContain("<button")
    expect(html).toContain('href="/api/apb-api-countries-v1/scalar?version=v1"')
    expect(html).toContain('href="/api/apb-api-countries-v1/swagger?version=v1"')
    expect(html.match(/target="_blank"/g)).toHaveLength(3)
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(3)
    expect(html).toContain(
      "https://apim-cmn-pre.developer.azure-api.net/api-details#api=apb-api-countries-v1&amp;version=v1&amp;operation=get-api-v1-country",
    )
  })
})

describe("legacy DOCKS navigation", () => {
  it("keeps the four external destinations in configuration", () => {
    expect(docksPortalLinks).toEqual([
      {label: "Docks", href: "https://docks.portdebarcelona.cat"},
      {label: "Docks Pre", href: "https://dockspre.portdebarcelona.cat"},
      {label: "Gestramdes", href: "https://gestramdes.portdebarcelona.cat/"},
      {label: "Docks Sharepoint", href: "https://portdebarcelona.sharepoint.com/sites/Docks"},
    ])
  })

  it("renders every destination as a secure new-tab link", async () => {
    const html = await renderToString(createSSRApp(DocksLinksMenu))

    expect(html).toContain("Enlaces DOCKS")
    for (const link of docksPortalLinks) {
      expect(html).toContain(`href="${link.href}"`)
      expect(html).toContain(link.label)
    }
    expect(html.match(/target="_blank"/g)).toHaveLength(4)
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(4)
  })
})

describe("documentation OAuth", () => {
  it("generates authorization-code PKCE configuration from API-specific metadata", () => {
    const oauth = createDocumentationOAuthConfiguration({
      openapi: "3.0.1",
      info: {title: "Countries", version: "v1"},
      components: {securitySchemes: {entra: {
        type: "oauth2",
        flows: {authorizationCode: {
          authorizationUrl: "https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize",
          tokenUrl: "https://login.microsoftonline.com/tenant/oauth2/v2.0/token",
          scopes: {"api://resource-app/.default": "Countries"},
        }},
      }}},
    }, {
      docsClientId: "docs-client",
      docsTenantId: "tenant",
      docsRedirectBaseUrl: "https://portal.example",
    })

    expect(oauth.swaggerOAuth).toMatchObject({
      clientId: "docs-client",
      scopes: ["api://resource-app/.default"],
      usePkceWithAuthorizationCodeGrant: true,
    })
    expect(oauth.scalarAuthentication?.securitySchemes.entra).toMatchObject({
      oauth2MetadataUrl: "https://login.microsoftonline.com/tenant/v2.0/.well-known/openid-configuration",
      flows: {authorizationCode: {
        "x-scalar-client-id": "docs-client",
        "x-usePkce": "SHA-256",
        "x-scalar-redirect-uri": "https://portal.example/oauth2/scalar-callback",
      }},
    })
    expect(oauth.swaggerRedirectUri).toBe("https://portal.example/oauth2/swagger-callback.html")
  })

  it("replaces placeholder OAuth metadata with the configured Entra v2 endpoints", () => {
    const oauth = createDocumentationOAuthConfiguration({
      openapi: "3.0.1",
      info: {title: "Countries", version: "v1"},
      components: {securitySchemes: {
        entra: {
          type: "oauth2",
          flows: {authorizationCode: {
            authorizationUrl: ["https://example", ".com/oauth/authorize"].join(""),
            tokenUrl: ["https://example", ".com/oauth/token"].join(""),
            scopes: {"api://resource-app/.default": "Countries"},
          }},
        },
        discovery: {
          type: "openIdConnect",
          openIdConnectUrl: ["https://example", ".com/.well-known/oauth-authorization-server"].join(""),
        },
      }},
    }, {
      docsClientId: "76e21c21-a10d-45c2-ac0f-3d4e240a228c",
      docsTenantId: "3b6f65fd-e602-4e25-a81a-eb5ef7376512",
      docsRedirectBaseUrl: "https://portal.example",
    })

    const rendered = JSON.stringify(oauth)
    expect(rendered).not.toContain("example.com")
    expect(oauth.scalarAuthentication?.securitySchemes.entra).toMatchObject({
      oauth2MetadataUrl: "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/v2.0/.well-known/openid-configuration",
    })
    expect(oauth.specification.components?.securitySchemes?.entra).toMatchObject({
      flows: {authorizationCode: {
        authorizationUrl: "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/oauth2/v2.0/token",
      }},
    })
    expect(oauth.specification.components?.securitySchemes?.discovery).toMatchObject({
      openIdConnectUrl: "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/v2.0/.well-known/openid-configuration",
    })
  })

  it("preserves API-specific OAuth endpoints and the COUNTRIES duplicated v1 server path", () => {
    const oauth = createDocumentationOAuthConfiguration({
      openapi: "3.0.1",
      info: {title: "APB.API.COUNTRIES", version: "v1"},
      servers: [{url: "https://apim-cmn-pre.azure-api.net/ctr/v1/v1"}],
      components: {securitySchemes: {entra: {
        type: "oauth2",
        flows: {authorizationCode: {
          authorizationUrl: "https://identity.example.test/authorize",
          tokenUrl: "https://identity.example.test/token",
          scopes: {"api://aff61051-890f-4ca5-b630-b7eb9c007d69/.default": "Countries"},
        }},
      }}},
    }, {
      docsClientId: "docs-client",
      docsTenantId: "tenant",
      docsRedirectBaseUrl: "https://portal.example",
    })

    expect(oauth.specification.servers).toEqual([
      {url: "https://apim-cmn-pre.azure-api.net/ctr/v1/v1"},
    ])
    expect(oauth.specification.components?.securitySchemes?.entra).toMatchObject({
      flows: {authorizationCode: {
        authorizationUrl: "https://identity.example.test/authorize",
        tokenUrl: "https://identity.example.test/token",
      }},
    })
  })

  it("hides only APIM subscription-key schemes from the Scalar and Swagger viewer copy", () => {
    const oauth = createDocumentationOAuthConfiguration({
      openapi: "3.0.1",
      info: {title: "APB.API.COUNTRIES", version: "v1"},
      security: [
        {apiKeyHeader: []},
        {apiKeyQuery: []},
        {"sp-apim-apbapipre": ["api://resource-app/.default"]},
      ],
      paths: {"/api/v1/Country": {get: {security: [{apiKeyHeader: [], customApiKey: []}]}}},
      components: {securitySchemes: {
        apiKeyHeader: {type: "apiKey", name: "Ocp-Apim-Subscription-Key", in: "header"},
        apiKeyQuery: {type: "apiKey", name: "subscription-key", in: "query"},
        customApiKey: {type: "apiKey", name: "X-Countries-Key", in: "header"},
        "sp-apim-apbapipre": {
          type: "oauth2",
          flows: {authorizationCode: {
            authorizationUrl: "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/oauth2/v2.0/authorize",
            tokenUrl: "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512/oauth2/v2.0/token",
            scopes: {"api://resource-app/.default": "Countries"},
          }},
        },
      }},
    }, {
      docsClientId: "76e21c21-a10d-45c2-ac0f-3d4e240a228c",
      docsTenantId: "3b6f65fd-e602-4e25-a81a-eb5ef7376512",
      docsRedirectBaseUrl: "https://portal.example",
    })

    const schemes = oauth.specification.components?.securitySchemes || {}
    expect(schemes).not.toHaveProperty("apiKeyHeader")
    expect(schemes).not.toHaveProperty("apiKeyQuery")
    expect(schemes).toHaveProperty("customApiKey")
    expect(schemes).toHaveProperty("sp-apim-apbapipre")
    expect(oauth.specification.security).toEqual([
      {"sp-apim-apbapipre": ["api://resource-app/.default"]},
    ])
    expect((oauth.specification.paths as JsonObject)["/api/v1/Country"]).toMatchObject({
      get: {security: [{customApiKey: []}]},
    })
    expect(oauth.scalarAuthentication?.securitySchemes).toHaveProperty("sp-apim-apbapipre")
    expect(oauth.scalarAuthentication?.securitySchemes).not.toHaveProperty("apiKeyHeader")
    expect(oauth.swaggerOAuth).toMatchObject({
      clientId: "76e21c21-a10d-45c2-ac0f-3d4e240a228c",
      scopes: ["api://resource-app/.default"],
      usePkceWithAuthorizationCodeGrant: true,
    })
  })
})

describe("local mock authentication states", () => {
  it("can start anonymous and sign in explicitly", async () => {
    const auth = new MockAuthClient("anonymous")
    expect(auth.account()).toBeNull()
    await expect(auth.getAccessToken()).rejects.toThrow("Authentication is required")
    await auth.login()
    expect(auth.account()?.username).toBe("developer@localhost")
  })

  it("can start authenticated and return to the sign-in state", async () => {
    const auth = new MockAuthClient("authenticated")
    expect(auth.account()?.name).toBe("Desarrollo local")
    await auth.logout()
    expect(auth.account()).toBeNull()
  })
})

describe("MSAL multi-tab authentication", () => {
  const config: PortalRuntimeConfig = {
    authMode: "entra",
    mockAuthInitialState: "anonymous",
    entraClientId: "77d0c0da-28fa-497c-abb1-92e4467e3fcb",
    entraTenantId: "3b6f65fd-e602-4e25-a81a-eb5ef7376512",
    bffScope: "api://6e5d71ad-3705-455b-bb0d-779331e46c78/access_as_user",
    bffBaseUrl: "https://bff.example.test",
    managedPortalUrl: "https://apim-cmn-pre.developer.azure-api.net/",
    docsClientId: "76e21c21-a10d-45c2-ac0f-3d4e240a228c",
    docsTenantId: "3b6f65fd-e602-4e25-a81a-eb5ef7376512",
    docsRedirectBaseUrl: "https://portal.example.test",
  }

  it("uses the MSAL localStorage cache for cross-tab account and token discovery", () => {
    const msal = createMsalConfiguration(config, "https://portal.example.test")
    expect(msal.cache?.cacheLocation).toBe("localStorage")
    expect(msal.auth.authority).toBe(
      "https://login.microsoftonline.com/3b6f65fd-e602-4e25-a81a-eb5ef7376512",
    )
    expect(msal.auth.redirectUri).toBe("https://portal.example.test")
  })

  it("restores the shared active account and avoids guessing between multiple accounts", () => {
    const first = {homeAccountId: "first"} as never
    const second = {homeAccountId: "second"} as never
    expect(selectCachedAccount(second, [first, second])).toBe(second)
    expect(selectCachedAccount(null, [first])).toBe(first)
    expect(selectCachedAccount(null, [first, second])).toBeNull()
  })

  it("notifies consumers when mock login and logout change the account", async () => {
    const auth = new MockAuthClient("anonymous")
    const accounts: Array<PortalAccount | null> = []
    const stop = auth.onAccountChanged((account) => accounts.push(account))
    await auth.login()
    await auth.logout()
    stop()
    expect(accounts.map((account) => account?.username || null)).toEqual(["developer@localhost", null])
  })
})

describe("local PRE Entra configuration", () => {
  it("keeps portal login and documentation OAuth clients separate", () => {
    const config = readRuntimeConfig({
      VITE_AUTH_MODE: "entra",
      VITE_ENTRA_CLIENT_ID: "77d0c0da-28fa-497c-abb1-92e4467e3fcb",
      VITE_ENTRA_TENANT_ID: "3b6f65fd-e602-4e25-a81a-eb5ef7376512",
      VITE_BFF_SCOPE: "api://6e5d71ad-3705-455b-bb0d-779331e46c78/access_as_user",
      VITE_BFF_BASE_URL: "",
      VITE_APIM_PORTAL_URL: "https://apim-cmn-pre.developer.azure-api.net/",
      VITE_DOCS_CLIENT_ID: "76e21c21-a10d-45c2-ac0f-3d4e240a228c",
      VITE_DOCS_TENANT_ID: "3b6f65fd-e602-4e25-a81a-eb5ef7376512",
      VITE_DOCS_REDIRECT_BASE_URL: "http://localhost:5173",
    } as unknown as ImportMetaEnv)

    expect(config).toMatchObject({
      authMode: "entra",
      entraClientId: "77d0c0da-28fa-497c-abb1-92e4467e3fcb",
      bffScope: "api://6e5d71ad-3705-455b-bb0d-779331e46c78/access_as_user",
      bffBaseUrl: "",
      managedPortalUrl: "https://apim-cmn-pre.developer.azure-api.net/",
      docsClientId: "76e21c21-a10d-45c2-ac0f-3d4e240a228c",
    })
    expect(config.docsClientId).not.toBe(config.entraClientId)
  })
})

describe("catalog request reuse", () => {
  it("deduplicates concurrent requests and reuses the short-lived response", async () => {
    const auth: AuthClient = {
      initialize: async () => {}, login: async () => {}, logout: async () => {},
      getAccessToken: async () => "test-token",
      account: () => ({id: "catalog-cache-test", name: "Test", username: "test@example.test"}),
      onAccountChanged: () => () => {},
    }
    const config: PortalRuntimeConfig = {
      authMode: "mock", mockAuthInitialState: "authenticated", entraClientId: "", entraTenantId: "",
      bffScope: "", bffBaseUrl: "https://bff.example.test", managedPortalUrl: "https://portal.example.test",
      docsClientId: "docs", docsTenantId: "tenant", docsRedirectBaseUrl: "https://spa.example.test",
    }
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([{id: "countries"}]), {
      status: 200,
      headers: {"Content-Type": "application/json"},
    }))
    const client = new BffClient(config, auth, fetchImpl)

    const [first, second] = await Promise.all([
      client.getCatalog<{id: string}[]>("/api/catalog/apis"),
      client.getCatalog<{id: string}[]>("/api/catalog/apis"),
    ])
    const third = await client.getCatalog<{id: string}[]>("/api/catalog/apis")

    expect(first).toEqual(second)
    expect(third).toEqual(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
