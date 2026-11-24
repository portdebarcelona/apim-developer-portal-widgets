import type {Secrets} from '@azure/api-management-custom-widgets-tools';
import type {ApiMetadata, AssociatedOAuth, JsonObject, LoadedApi, WidgetValues} from './types';
import {normalizeSecurity} from './security';

export type PortalContext = Pick<Secrets, 'managementApiUrl' | 'apiVersion' | 'token'>;
export type Fetch = typeof fetch;

export function portalRequest(context: PortalContext, fetcher: Fetch = fetch) {
  return (path: string, signal: AbortSignal, query: Record<string, string> = {}) => {
    // All management paths are generated locally; never follow an export URL with
    // the management token or accept an arbitrary management host from OpenAPI.
    const url = new URL(context.managementApiUrl.replace(/\/$/, '') + path);
    url.search = new URLSearchParams({...query, 'api-version': context.apiVersion}).toString();
    return fetcher(url.href, {signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), cache: 'no-store', credentials: 'omit',
      headers: context.token ? {Authorization: context.token} : {}, redirect: 'error'});
  };
}

const scopes = (value: unknown): string[] => typeof value === 'string' ? value.split(/[ ,]+/).filter(Boolean) : [];

async function associatedOAuth(metadata: ApiMetadata, document: JsonObject, values: WidgetValues,
  request: ReturnType<typeof portalRequest>, signal: AbortSignal, warnings: string[]): Promise<AssociatedOAuth | undefined> {
  const settings = metadata.authenticationSettings;
  const association = settings?.oAuth2AuthenticationSettings?.[0] ?? settings?.oAuth2;
  if (!association?.authorizationServerId) return;
  if (settings?.oAuth2AuthenticationSettings?.length > 1) {
    warnings.push('La API tiene varias asociaciones OAuth; se conserva su seguridad OpenAPI y se muestra la primera asociación configurada.');
  }
  const id = association.authorizationServerId;
  const definitions = document.openapi ? document.components?.securitySchemes : document.securityDefinitions;
  // APIM exports the associated server under this ID. Never infer an association
  // from the first OAuth definition or from widget/page defaults.
  const exportedId = `oauth2${id}`;
  const exported = definitions?.[exportedId];
  const exportedOAuth = exported?.type === 'oauth2' ? exported : undefined;
  let server: JsonObject | undefined;
  try {
    const response = await request(`/authorizationServers/${encodeURIComponent(id)}`, signal);
    if (response.ok) server = (await response.json()).properties;
  } catch (error) { if (signal.aborted) throw error; }
  if (!server && !exportedOAuth) {
    // Some portal management endpoints expose the collection but not the detail.
    // Only an exact API-associated ID may supply configuration; never value[0].
    try {
      const response = await request('/authorizationServers', signal);
      if (response.ok) {
        const collection = await response.json();
        const matches = (Array.isArray(collection.value) ? collection.value : []).filter((item: JsonObject) =>
          item.name === id || typeof item.id === 'string' && item.id.split('/').pop() === id);
        if (matches.length === 1) server = matches[0].properties;
      }
    } catch (error) { if (signal.aborted) throw error; }
  }
  if (!server) {
    // Restore the recovered portal's existing public-client configuration only
    // for this API's explicit OAuth association. Scopes always come from APIM.
    if (values.tenantId && values.clientId) server = {
      authorizationEndpoint: values.authorizationUrl || `https://login.microsoftonline.com/${encodeURIComponent(values.tenantId)}/oauth2/v2.0/authorize`,
      tokenEndpoint: values.tokenUrl || `https://login.microsoftonline.com/${encodeURIComponent(values.tenantId)}/oauth2/v2.0/token`,
      clientId: values.clientId, grantTypes: ['authorizationCode'],
    };
    else {
      if (!exportedOAuth) warnings.push('No se pudo obtener la configuración OAuth asociada. Se conserva la documentación y su seguridad OpenAPI.');
      return;
    }
  }
  // The exported document is authoritative for flows/scopes and requirements.
  // Bind the associated server's public client or the original portal client.
  if (exportedOAuth) return {id: exportedId, clientId: server.clientId || '',
    scopes: scopes(association.scope || server.defaultScope), scheme: structuredClone(exportedOAuth)};
  const authorizationUrl = server.authorizationEndpoint;
  const tokenUrl = server.tokenEndpoint;
  if (!authorizationUrl || !tokenUrl) {
    warnings.push('La API tiene OAuth asociado, pero no se pudieron obtener sus endpoints. Se conserva la seguridad OpenAPI.');
    return;
  }
  const requiredScopes = scopes(association.scope || server?.defaultScope);
  const advertised = Object.fromEntries((server?.scopes ?? []).map((scope: any) =>
    typeof scope === 'string' ? [scope, scope] : [scope.value, scope.description ?? scope.value]));
  for (const scope of requiredScopes) advertised[scope] ??= scope;
  const clientId = server.clientId || '';
  const common = {scopes: advertised, 'x-scalar-client-id': clientId, 'x-scalar-credentials-location': 'body'};
  const flows: JsonObject = {};
  const grants: string[] = server.grantTypes ?? [];
  if (grants.includes('authorizationCode')) flows.authorizationCode = {
    authorizationUrl, tokenUrl, ...common, 'x-usePkce': 'SHA-256',
  };
  if (grants.includes('implicit')) flows.implicit = {authorizationUrl, ...common};
  // No secrets are read or embedded. Confidential flows remain as documented by
  // the export; the portal cannot invent a client secret for a browser consumer.
  if (!Object.keys(flows).length) {
    return;
  }
  return {id, clientId, scopes: requiredScopes, scheme: {type: 'oauth2', flows}};
}

