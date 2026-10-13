export interface ApimWidgetSecrets {
  managementApiUrl: string
  apiVersion: string
  token?: string
  userId?: string
}

export interface ApimApiRaw {
  id?: string
  name: string
  properties?: {
    displayName?: string
    description?: string
    apiVersion?: string
    apiRevision?: string
    apiVersionSetId?: string
    path?: string
    protocols?: string[]
  }
}

export interface ApimTagRaw {
  id?: string
  name?: string
  properties?: {
    displayName?: string
  }
}

export interface ApimProductRaw {
  id?: string
  name: string
  properties?: {
    displayName?: string
    description?: string
    state?: string
    subscriptionRequired?: boolean
  }
}

export interface ApimSubscriptionRaw {
  id?: string
  name?: string
  properties?: {
    scope?: string
    state?: string
  }
}

export interface ApimListResponse<T> {
  value?: T[]
  nextLink?: string
}

export type RequestFn = (pathOrUrl: string, init?: RequestInit) => Promise<Response>

export interface ApiItem {
  id: string
  name: string
  displayName: string
  description: string
  apiVersion: string
  apiRevision: string
  versionSetId: string
  tags?: string[]
}

export interface ApiGroup {
  id: string
  displayName: string
  versions: ApiItem[]
}

export type ViewMode = "table" | "cards"
