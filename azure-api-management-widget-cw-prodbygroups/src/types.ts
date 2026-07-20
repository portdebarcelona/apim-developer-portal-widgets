export interface ApimWidgetSecrets {
  managementApiUrl: string
  apiVersion: string
  token?: string
  userId?: string
}

export interface ApimProductRaw {
  id?: string
  name: string
  properties?: {
    displayName?: string
    description?: string
  }
}

export interface ApimProductListResponse {
  value?: ApimProductRaw[]
  nextLink?: string
}

export interface ApimApiRaw {
  id?: string
  name: string
  properties?: {
    displayName?: string
    description?: string
    apiVersion?: string
  }
}

export interface ApimApiListResponse {
  value?: ApimApiRaw[]
  nextLink?: string
}

export interface ApimSubscriptionRaw {
  properties?: {
    scope?: string
  }
}

export interface ApimSubscriptionListResponse {
  value?: ApimSubscriptionRaw[]
  nextLink?: string
}

export interface ApiItem {
  id: string
  name: string
  displayName: string
  description: string
  apiVersion: string
}

export interface ApiGroup {
  id: string
  displayName: string
  versions: ApiItem[]
}

export interface ProductItem {
  id: string
  name: string
  displayName: string
  description: string
  apiCount: number
  apis: ApiGroup[]
  isSubscribed: boolean
}

export type RequestFn = (path: string) => Promise<Response>
export type ViewMode = "table" | "cards"