export async function loadApi(apiId: string, context: PortalContext, values: WidgetValues,
  signal: AbortSignal, fetcher: Fetch = fetch): Promise<LoadedApi> {
  const request = portalRequest(context, fetcher);
  const [exportResult, metadataResult] = await Promise.allSettled([
    request(`/apis/${encodeURIComponent(apiId)}`, signal, {export: 'true', format: 'openapi+json'}),
    request(`/apis/${encodeURIComponent(apiId)}`, signal),
  ]);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (exportResult.status === 'rejected' || !exportResult.value.ok) {
    throw new Error('No se pudo cargar la documentación de esta API. Comprueba tu sesión y vuelve a intentarlo.');
  }
  let document: JsonObject;
  try { document = await exportResult.value.json(); }
  catch { throw new Error('La respuesta no contiene un documento OpenAPI válido.'); }
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('La respuesta no contiene un documento OpenAPI válido.');
  // The portal endpoint returns the document directly. Also accept ARM-style
  // inline exports, but never fetch a returned link with portal credentials.
  if (!document.openapi && !document.swagger && document.value) {
    try { document = typeof document.value === 'string' ? JSON.parse(document.value) : document.value; }
    catch { throw new Error('La respuesta no contiene un documento OpenAPI válido.'); }
  }
  if (!document || (!document.openapi && !document.swagger) || !document.paths) throw new Error('La respuesta no contiene un documento OpenAPI válido.');
  const warnings: string[] = [];
  let metadata: ApiMetadata | undefined;
  if (metadataResult.status === 'fulfilled' && metadataResult.value.ok) {
    try { metadata = (await metadataResult.value.json()).properties; } catch { /* conservative fallback below */ }
  }
  if (typeof metadata?.subscriptionRequired !== 'boolean') {
    warnings.push('No se pudo confirmar si esta API requiere suscripción. Se conservan sus requisitos OpenAPI originales.');
  }
  const oauth = metadata ? await associatedOAuth(metadata, document, values, request, signal, warnings) : undefined;
  const definitions = document.openapi ? document.components?.securitySchemes : document.securityDefinitions;
  // Binding UI client information must not enrich/override operation-level
  // alternatives when the associated scheme already exists in the export.
  const enrichment = oauth && !definitions?.[oauth.id] ? oauth : undefined;
  return {apiId, metadata, oauth, warnings, document: normalizeSecurity(document, metadata, enrichment)};
}
