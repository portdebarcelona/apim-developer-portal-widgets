import {computed, inject, onBeforeUnmount, ref, watch, type Ref} from "vue"
import {useRoute} from "vue-router"
import {authKey} from "../auth"
import {BffClient} from "../api/bffClient"
import type {PortalRuntimeConfig} from "../config"
import type {DocumentationViewer, OpenApiDocument} from "./types"

export function useOpenApiDocument(viewer: DocumentationViewer): {
  specification: Ref<OpenApiDocument | null>
  loading: Ref<boolean>
  error: Ref<string>
  apiId: Ref<string>
} {
  const route = useRoute()
  const auth = inject(authKey)
  const config = inject<PortalRuntimeConfig>("runtimeConfig")
  if (!auth || !config) throw new Error("Portal services are not available")
  const client = new BffClient(config, auth)
  const specification = ref<OpenApiDocument | null>(null)
  const loading = ref(true)
  const error = ref("")
  const apiId = computed(() => String(route.params.apiId || ""))
  let controller: AbortController | undefined

  const load = async () => {
    controller?.abort()
    controller = new AbortController()
    loading.value = true
    error.value = ""
    specification.value = null
    const query = new URLSearchParams()
    if (route.query.version) query.set("version", String(route.query.version))
    if (route.query.revision) query.set("revision", String(route.query.revision))
    const suffix = query.size ? `?${query}` : ""
    try {
      specification.value = await client.get<OpenApiDocument>(
        `/api/catalog/apis/${encodeURIComponent(apiId.value)}/openapi${suffix}`,
        controller.signal,
        {"X-Documentation-Viewer": viewer},
      )
    } catch (reason) {
      if ((reason as Error).name !== "AbortError")
        error.value = reason instanceof Error ? reason.message : "No se pudo cargar la documentación."
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  }

  watch(() => [route.params.apiId, route.query.version, route.query.revision], load, {immediate: true})
  onBeforeUnmount(() => controller?.abort())
  return {specification, loading, error, apiId}
}
