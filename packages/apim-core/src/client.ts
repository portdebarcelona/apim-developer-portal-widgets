import type {
  ApimApiRaw,
  ApimListResponse,
  ApimProductRaw,
  ApimSubscriptionRaw,
  ApimTagRaw,
  ApimWidgetSecrets,
  RequestFn,
} from "./types"
import type {PortalConfig} from "./config"

export interface ApimClientOptions {
  baseUrl?: string
  apiVersion?: string
  getAccessToken?: () => Promise<string | null | undefined>
  fetchImpl?: typeof fetch
  allowedNextLinkOrigins?: string[]
}

export class ApimHttpError extends Error {
  readonly status: number
  readonly url: string

  constructor(response: Response) {
    super(`APIM request failed with status ${response.status}`)
    this.name = "ApimHttpError"
    this.status = response.status
    this.url = response.url
  }
}

export class ApimClient {
  private readonly requestFn: RequestFn

  constructor(requestOrOptions: RequestFn | ApimClientOptions) {
    this.requestFn = typeof requestOrOptions === "function"
      ? requestOrOptions
      : createRequest(requestOrOptions)
  }

  request(pathOrUrl: string, init?: RequestInit): Promise<Response> {
    return this.requestFn(pathOrUrl, init)
  }

  async getAll<T>(pathOrUrl: string): Promise<T[]> {
    const items: T[] = []
    const visited = new Set<string>()
    let nextLink: string | undefined = pathOrUrl

    while (nextLink) {
      if (visited.has(nextLink)) {
        throw new Error(`APIM pagination loop detected for ${nextLink}`)
      }
      visited.add(nextLink)

      const response = await this.request(nextLink)
      if (!response.ok) {
        throw new ApimHttpError(response)
      }

      const page = await response.json() as ApimListResponse<T>
      items.push(...(page.value || []))
      nextLink = page.nextLink
    }

    return items
  }

  listApis(): Promise<ApimApiRaw[]> {
    return this.getAll<ApimApiRaw>("/apis")
  }

  listApiTags(apiName: string): Promise<ApimTagRaw[]> {
    return this.getAll<ApimTagRaw>(`/apis/${encodeURIComponent(apiName)}/tags`)
  }

  listProducts(): Promise<ApimProductRaw[]> {
    return this.getAll<ApimProductRaw>("/products")
  }

  listProductApis(productName: string): Promise<ApimApiRaw[]> {
    return this.getAll<ApimApiRaw>(`/products/${encodeURIComponent(productName)}/apis`)
  }

  listUserSubscriptions(userId: string): Promise<ApimSubscriptionRaw[]> {
    return this.getAll<ApimSubscriptionRaw>(`/users/${encodeURIComponent(userId)}/subscriptions`)
  }
}

export function createWidgetClient(secrets: ApimWidgetSecrets): ApimClient {
  return new ApimClient({
    baseUrl: secrets.managementApiUrl,
    apiVersion: secrets.apiVersion,
    getAccessToken: async () => secrets.token,
  })
}

export function createPortalClient(
  config: Pick<PortalConfig, "apim">,
  getAccessToken: ApimClientOptions["getAccessToken"],
): ApimClient {
  return new ApimClient({
    baseUrl: config.apim.dataApiBaseUrl,
    apiVersion: config.apim.dataApiVersion,
    getAccessToken,
  })
}

export function createRequest(options: ApimClientOptions): RequestFn {
  const fetchImpl = options.fetchImpl || fetch
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const allowedOrigins = new Set(options.allowedNextLinkOrigins || [])

  if (baseUrl) {
    allowedOrigins.add(new URL(baseUrl).origin)
  }

  return async (pathOrUrl, init = {}) => {
    const requestUrl = resolveRequestUrl(pathOrUrl, baseUrl)

    if (allowedOrigins.size > 0 && !allowedOrigins.has(requestUrl.origin)) {
      throw new Error(`Refusing APIM nextLink from untrusted origin: ${requestUrl.origin}`)
    }

    if (options.apiVersion && !requestUrl.searchParams.has("api-version")) {
      requestUrl.searchParams.set("api-version", options.apiVersion)
    }

    const headers = new Headers(init.headers)
    const token = await options.getAccessToken?.()
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", token)
    }

    return fetchImpl(requestUrl.toString(), {...init, headers})
  }
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return undefined
  }

  const withTrailingSlash = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  if (/^https?:\/\//i.test(withTrailingSlash)) {
    return withTrailingSlash
  }

  if (typeof window === "undefined") {
    throw new Error("A relative APIM baseUrl can only be used in the browser")
  }

  return new URL(withTrailingSlash, window.location.origin).toString()
}

function resolveRequestUrl(pathOrUrl: string, baseUrl?: string): URL {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return new URL(pathOrUrl)
  }

  if (!baseUrl) {
    if (typeof window === "undefined") {
      throw new Error("A baseUrl is required outside the browser")
    }
    return new URL(pathOrUrl, window.location.origin)
  }

  return new URL(pathOrUrl.replace(/^\//, ""), baseUrl)
}
