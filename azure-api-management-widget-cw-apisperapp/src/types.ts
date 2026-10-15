export type {
  ApimApiRaw,
  ApimListResponse,
  ApimTagRaw,
  ApimWidgetSecrets,
  RequestFn,
  ViewMode,
} from "@portdebarcelona/apim-core"

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
