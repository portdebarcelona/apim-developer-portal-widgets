import {inject} from "vue"
import {useAuth} from "../auth"
import type {PortalRuntimeConfig} from "../config"
import {BffClient} from "./bffClient"

export function useBff(): BffClient {
  const config = inject<PortalRuntimeConfig>("runtimeConfig")
  if (!config) throw new Error("Runtime configuration was not provided")
  return new BffClient(config, useAuth())
}
