import {describe, expect, it} from 'vitest';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {normalizeSecurity, stripSubscription} from '../../shared/api-documentation/security';
import {defaults, type ApiMetadata, type AssociatedOAuth} from '../../shared/api-documentation/types';
import {loadApi} from '../../shared/api-documentation/load-api';
import {adaptArrayQueries} from '../../shared/api-documentation/swagger-parameters';

const key = {type: 'apiKey', in: 'header', name: 'Ocp-Apim-Subscription-Key'};
const query = {type: 'apiKey', in: 'query', name: 'subscription-key'};
const bearer = {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'};
const base = () => ({openapi: '3.0.1', info: {title: 'API', version: 'v2', description: 'Descripción original'},
  servers: [{url: 'https://gateway.example/api/v2'}], tags: [{name: 'PTP'}],
  components: {securitySchemes: {apiKeyHeader: key, apiKeyQuery: query, bearer},
    schemas: {Pet: {type: 'object', example: {id: 1}}}},
  security: [{apiKeyHeader: []}, {apiKeyQuery: []}],
  paths: {'/pets': {get: {summary: 'Listar', responses: {'200': {description: 'OK', content: {'application/json': {example: [1]}}}}}}}});
const oauth: AssociatedOAuth = {id: 'api-oauth', clientId: 'public-client', scopes: ['api.read'],
  scheme: {type: 'oauth2', flows: {authorizationCode: {authorizationUrl: 'https://id.example/authorize', tokenUrl: 'https://id.example/token', scopes: {'api.read': 'Read'}}}}};

describe('normalización compartida', () => {
  it('retira únicamente las claves APIM y clona sin alterar el documento original', () => {
    const source = base(); const saved = structuredClone(source);
    const actual = normalizeSecurity(source, {subscriptionRequired: false});
    expect(source).toEqual(saved);
    expect(actual.security).toEqual([]);
    expect(actual.components.securitySchemes).toEqual({bearer});
    for (const field of ['paths', 'info', 'tags', 'servers']) expect(actual[field]).toEqual((source as any)[field]);
    expect(actual.components.schemas).toEqual(source.components.schemas);
  });
  it.each([true, undefined, null, 'false', 0])('conserva requisitos si subscriptionRequired=%s', value => {
    expect(normalizeSecurity(base(), {subscriptionRequired: value} as ApiMetadata)).toEqual(base());
  });
  it('conserva también con metadatos ausentes', () => expect(normalizeSecurity(base())).toEqual(base()));
  it('preserva AND, scopes y alternativas OAuth/Bearer sin crear una alternativa anónima', () => {
    const source: any = base();
    source.components.securitySchemes.oauth = oauth.scheme;
    source.security = [{apiKeyHeader: []}, {apiKeyHeader: [], bearer: []}, {oauth: ['api.read']}];
    expect(normalizeSecurity(source, {subscriptionRequired: false}).security).toEqual([{bearer: []}, {oauth: ['api.read']}]);
  });
  it('preserva un {} anónimo explícito', () => {
    const source: any = base(); source.security = [{apiKeyHeader: []}, {}, {bearer: []}];
    expect(normalizeSecurity(source, {subscriptionRequired: false}).security).toEqual([{}, {bearer: []}]);
  });
  it('seguridad de operación prevalece sin heredar accidentalmente seguridad global', () => {
    const source: any = base(); source.security = [{bearer: []}];
    source.paths['/pets'].get.security = [{apiKeyHeader: []}];
    source.paths['/pets'].post = {security: [{apiKeyHeader: [], bearer: []}], responses: {}};
    source.paths['/public'] = {get: {security: [], responses: {}}};
    const result = normalizeSecurity(source, {subscriptionRequired: false});
    expect(result.paths['/pets'].get.security).toEqual([]);
    expect(result.paths['/pets'].post.security).toEqual([{bearer: []}]);
    expect(result.paths['/public'].get.security).toEqual([]);
    expect(result.security).toEqual([{bearer: []}]);
  });
  it('nombres personalizados: identifica por tipo/in/name, sin confundir IDs o claves ajenas', () => {
    const source: any = base(); source.components.securitySchemes = {
      customHeader: {type: 'apiKey', in: 'header', name: 'X-Subscription'},
      customQuery: {type: 'apiKey', in: 'query', name: 'custom-key'},
      apiKeyHeader: {type: 'apiKey', in: 'header', name: 'X-Backend-Key'}, bearer,
    };
    source.security = [{customHeader: [], bearer: []}, {customQuery: []}, {apiKeyHeader: []}];
    const result = normalizeSecurity(source, {subscriptionRequired: false, subscriptionKeyParameterNames: {header: 'x-subscription', query: 'custom-key'}});
    expect(Object.keys(result.components.securitySchemes)).toEqual(['apiKeyHeader', 'bearer']);
    expect(result.security).toEqual([{bearer: []}, {apiKeyHeader: []}]);
  });
  it('nombres personalizados obligatorios quedan intactos', () => {
    const source: any = base(); source.components.securitySchemes.custom = {type: 'apiKey', in: 'header', name: 'X-Key'};
    expect(normalizeSecurity(source, {subscriptionRequired: true, subscriptionKeyParameterNames: {header: 'X-Key'}})).toEqual(source);
  });
  it('resuelve referencias locales en esquemas/parámetros y operaciones reutilizadas', () => {
    const source: any = base();
    source.components.securitySchemes.alias = {$ref: '#/components/securitySchemes/apiKeyHeader'};
    source.components.parameters = {key: {...key, type: undefined, schema: {type: 'string'}}};
    source.components.pathItems = {shared: {parameters: [{$ref: '#/components/parameters/key'}, {name: 'q', in: 'query'}], get: {security: [{alias: []}]}}};
    source.paths['/reference'] = {$ref: '#/components/pathItems/shared'};
    const result = normalizeSecurity(source, {subscriptionRequired: false});
    expect(result.components.securitySchemes.alias).toBeUndefined();
    expect(result.components.pathItems.shared.get.security).toEqual([]);
    expect(result.components.pathItems.shared.parameters).toEqual([{name: 'q', in: 'query'}]);
    expect(result.paths['/reference'].$ref).toBe(source.paths['/reference'].$ref);
  });
  it('elimina parámetros de suscripción con defaults sin eliminar parámetros funcionales', () => {
    const source: any = base(); source.paths['/pets'].parameters = [{name: 'subscription-key', in: 'query', schema: {default: 'old-key'}}, {name: 'page', in: 'query'}];
    expect(normalizeSecurity(source, {subscriptionRequired: false}).paths['/pets'].parameters).toEqual([{name: 'page', in: 'query'}]);
  });
  it('enriquece OAuth asociado conservando esquemas ajenos y operaciones públicas', () => {
    const source: any = base(); source.paths['/public'] = {get: {security: []}};
    const result = normalizeSecurity(source, {subscriptionRequired: false}, oauth);
    expect(result.security).toEqual([{'api-oauth': ['api.read']}, {'api-oauth': ['api.read']}]);
    expect(result.components.securitySchemes.bearer).toEqual(bearer);
    expect(result.components.securitySchemes['api-oauth']).toEqual(oauth.scheme);
    expect(result.paths['/public'].get.security).toEqual([]);
  });
  it('OAuth asociado y suscripción obligatoria se combinan con AND', () => {
    const result = normalizeSecurity(base(), {subscriptionRequired: true}, oauth);
    expect(result.security).toEqual([{apiKeyHeader: [], 'api-oauth': ['api.read']}, {apiKeyQuery: [], 'api-oauth': ['api.read']}]);
  });
  it('no sobrescribe OAuth/Bearer existentes ni sus scopes con metadatos', () => {
    const source: any = base(); source.components.securitySchemes['api-oauth'] = {type: 'http', scheme: 'bearer'};
    source.security = [{'api-oauth': []}, {bearer: []}];
    const result = normalizeSecurity(source, {subscriptionRequired: false}, oauth);
    expect(result.components.securitySchemes['api-oauth']).toEqual(source.components.securitySchemes['api-oauth']);
    expect(result.security).toEqual(source.security);
  });
  it('respeta seguridad global [] aunque haya OAuth asociado', () => {
    const source = base(); source.security = [];
    expect(normalizeSecurity(source, {subscriptionRequired: false}, oauth).security).toEqual([]);
  });
  it('admite Swagger 2 sin tocar host/basePath/definitions', () => {
    const source = {swagger: '2.0', host: 'gateway.example', basePath: '/v1', info: {title: 'V1', version: '1'},
      definitions: {Pet: {type: 'string'}}, securityDefinitions: {key, bearer}, security: [{key: []}], paths: {}};
    const result = normalizeSecurity(source, {subscriptionRequired: false});
    expect(result).toEqual({...source, securityDefinitions: {bearer}, security: []});
  });
  it('cubre callbacks y webhooks con seguridad por operación', () => {
    const source: any = base(); source.paths['/pets'].get.callbacks = {event: {'{$request.body#/url}': {post: {security: [{apiKeyHeader: []}, {bearer: []}]}}}};
    source.webhooks = {event: {post: {security: [{apiKeyQuery: []}]}}};
    const result = normalizeSecurity(source, {subscriptionRequired: false});
    expect(result.webhooks.event.post.security).toEqual([]);
    expect(result.paths['/pets'].get.callbacks.event['{$request.body#/url}'].post.security).toEqual([{bearer: []}]);
  });
});

describe('carga del portal sin credenciales administrativas nuevas', () => {
  const context = {managementApiUrl: 'https://portal.example/management', apiVersion: '2024-05-01', token: 'PortalContextToken'};
  const signal = () => new AbortController().signal;
  function mock(metadata: any, server: any = {}, metadataStatus = 200) {
    const calls: string[] = [];
    const fetcher = async (url: any, init: any) => {
      calls.push(url);
      expect(init.headers.Authorization).toBe(context.token);
      expect(init.cache).toBe('no-store');
      const parsed = new URL(url);
      const data = parsed.searchParams.has('export') ? base() : parsed.pathname.includes('authorizationServers/') ? {properties: server} : {properties: metadata};
      return new Response(JSON.stringify(data), {status: parsed.searchParams.has('export') || parsed.pathname.includes('authorizationServers/') ? 200 : metadataStatus});
    };
    return {calls, fetcher: fetcher as typeof fetch};
  }
  it('no consulta /authorizationServers ni usa valores OAuth del editor sin asociación', async () => {
    const {calls, fetcher} = mock({subscriptionRequired: false});
    const api = await loadApi('PTP;rev=2', context, {...defaults, tenantId: 'old-tenant', clientId: 'old-client'}, signal(), fetcher);
    expect(calls).toHaveLength(2); expect(calls[0]).toContain('PTP%3Brev%3D2');
    expect(api.oauth).toBeUndefined(); expect(api.document.security).toEqual([]);
  });
  it.each(['oAuth2', 'oAuth2AuthenticationSettings'])('admite asociación %s y usa scopes y cliente de esa API', async kind => {
    const association = {authorizationServerId: 'associated', scope: 'api.read'};
    const {calls, fetcher} = mock({subscriptionRequired: false, authenticationSettings: {[kind]: kind === 'oAuth2' ? association : [association]}},
      {authorizationEndpoint: 'https://id.example/authorize', tokenEndpoint: 'https://id.example/token', clientId: 'api-client', grantTypes: ['authorizationCode']});
    const api = await loadApi('OAuthApi', context, {...defaults, clientId: 'old-client', scopes: 'wrong-scope'}, signal(), fetcher);
    expect(calls).toHaveLength(3); expect(calls[2]).toContain('/authorizationServers/associated?');
    expect(api.oauth?.clientId).toBe('api-client'); expect(api.oauth?.scopes).toEqual(['api.read']);
    expect(JSON.stringify(api.document)).not.toContain(context.token);
    expect(JSON.stringify(api.document)).not.toContain('old-client');
  });
  it('error de metadatos conserva la exportación y muestra advertencia', async () => {
    const {fetcher} = mock({}, {}, 403);
    const api = await loadApi('PTP', context, defaults, signal(), fetcher);
    expect(api.document).toEqual(base()); expect(api.warnings).toHaveLength(1);
  });
  it('JSON inválido en metadatos conserva seguridad', async () => {
    const fetcher = (async (url: any) => new Response(new URL(url).searchParams.has('export') ? JSON.stringify(base()) : '<html>')) as typeof fetch;
    expect((await loadApi('PTP', context, defaults, signal(), fetcher)).document).toEqual(base());
  });
  it('no sigue enlaces exportados con el token del portal', async () => {
    const fetcher = (async () => new Response(JSON.stringify({value: {link: 'https://untrusted.example/spec'}}))) as typeof fetch;
    await expect(loadApi('PTP', context, defaults, signal(), fetcher)).rejects.toThrow('OpenAPI válido');
  });
  it('error de exportación detiene el visualizador', async () => {
    const fetcher = (async () => new Response('{}', {status: 401})) as typeof fetch;
    await expect(loadApi('PTP', context, defaults, signal(), fetcher)).rejects.toThrow('No se pudo cargar');
  });
  it.each(['null', '<html>error</html>'])('exportación inválida se presenta como error recuperable: %s', async body => {
    const fetcher = (async () => new Response(body)) as typeof fetch;
    await expect(loadApi('PTP', context, defaults, signal(), fetcher)).rejects.toThrow('OpenAPI válido');
  });
  it('403 del servidor OAuth conserva el cliente configurado y permite probar la API asociada', async () => {
    const fetcher = (async (value: any) => {
      const url = new URL(value);
      if (url.pathname.includes('/authorizationServers/')) return new Response('{}', {status: 403});
      return new Response(JSON.stringify(url.searchParams.has('export') ? base() : {properties: {
        subscriptionRequired: false, authenticationSettings: {oAuth2: {authorizationServerId: 'associated', scope: 'this-api-scope'}},
      }}));
    }) as typeof fetch;
    const api = await loadApi('OAuthApi', context, {...defaults, tenantId: 'configured-tenant', clientId: 'configured-client', scopes: 'wrong-scope'}, signal(), fetcher);
    expect(api.oauth?.clientId).toBe('configured-client');
    expect(api.oauth?.scopes).toEqual(['this-api-scope']);
    expect(api.document.paths).toEqual(base().paths);
    expect(api.document.components.securitySchemes.bearer).toEqual(bearer);
    expect(api.document.security).toEqual([{associated: ['this-api-scope']}, {associated: ['this-api-scope']}]);
    expect(JSON.stringify(api.document)).not.toContain('wrong-scope');
  });
  it('usa la colección solo si coincide exactamente el servidor asociado, nunca el primero', async () => {
    const calls: string[] = [];
    const fetcher = (async (input: any) => {
      const url = new URL(input); calls.push(url.pathname);
      if (url.pathname.endsWith('/authorizationServers/associated')) return new Response('{}', {status: 403});
      if (url.pathname.endsWith('/authorizationServers')) return Response.json({value: [
        {name: 'unrelated', properties: {authorizationEndpoint: 'https://wrong.example', tokenEndpoint: 'https://wrong.example', clientId: 'wrong'}},
        {name: 'associated', properties: {authorizationEndpoint: 'https://id.example/authorize', tokenEndpoint: 'https://id.example/token', clientId: 'verified-client', grantTypes: ['authorizationCode']}},
      ]});
      return Response.json(url.searchParams.has('export') ? base() : {properties: {subscriptionRequired: false,
        authenticationSettings: {oAuth2: {authorizationServerId: 'associated', scope: 'this-api-scope'}}}});
    }) as typeof fetch;
    const api = await loadApi('COUNTRIES', context, defaults, signal(), fetcher);
    expect(api.oauth?.clientId).toBe('verified-client');
    expect(api.oauth?.scopes).toEqual(['this-api-scope']);
    expect(JSON.stringify(api.document)).not.toContain('wrong');
    expect(calls).toContain('/management/authorizationServers');
  });
});

const localEvidenceRoot = resolve('artifacts/apim-auth-audit-2026-11-20/evidence');
describe.skipIf(!existsSync(resolve(localEvidenceRoot, 'api-security-metadata.json')))('exportaciones reales recuperadas (solo locales)', () => {
  const root = localEvidenceRoot;
  it.each(['pre-apb-api-ptp-v1', 'echo-api', 'apb-api-aeatservice-v1'])('%s conserva contenido funcional y versionado', name => {
    const document = JSON.parse(readFileSync(resolve(root, `${name}.openapi.json`), 'utf8').replace(/^\uFEFF/, ''));
    const metadata = JSON.parse(readFileSync(resolve(root, 'api-security-metadata.json'), 'utf8').replace(/^\uFEFF/, '')).find((api: any) => api.name === name);
    const before = structuredClone(document);
    const normalized = normalizeSecurity(document, metadata, name === 'apb-api-aeatservice-v1' ? oauth : undefined);
    expect(document).toEqual(before);
    expect(normalized.info).toEqual(document.info);
    expect(normalized.servers).toEqual(document.servers);
    expect(normalized.components.schemas).toEqual(document.components.schemas);
    // Local exports have no operation subscription parameters or security overrides.
    expect(normalized.paths).toEqual(document.paths);
    if (name === 'echo-api') expect(normalized).toEqual(document);
    else expect(normalized.components.securitySchemes?.apiKeyHeader).toBeUndefined();
  });
});

describe('protección de peticiones y compatibilidad de parámetros', () => {
  it('elimina solo la suscripción y conserva Authorization', () => {
    const request = {url: 'https://gateway.example/v1?subscription-key=old&q=one%20two', headers: {'ocp-apim-subscription-key': 'old', Authorization: 'Bearer consumer'}};
    expect(stripSubscription(request, {subscriptionRequired: false})).toEqual({url: 'https://gateway.example/v1?q=one+two', headers: {Authorization: 'Bearer consumer'}});
  });
  it('mantiene URL byte a byte si no hay una clave innecesaria', () => {
    const url = 'https://gateway.example/v2?q=one%20two';
    expect(stripSubscription({url}, {subscriptionRequired: false}).url).toBe(url);
    expect(adaptArrayQueries(url)).toBe(url);
  });
  it('true y desconocido mantienen claves introducidas por el consumidor', () => {
    const request = {url: 'https://gateway.example?subscription-key=key', headers: {'Ocp-Apim-Subscription-Key': 'key'}};
    expect(stripSubscription(structuredClone(request), {subscriptionRequired: true})).toEqual(request);
    expect(stripSubscription(structuredClone(request))).toEqual(request);
  });
  it('un nombre personalizado Authorization no elimina Bearer del consumidor', () => {
    const metadata = {subscriptionRequired: false, subscriptionKeyParameterNames: {header: 'Authorization'}};
    const document = {openapi: '3.0.1', components: {securitySchemes: {bearer}}, paths: {}};
    const request = {url: 'https://gateway.example/ping', headers: {Authorization: 'Bearer consumer'}};
    expect(stripSubscription(structuredClone(request), metadata, document)).toEqual(request);
    expect(stripSubscription(structuredClone(request), metadata)).toEqual(request);
  });
  it('mantiene el adaptador DevExtreme y no modifica endpoints/versiones', () => {
    const result = new URL(adaptArrayQueries('https://gateway.example/api/v2?sort=%7B%22selector%22%3A%22id%22%7D'));
    expect(result.pathname).toBe('/api/v2'); expect(JSON.parse(result.searchParams.get('sort')!)).toEqual([{selector: 'id'}]);
  });
});
