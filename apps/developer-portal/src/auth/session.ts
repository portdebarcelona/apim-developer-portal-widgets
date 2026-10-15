import {inject, type InjectionKey, type Ref} from "vue"
import type {PortalAccount} from "./types"

export interface PortalSession {
  account: Ref<PortalAccount | null>
  signIn(): Promise<void>
  signOut(): Promise<void>
}

export const portalSessionKey: InjectionKey<PortalSession> = Symbol("portal-session")

export function usePortalSession(): PortalSession {
  const session = inject(portalSessionKey)
  if (!session) throw new Error("PortalSession was not provided")
  return session
}
