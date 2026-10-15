import type {PortalRuntimeConfig} from "../config"
import type {JsonObject, OpenApiDocument} from "./types"

interface OAuthFlow extends JsonObject {
  authorizationUrl?: string
  tokenUrl?: string
  scopes?: Record<string, string>
}

export interface DocumentationOAuthConfiguration {
  specification: OpenApiDocument
  scalarAuthentication?: {securitySchemes: Record<string, JsonObject>}
  scalarRedirectUri: string
  swaggerOAuth?: {
    clientId: string
    appName: string
    scopes: string[]
    usePkceWithAuthorizationCodeGrant: true
  }
  swaggerRedirectUri: string
}

export function createDocumentationOAuthConfiguration(
  specification: OpenApiDocument,
  config: Pick<PortalRuntimeConfig, "docsClientId" | "docsTenantId" | "docsRedirectBaseUrl">,
): DocumentationOAuthConfiguration {
  const scalarRedirectUri = `${config.docsRedirectBaseUrl}/oauth2/scalar-callback`
  const swaggerRedirectUri = `${config.docsRedirectBaseUrl}/oauth2/swagger-callback.html`
  const normalizedSpecification = normalizeDocumentationOAuthSpecification(specification, config.docsTenantId)
  const documentationSpecification = filterApimSubscriptionKeySchemes(normalizedSpecification)
  const schemes = findSecuritySchemes(documentationSpecification)
  const scalarSchemes: Record<string, JsonObject> = {}
  const scopes = new Set<string>()

  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type !== "oauth2") continue
    const flow = authorizationCodeFlow(scheme, config.docsTenantId)
    if (!flow) continue
    Object.keys(flow.scopes || {}).forEach((scope) => scopes.add(scope))

    scalarSchemes[name] = {
      ...scheme,
      oauth2MetadataUrl: validProviderUrl(scheme.oauth2MetadataUrl)
        ? scheme.oauth2MetadataUrl
        : tenantMetadataEndpoint(config.docsTenantId),
      flows: {
        ...asObject(scheme.flows),
        authorizationCode: {
          ...flow,
          "x-scalar-client-id": config.docsClientId,
          "x-scalar-redirect-uri": scalarRedirectUri,
          "x-usePkce": "SHA-256",
        },
      },
    }
  }

  const hasOAuth = Object.keys(scalarSchemes).length > 0 && config.docsClientId.length > 0
  return {
    specification: documentationSpecification,
    scalarAuthentication: hasOAuth ? {securitySchemes: scalarSchemes} : undefined,
    scalarRedirectUri,
    swaggerOAuth: hasOAuth ? {
      clientId: config.docsClientId,
      appName: documentationSpecification.info?.title || "Port de Barcelona API",
      scopes: [...scopes],
      usePkceWithAuthorizationCodeGrant: true,
    } : undefined,
    swaggerRedirectUri,
  }
}

/**
 * The managed APIM portal supplies subscription keys from its own user context,
 * which the standalone documentation viewers intentionally do not emulate.
 * Remove only APIM's generated subscription-key schemes from the viewer copy;
 * arbitrary API-owned apiKey schemes remain available.
 */
export function filterApimSubscriptionKeySchemes(specification: OpenApiDocument): OpenApiDocument {
  const schemes = findSecuritySchemes(specification)
  const suppressedNames = new Set(
    Object.entries(schemes)
      .filter(([name, scheme]) => isApimSubscriptionKeyScheme(name, scheme))
      .map(([name]) => name),
  )
  if (suppressedNames.size === 0) return specification

  const filteredSchemes = Object.fromEntries(
    Object.entries(schemes).filter(([name]) => !suppressedNames.has(name)),
  )
  const withFilteredDefinitions: OpenApiDocument = specification.components?.securitySchemes
    ? {
        ...specification,
        components: {...specification.components, securitySchemes: filteredSchemes},
      }
    : {...specification, securityDefinitions: filteredSchemes}

  return filterSecurityRequirements(withFilteredDefinitions, suppressedNames) as OpenApiDocument
}

/**
 * APIM definitions remain the source of truth for API-specific scopes and OAuth
 * providers. Missing, malformed, or obvious placeholder Entra URLs are replaced
 * with this portal's configured documentation tenant. The input document is not
 * mutated, so it remains safe to share with other viewers.
 */
export function normalizeDocumentationOAuthSpecification(
  specification: OpenApiDocument,
  tenantId: string,
): OpenApiDocument {
  const schemes = findSecuritySchemes(specification)
  if (Object.keys(schemes).length === 0) return specification

  const normalizedSchemes = Object.fromEntries(Object.entries(schemes).map(([name, scheme]) => [
    name,
    normalizeSecurityScheme(scheme, tenantId),
  ]))

  if (specification.components?.securitySchemes) {
    return {
      ...specification,
      components: {...specification.components, securitySchemes: normalizedSchemes},
    }
  }

  return {...specification, securityDefinitions: normalizedSchemes}
}

