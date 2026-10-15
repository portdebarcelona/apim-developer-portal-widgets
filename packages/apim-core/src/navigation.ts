import type {DocumentationRoute, DocumentationTarget, PortalConfig} from "./config"

export interface ApiDocumentationSelection {
  apiName: string
  apiVersion?: string
}

export function buildApiDocumentationUrl(
  target: DocumentationTarget,
  selection: ApiDocumentationSelection,
  config: Pick<PortalConfig, "apim" | "documentation">,
  currentOrigin?: string,
): string {
  const route = config.documentation[target]
  const origin = config.apim.portalUrl || currentOrigin || browserOrigin()
  const url = new URL(route.path, origin)
  applySelection(url, route, selection)
  return url.toString()
}

export function openApiDocumentation(
  target: DocumentationTarget,
  selection: ApiDocumentationSelection,
  config: Pick<PortalConfig, "apim" | "documentation">,
): void {
  const url = buildApiDocumentationUrl(target, selection, config)
  const opened = window.open(url, "_blank")

  if (opened) {
    opened.opener = null
    return
  }

  window.location.assign(url)
}

function applySelection(
  url: URL,
  route: DocumentationRoute,
  selection: ApiDocumentationSelection,
): void {
  if (route.parameterMode === "query") {
    url.searchParams.set("api", selection.apiName)
    if (selection.apiVersion) {
      url.searchParams.set("version", selection.apiVersion)
    }
    return
  }

  const hash = new URLSearchParams()
  hash.set("api", selection.apiName)
  if (selection.apiVersion) {
    hash.set("version", selection.apiVersion)
  }
  url.hash = hash.toString()
}

function browserOrigin(): string {
  if (typeof window === "undefined") {
    throw new Error("A portal URL or current origin is required")
  }

  try {
    return window.parent.location.origin
  } catch {
    return window.location.origin
  }
}
