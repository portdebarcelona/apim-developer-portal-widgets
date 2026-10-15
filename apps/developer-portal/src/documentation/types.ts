export type JsonObject = Record<string, unknown>

export interface OpenApiInfo {
  title?: string
  version?: string
  description?: string
}

export interface OpenApiDocument extends JsonObject {
  openapi?: string
  swagger?: string
  info?: OpenApiInfo
  components?: {securitySchemes?: Record<string, JsonObject>}
  securityDefinitions?: Record<string, JsonObject>
}

export type DocumentationViewer = "scalar" | "swagger"
