import {
  createPortalConfig,
  openApiDocumentation,
  type DocumentationTarget,
} from "@portdebarcelona/apim-core"

const config = createPortalConfig(import.meta.env)

export function openApi(
  apiName: string | null | undefined,
  route: string,
  apiVersion?: string,
): void {
  openApiDocumentation(toTarget(route), {apiName: apiName || "", apiVersion}, config)
}

function toTarget(route: string): DocumentationTarget {
  if (route === "custom-api-details") return "scalar"
  if (route === "custom-apis-swagger") return "swagger"
  return "native"
}
