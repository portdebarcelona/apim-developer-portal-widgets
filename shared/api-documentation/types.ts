// JSON OpenAPI documents may contain extension properties at every level.
export type JsonObject = Record<string, any>;
export interface ApiMetadata {
  subscriptionRequired?: boolean;
  subscriptionKeyParameterNames?: {header?: string; query?: string};
  authenticationSettings?: JsonObject;
}
export interface WidgetValues extends Record<string, unknown> {
  theme: string;
  tenantId: string;
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string;
  oauth2RedirectUrl: string;
  // Accepted for compatibility with saved editor data; never auto-applied.
  subscriptionKey: string;
}
export const defaults: WidgetValues = {
  theme: '', tenantId: '', clientId: '', authorizationUrl: '', tokenUrl: '',
  scopes: '', oauth2RedirectUrl: '', subscriptionKey: '',
};
export interface AssociatedOAuth {
  id: string;
  scheme: JsonObject;
  scopes: string[];
  clientId: string;
}
export interface LoadedApi {
  apiId: string;
  document: JsonObject;
  metadata?: ApiMetadata;
  oauth?: AssociatedOAuth;
  warnings: string[];
}
