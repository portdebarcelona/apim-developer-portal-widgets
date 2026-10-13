import type {ApiGroup, ApiItem, ApimApiRaw, ApimSubscriptionRaw} from "./types"

export function mapApi(api: ApimApiRaw): ApiItem {
  const properties = api.properties || {}

  return {
    id: api.id || api.name,
    name: api.name,
    displayName: properties.displayName || api.name,
    description: properties.description || "",
    apiVersion: properties.apiVersion || "",
    apiRevision: properties.apiRevision || "",
    versionSetId: properties.apiVersionSetId || "",
    tags: [],
  }
}

export function getApiGroupId(api: ApiItem): string {
  return api.versionSetId || api.displayName.trim().toLocaleLowerCase("es") || api.name
}

export function compareApiVersions(a: ApiItem, b: ApiItem): number {
  const aVersion = a.apiVersion || a.apiRevision || a.name
  const bVersion = b.apiVersion || b.apiRevision || b.name

  return aVersion.localeCompare(bVersion, "es", {numeric: true, sensitivity: "base"})
}

export function groupApisByVersion(apis: ApiItem[]): ApiGroup[] {
  const groups = new Map<string, ApiGroup>()

  apis.forEach((api) => {
    const id = getApiGroupId(api)
    const existing = groups.get(id)

    if (existing) {
      existing.versions.push(api)
    } else {
      groups.set(id, {id, displayName: api.displayName, versions: [api]})
    }
  })

  return Array.from(groups.values())
    .map((group) => ({...group, versions: group.versions.slice().sort(compareApiVersions)}))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es", {sensitivity: "base"}))
}

export function formatVersionLabel(api: Pick<ApiItem, "apiVersion" | "apiRevision">): string {
  const value = api.apiVersion || api.apiRevision
  if (!value) {
    return "Versión base"
  }

  return value.trim().toLowerCase().startsWith("v") ? value : `v${value}`
}

export function getSubscribedProductNames(subscriptions: ApimSubscriptionRaw[]): Set<string> {
  const products = new Set<string>()

  subscriptions.forEach((subscription) => {
    const scope = subscription.properties?.scope || ""
    const match = scope.match(/\/products\/([^/]+)/i)
    if (match?.[1]) {
      products.add(decodeURIComponent(match[1]))
    }
  })

  return products
}

export function extractApplicationNames(tags: Array<string | {name?: string; properties?: {displayName?: string}}>): string[] {
  return Array.from(new Set(tags
    .map((tag) => typeof tag === "string" ? tag : tag.properties?.displayName || tag.name || "")
    .filter((tag) => tag.startsWith("app:"))
    .map((tag) => tag.slice(4).trim())
    .filter(Boolean)))
}
