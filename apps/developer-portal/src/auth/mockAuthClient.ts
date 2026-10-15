import type {AuthClient, PortalAccount} from "./types"

const localAccount: PortalAccount = {
  id: "local-developer",
  name: "Desarrollo local",
  username: "developer@localhost",
}

export class MockAuthClient implements AuthClient {
  private signedIn: boolean
  private readonly accountListeners = new Set<(account: PortalAccount | null) => void>()

  constructor(initialState: "anonymous" | "authenticated" = "authenticated") {
    this.signedIn = initialState === "authenticated"
  }

  async initialize(): Promise<void> {}
  async login(): Promise<void> {
    this.signedIn = true
    this.notifyAccountChanged()
  }

  async logout(): Promise<void> {
    this.signedIn = false
    this.notifyAccountChanged()
  }

  async getAccessToken(): Promise<string> {
    if (!this.signedIn) throw new Error("Authentication is required")
    return "mock-local-token"
  }

  account(): PortalAccount | null {
    return this.signedIn ? localAccount : null
  }

  onAccountChanged(listener: (account: PortalAccount | null) => void): () => void {
    this.accountListeners.add(listener)
    return () => this.accountListeners.delete(listener)
  }

  private notifyAccountChanged(): void {
    const account = this.account()
    this.accountListeners.forEach((listener) => listener(account))
  }
}
