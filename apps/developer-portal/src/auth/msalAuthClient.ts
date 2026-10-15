import {
  BrowserCacheLocation,
  EventType,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
} from "@azure/msal-browser"
import type {PortalRuntimeConfig} from "../config"
import type {AuthClient, PortalAccount} from "./types"

export class MsalAuthClient implements AuthClient {
  private readonly msal: PublicClientApplication
  private readonly scopes: string[]
  private readonly accountListeners = new Set<(account: PortalAccount | null) => void>()

  constructor(config: PortalRuntimeConfig) {
    const msalConfig = createMsalConfiguration(config, window.location.origin)

    this.msal = new PublicClientApplication(msalConfig)
    this.msal.enableAccountStorageEvents()
    this.msal.addEventCallback((event) => {
      if (
        event.eventType === EventType.ACCOUNT_ADDED
        || event.eventType === EventType.ACCOUNT_REMOVED
        || event.eventType === EventType.ACTIVE_ACCOUNT_CHANGED
      ) {
        this.notifyAccountChanged()
      }
    })
    this.scopes = [config.bffScope]
  }

  async initialize(): Promise<void> {
    await this.msal.initialize()
    const result = await this.msal.handleRedirectPromise()
    if (result?.account) {
      this.msal.setActiveAccount(result.account)
    } else {
      const restoredAccount = selectCachedAccount(this.msal.getActiveAccount(), this.msal.getAllAccounts())
      if (restoredAccount !== this.msal.getActiveAccount()) this.msal.setActiveAccount(restoredAccount)
    }
    this.notifyAccountChanged()
  }

  async login(): Promise<void> {
    const result = await this.msal.loginPopup({scopes: this.scopes, prompt: "select_account"})
    this.msal.setActiveAccount(result.account)
    this.notifyAccountChanged()
  }

  async logout(): Promise<void> {
    await this.msal.logoutPopup({account: this.msal.getActiveAccount() || undefined})
    this.msal.setActiveAccount(null)
    this.notifyAccountChanged()
  }

  async getAccessToken(): Promise<string> {
    const account = this.requireAccount()

    try {
      const result = await this.msal.acquireTokenSilent({account, scopes: this.scopes})
      return result.accessToken
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) throw error
      const result = await this.msal.acquireTokenPopup({account, scopes: this.scopes})
      return result.accessToken
    }
  }

  account(): PortalAccount | null {
    const account = this.msal.getActiveAccount()
    return account ? toPortalAccount(account) : null
  }

  onAccountChanged(listener: (account: PortalAccount | null) => void): () => void {
    this.accountListeners.add(listener)
    return () => this.accountListeners.delete(listener)
  }

  private requireAccount(): AccountInfo {
    const account = this.msal.getActiveAccount()
    if (!account) throw new Error("Authentication is required")
    return account
  }

  private notifyAccountChanged(): void {
    const account = this.account()
    this.accountListeners.forEach((listener) => listener(account))
  }
}

export function createMsalConfiguration(config: PortalRuntimeConfig, origin: string): Configuration {
  return {
    auth: {
      clientId: config.entraClientId,
      authority: `https://login.microsoftonline.com/${config.entraTenantId}`,
      redirectUri: origin,
      postLogoutRedirectUri: origin,
    },
    cache: {cacheLocation: BrowserCacheLocation.LocalStorage},
  }
}

export function selectCachedAccount(
  activeAccount: AccountInfo | null,
  cachedAccounts: AccountInfo[],
): AccountInfo | null {
  if (activeAccount) return activeAccount
  return cachedAccounts.length === 1 ? cachedAccounts[0] : null
}

function toPortalAccount(account: AccountInfo): PortalAccount {
  return {id: account.homeAccountId, name: account.name || account.username, username: account.username}
}
