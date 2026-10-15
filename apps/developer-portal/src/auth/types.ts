export interface PortalAccount {
  id: string
  name: string
  username: string
}

export interface AuthClient {
  initialize(): Promise<void>
  login(): Promise<void>
  logout(): Promise<void>
  getAccessToken(): Promise<string>
  account(): PortalAccount | null
  onAccountChanged(listener: (account: PortalAccount | null) => void): () => void
}
