import type {ApiItem} from "@portdebarcelona/apim-core"
import type {DocumentationViewer} from "./types"

export function buildDocumentationHref(viewer: DocumentationViewer, api: ApiItem): string {
  const path = `/api/${encodeURIComponent(api.name)}/${viewer}`
  if (!api.apiVersion) return path
  return `${path}?${new URLSearchParams({version: api.apiVersion})}`
}

export function buildManagedPortalApiDetailsUrl(
  managedPortalUrl: string,
  api: Pick<ApiItem, "name" | "apiVersion">,
  operationId?: string,
): string {
  const baseUrl = managedPortalUrl.endsWith("/") ? managedPortalUrl : `${managedPortalUrl}/`
  const url = new URL("api-details", baseUrl)
  const parameters = new URLSearchParams({api: api.name})
  if (api.apiVersion) parameters.set("version", api.apiVersion)
  if (operationId) parameters.set("operation", operationId)
  url.hash = parameters.toString()
  return url.toString()
}
