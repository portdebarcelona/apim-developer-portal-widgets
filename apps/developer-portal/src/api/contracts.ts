import type {ApiGroup, ApiItem} from "@portdebarcelona/apim-core"

export type CatalogApi = ApiItem
export type CatalogApiGroup = ApiGroup

export interface ApplicationCatalog {
  name: string
  apis: CatalogApiGroup[]
}

export interface ProductCatalog {
  id: string
  name: string
  displayName: string
  description: string
  apiCount: number
  apis: CatalogApiGroup[]
}

export interface CurrentUser {
  id: string
  displayName: string
  email: string
  groupResolutionComplete: boolean
}
