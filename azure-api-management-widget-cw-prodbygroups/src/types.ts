import type {ApiGroup} from "@portdebarcelona/apim-core"

export type {
  ApiGroup,
  ApiItem,
  ApimApiRaw,
  ApimListResponse,
  ApimProductRaw,
  ApimSubscriptionRaw,
  ApimWidgetSecrets,
  RequestFn,
  ViewMode,
} from "@portdebarcelona/apim-core"

export interface ProductItem {
  id: string
  name: string
  displayName: string
  description: string
  apiCount: number
  apis: ApiGroup[]
  isSubscribed: boolean
}
