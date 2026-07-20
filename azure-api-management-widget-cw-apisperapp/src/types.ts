export interface ApimWidgetSecrets {
  managementApiUrl: string
  apiVersion: string
  token?: string
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
  }
}

export interface ApimTagRaw {
  name?: string
  properties?: {
    displayName?: string
  }
}

export interface ApimListResponse<T> {
  value?: T[]
  nextLink?: string
}

export interface LatestApiCandidate {
  api: ApimApiRaw
  label: string
  groupKey: string
  displayName: string
}

export interface ApplicationApiVersion {
  id: string
  name: string
  label: string
  description: string
}

export interface ApplicationApiItem {
  id: string
  groupKey: string
  displayName: string
  versions: ApplicationApiVersion[]
}

export type ApplicationGroups = Record<string, ApplicationApiItem[]>

export interface ApplicationGroupRow {
  name: string
  apis: ApplicationApiItem[]
  apiCount: number
}

export type RequestFn = (pathOrUrl: string) => Promise<Response>
export type ViewMode = "table" | "cards"