function findSecuritySchemes(specification: OpenApiDocument): Record<string, JsonObject> {
  return specification.components?.securitySchemes || specification.securityDefinitions || {}
}

function authorizationCodeFlow(scheme: JsonObject, tenantId: string): OAuthFlow | undefined {
  const flows = asObject(scheme.flows)
  const current = asObject(flows.authorizationCode) as OAuthFlow
  if (Object.keys(current).length > 0) {
    return {
      ...current,
      authorizationUrl: documentationEndpoint(current.authorizationUrl, tenantId, "authorize"),
      tokenUrl: documentationEndpoint(current.tokenUrl, tenantId, "token"),
    }
  }

  // OpenAPI 2 names the authorization-code flow "accessCode".
  if (scheme.flow === "accessCode") {
    return {
      authorizationUrl: documentationEndpoint(scheme.authorizationUrl, tenantId, "authorize"),
      tokenUrl: documentationEndpoint(scheme.tokenUrl, tenantId, "token"),
      scopes: asStringMap(scheme.scopes),
    }
  }
  return undefined
}

function normalizeSecurityScheme(scheme: JsonObject, tenantId: string): JsonObject {
  if (scheme.type === "openIdConnect") {
    return {
      ...scheme,
      openIdConnectUrl: validProviderUrl(scheme.openIdConnectUrl)
        ? scheme.openIdConnectUrl
        : tenantMetadataEndpoint(tenantId),
    }
  }

  if (scheme.type !== "oauth2") return scheme
  const flows = asObject(scheme.flows)
  const authorizationCode = asObject(flows.authorizationCode)
  if (Object.keys(authorizationCode).length > 0) {
    return {
      ...scheme,
      flows: {
        ...flows,
        authorizationCode: {
          ...authorizationCode,
          authorizationUrl: documentationEndpoint(authorizationCode.authorizationUrl, tenantId, "authorize"),
          tokenUrl: documentationEndpoint(authorizationCode.tokenUrl, tenantId, "token"),
        },
      },
    }
  }

  if (scheme.flow === "accessCode") {
    return {
      ...scheme,
      authorizationUrl: documentationEndpoint(scheme.authorizationUrl, tenantId, "authorize"),
      tokenUrl: documentationEndpoint(scheme.tokenUrl, tenantId, "token"),
    }
  }
  return scheme
}

function isApimSubscriptionKeyScheme(schemeId: string, scheme: JsonObject): boolean {
  if (String(scheme.type).toLowerCase() !== "apikey") return false
  const normalizedId = schemeId.toLowerCase()
  if (normalizedId === "apikeyheader" || normalizedId === "apikeyquery") return true

  const parameterName = String(scheme.name || "").toLowerCase()
  const location = String(scheme.in || "").toLowerCase()
  return (location === "header" && parameterName === "ocp-apim-subscription-key")
    || (location === "query" && parameterName === "subscription-key")
}

function filterSecurityRequirements(value: unknown, suppressedNames: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => filterSecurityRequirements(item, suppressedNames))
  if (!value || typeof value !== "object") return value

  const result: JsonObject = {}
  for (const [key, item] of Object.entries(value as JsonObject)) {
    if (key !== "security" || !Array.isArray(item)) {
      result[key] = filterSecurityRequirements(item, suppressedNames)
      continue
    }

    result[key] = item.flatMap((requirement) => {
      const current = asObject(requirement)
      const entries = Object.entries(current)
      const filtered = Object.fromEntries(entries.filter(([name]) => !suppressedNames.has(name)))
      return entries.length > 0 && Object.keys(filtered).length === 0 ? [] : [filtered]
    })
  }
  return result
}

function documentationEndpoint(value: unknown, tenantId: string, endpoint: "authorize" | "token"): string {
  return validProviderUrl(value) ? String(value) : tenantEndpoint(tenantId, endpoint)
}

function validProviderUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === "https:" && hostname !== "example.com" && !hostname.endsWith(".example.com")
  } catch {
    return false
  }
}

function tenantAuthority(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0`
}

function tenantMetadataEndpoint(tenantId: string): string {
  return `${tenantAuthority(tenantId)}/.well-known/openid-configuration`
}

function tenantEndpoint(tenantId: string, endpoint: "authorize" | "token"): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/${endpoint}`
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}
}

function asStringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(asObject(value)).map(([key, item]) => [key, String(item)]))
}
