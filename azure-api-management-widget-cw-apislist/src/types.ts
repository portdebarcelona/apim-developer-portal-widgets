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

export type RequestFn = (path: string) => Promise<Response>
export type ViewMode = "table" | "cards"
