import type {ApiMetadata, AssociatedOAuth, JsonObject} from './types';

const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query']);
export const subscriptionNames = (metadata?: ApiMetadata) => ({
  header: metadata?.subscriptionKeyParameterNames?.header ?? 'Ocp-Apim-Subscription-Key',
  query: metadata?.subscriptionKeyParameterNames?.query ?? 'subscription-key',
});

function resolveLocal(document: JsonObject, value: JsonObject): JsonObject {
  const seen = new Set<string>();
  while (value && typeof value.$ref === 'string' && value.$ref.startsWith('#/') && !seen.has(value.$ref)) {
    seen.add(value.$ref);
    const resolved = value.$ref.slice(2).split('/').reduce((node: any, key: string) =>
      node?.[decodeURIComponent(key).replace(/~1/g, '/').replace(/~0/g, '~')], document);
    if (!resolved || typeof resolved !== 'object') break;
    value = resolved;
  }
  return value;
}

/** Match the API's actual subscription parameter names, never a scheme's arbitrary ID. */
export function isSubscriptionParameter(value: JsonObject, metadata?: ApiMetadata): boolean {
  const names = subscriptionNames(metadata);
  return value?.in === 'header' && typeof value.name === 'string' &&
    value.name.toLowerCase() === names.header.toLowerCase() ||
    value?.in === 'query' && value.name === names.query;
}

/** Returns a deep copy. Only security and APIM subscription parameters are transformed. */
export function normalizeSecurity(original: JsonObject, metadata?: ApiMetadata, oauth?: AssociatedOAuth): JsonObject {
  const document = structuredClone(original);
  const schemes: JsonObject = document.openapi ? document.components?.securitySchemes ?? {} : document.securityDefinitions ?? {};
  const apimIds = new Set(Object.keys(schemes).filter(id => {
    const scheme = resolveLocal(document, schemes[id]);
    return scheme?.type === 'apiKey' && isSubscriptionParameter(scheme, metadata);
  }));
  const removedIds = metadata?.subscriptionRequired === false ? apimIds : new Set<string>();
  for (const id of removedIds) delete schemes[id];

  let oauthId = oauth?.id;
  if (oauth && oauthId) {
    // Preserve an existing definition even if its ID collides with the server ID.
    if (schemes[oauthId] && resolveLocal(document, schemes[oauthId]).type !== 'oauth2') {
      let suffix = 1;
      while (schemes[`${oauth.id}-oauth-${suffix}`]) suffix++;
      oauthId = `${oauth.id}-oauth-${suffix}`;
    }
    if (document.openapi) {
      document.components ??= {};
      document.components.securitySchemes ??= schemes;
      schemes[oauthId] ??= structuredClone(oauth.scheme);
    } else {
      document.securityDefinitions ??= schemes;
      const flow = oauth.scheme.flows?.authorizationCode ?? oauth.scheme.flows?.implicit;
      if (flow) schemes[oauthId] ??= {type: 'oauth2', flow: oauth.scheme.flows?.authorizationCode ? 'accessCode' : 'implicit', ...flow};
      else oauthId = undefined;
    }
  }

  function security(requirements: any, inherit: boolean): any {
    if (requirements === undefined) return inherit || !oauthId ? undefined : [{[oauthId]: oauth!.scopes}];
    if (!Array.isArray(requirements) || requirements.length === 0) return requirements;
    const result: JsonObject[] = [];
    for (const requirement of requirements) {
      if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) {
        result.push(requirement); continue;
      }
      const keys = Object.keys(requirement);
      const next = Object.fromEntries(Object.entries(requirement).filter(([id]) => !removedIds.has(id)));
      // Enrich only an APIM-key-only alternative with a server explicitly associated
      // to this API. Existing Bearer/OAuth alternatives and anonymous {} stay intact.
      if (keys.length > 0 && keys.every(id => apimIds.has(id)) && oauthId) next[oauthId] = oauth!.scopes;
      if (Object.keys(next).length > 0 || keys.length === 0) result.push(next);
    }
    // Never turn a removed key-only alternative into {} beside a real consumer auth.
    // [] on an operation is essential: deleting it would inherit global security.
    return result;
  }
  const globalSecurity = security(document.security, false);
  if (globalSecurity !== undefined) document.security = globalSecurity;

  const visited = new Set<object>();
  function pathItem(item: JsonObject) {
    if (!item || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);
    if (item.$ref) pathItem(resolveLocal(document, item));
    cleanParameters(item);
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method) || !operation || typeof operation !== 'object') continue;
      const op = operation as JsonObject;
      if (Object.hasOwn(op, 'security')) op.security = security(op.security, true);
      cleanParameters(op);
      for (const callback of Object.values(op.callbacks ?? {})) {
        const resolved = resolveLocal(document, callback as JsonObject);
        for (const expression of Object.values(resolved)) if (typeof expression === 'object') pathItem(expression as JsonObject);
      }
    }
  }
  function cleanParameters(owner: JsonObject) {
    if (metadata?.subscriptionRequired === false && Array.isArray(owner.parameters)) {
      owner.parameters = owner.parameters.filter((parameter: JsonObject) =>
        !isSubscriptionParameter(resolveLocal(document, parameter), metadata));
    }
  }
  for (const item of Object.values(document.paths ?? {})) pathItem(item as JsonObject);
  for (const item of Object.values(document.webhooks ?? {})) pathItem(item as JsonObject);
  for (const item of Object.values(document.components?.pathItems ?? {})) pathItem(item as JsonObject);
  if (removedIds.size && Object.keys(schemes).length === 0) {
    // Swagger UI treats even an empty securitySchemes object as an authorization
    // configuration. Remove that empty container to avoid an empty Authorize dialog.
    if (document.openapi) delete document.components.securitySchemes;
    else delete document.securityDefinitions;
  }
  return document;
}

/** A custom subscription name can collide with a real consumer auth transport. */
export function isConsumerAuthHeader(document: JsonObject | undefined, header: string): boolean {
  const name = header.toLowerCase();
  if (!document) return name === 'authorization' || name === 'cookie';
  const schemes = document.openapi ? document.components?.securitySchemes : document.securityDefinitions;
  return Object.values(schemes ?? {}).some(value => {
    const scheme = resolveLocal(document, value as JsonObject);
    return name === 'authorization' && ['http', 'basic', 'oauth2', 'openIdConnect'].includes(scheme?.type) ||
      name === 'cookie' && scheme?.type === 'apiKey' && scheme.in === 'cookie' ||
      scheme?.type === 'apiKey' && scheme.in === 'header' && scheme.name?.toLowerCase() === name;
  });
}

/** Defense against stale client state. Retained consumer authentication takes priority. */
export function stripSubscription(request: {url: string; headers?: Record<string, string>}, metadata?: ApiMetadata, document?: JsonObject) {
  if (metadata?.subscriptionRequired !== false) return request;
  const names = subscriptionNames(metadata);
  for (const name of Object.keys(request.headers ?? {})) {
    if (name.toLowerCase() === names.header.toLowerCase() && !isConsumerAuthHeader(document, name)) delete request.headers![name];
  }
  const baseUrl = globalThis.location?.href ?? 'http://localhost/';
  const url = new URL(request.url, baseUrl);
  url.searchParams.delete(names.query);
  // Preserve the exact URL/encoding when there was no subscription parameter.
  if (new URL(request.url, baseUrl).searchParams.has(names.query)) request.url = url.href;
  return request;
}
