import type {AuthClient} from "../auth"
import type {PortalRuntimeConfig} from "../config"

interface CatalogCacheEntry {
  expiresAt: number
  promise: Promise<unknown>
}

const catalogCache = new Map<string, CatalogCacheEntry>()
const catalogCacheDurationMs = 2 * 60 * 1000

export class BffClient {
  constructor(
    private readonly config: PortalRuntimeConfig,
    private readonly auth: AuthClient,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async get<T>(path: string, signal?: AbortSignal, headers: Record<string, string> = {}): Promise<T> {
    const token = await this.auth.getAccessToken()
    const response = await this.fetchImpl(`${this.config.bffBaseUrl}${path}`, {
      headers: {Authorization: `Bearer ${token}`, Accept: "application/json", ...headers},
      credentials: "same-origin",
      signal,
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `BFF request failed with status ${response.status}`)
    }

    return response.json() as Promise<T>
  }

  async getCatalog<T>(path: string, signal?: AbortSignal): Promise<T> {
    const accountId = this.auth.account()?.id ?? "anonymous"
    const key = `${accountId}:${path}`
    const cached = catalogCache.get(key)
    if (cached && cached.expiresAt > Date.now())
      return withCancellation(cached.promise as Promise<T>, signal)

    const promise = this.get<T>(path).catch((reason) => {
      catalogCache.delete(key)
      throw reason
    })
    catalogCache.set(key, {expiresAt: Date.now() + catalogCacheDurationMs, promise})
    return withCancellation(promise, signal)
  }
}

function withCancellation<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted", "AbortError"))
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("The operation was aborted", "AbortError"))
    signal.addEventListener("abort", abort, {once: true})
    promise.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value) },
      (reason) => { signal.removeEventListener("abort", abort); reject(reason) },
    )
  })
}
