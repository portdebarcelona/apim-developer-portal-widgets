import {inject, type InjectionKey} from "vue"
import type {PortalRuntimeConfig} from "../config"
import {MockAuthClient} from "./mockAuthClient"
import {MsalAuthClient} from "./msalAuthClient"
import type {AuthClient} from "./types"

export const authKey: InjectionKey<AuthClient> = Symbol("portal-auth")

export function createAuthClient(config: PortalRuntimeConfig): AuthClient {
  return config.authMode === "mock" ? new MockAuthClient(config.mockAuthInitialState) : new MsalAuthClient(config)
}

export function useAuth(): AuthClient {
  const auth = inject(authKey)
  if (!auth) throw new Error("AuthClient was not provided")
  return auth
}

export type {AuthClient, PortalAccount} from "./types"
