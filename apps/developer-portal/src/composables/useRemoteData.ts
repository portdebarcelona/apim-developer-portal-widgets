import {onBeforeUnmount, onMounted, ref, type Ref} from "vue"

export interface RemoteData<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<string>
  reload: () => Promise<void>
}

export function useRemoteData<T>(loader: (signal: AbortSignal) => Promise<T>): RemoteData<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(true)
  const error = ref("")
  let controller = new AbortController()

  async function reload(): Promise<void> {
    controller.abort()
    controller = new AbortController()
    loading.value = true
    error.value = ""
    try {
      data.value = await loader(controller.signal)
    } catch (reason) {
      if (!controller.signal.aborted) error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  }

  onMounted(reload)
  onBeforeUnmount(() => controller.abort())
  return {data, loading, error, reload}
}
