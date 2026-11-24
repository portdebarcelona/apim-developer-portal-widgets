import {test, expect, type Page} from '@playwright/test';
import {createHash} from 'node:crypto';

const ids = {ptp: 'pre-apb-api-ptp-v1', adv: 'apb-api-adv-v1', countries: 'apb-api-countries-v1', echo: 'echo-api', oauth: 'apb-api-aeatservice-v1', jwt: 'jwt-api', custom: 'custom-api'};
const countryScope = 'api://aff61051-890f-4ca5-b630-b7eb9c007d69/.default';
const key = {type: 'apiKey', name: 'Ocp-Apim-Subscription-Key', in: 'header'};
const query = {type: 'apiKey', name: 'subscription-key', in: 'query'};
function document(id: string) {
  const custom = id === ids.custom;
  return {openapi: '3.0.1', info: {title: `${id} documentation`, version: 'v1', description: 'Descripción original'},
    servers: [{url: 'http://127.0.0.1:3199/backend/v1'}],
    components: {securitySchemes: {
      apiKeyHeader: custom ? {...key, name: 'X-Custom-Subscription'} : key,
      apiKeyQuery: custom ? {...query, name: 'custom-sub'} : query,
      ...(id === ids.jwt ? {bearer: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'}} : {}),
      ...(id === ids.countries ? {'oauth2sp-apim-apbapipre': {type: 'oauth2', flows: {authorizationCode: {
        authorizationUrl: 'http://127.0.0.1:3199/authorize', tokenUrl: 'http://127.0.0.1:3199/token', scopes: {[countryScope]: countryScope},
      }}}} : {}),
    }}, security: id === ids.countries ? [{apiKeyHeader: [], 'oauth2sp-apim-apbapipre': [countryScope]}, {apiKeyQuery: [], 'oauth2sp-apim-apbapipre': [countryScope]}] : id === ids.jwt ? [{apiKeyHeader: [], bearer: []}] : [{apiKeyHeader: []}, {apiKeyQuery: []}],
    paths: {'/ping': {get: {operationId: 'ping', summary: 'Ping', responses: {'200': {description: 'OK', content: {'application/json': {schema: {type: 'object'}, example: {ok: true}}}}}}},
      '/public': {get: {summary: 'Public', security: [], responses: {'200': {description: 'OK'}}}}},
  };
}

async function setup(page: Page, baseURL: string, unavailable = false, oauthStatus = 200, missingExportedOAuth = false, serverViaList = false) {
  const managementCalls: string[] = [];
  const requests: {url: string; headers: Record<string, string>}[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({origin}) => {
    if (window.parent !== window || location.pathname === '/harness.html') return;
    const post = window.postMessage.bind(window);
    // In production parent is a different window. Intercept the request here so
    // the SDK does not receive its own request as though it were a response.
    window.postMessage = ((data: any, ...args: any[]) => {
      const message = data?.askForSecretsMSAPIM;
      if (message && !message.managementApiUrl) post({askForSecretsMSAPIM: {
        managementApiUrl: `${origin}/management`, apiVersion: '2024-05-01', token: 'PortalContextToken',
        parentLocation: {href: location.href, origin},
      }}, '*');
      else post(data, ...args as [string]);
    }) as typeof window.postMessage;
    // Old library credentials must not be restored by either viewer.
    localStorage.setItem('authorized', JSON.stringify({apiKeyHeader: {value: 'stale-key', schema: {type: 'apiKey', name: 'Ocp-Apim-Subscription-Key', in: 'header'}}}));
    localStorage.setItem('scalar-reference-auth', JSON.stringify({apiKeyHeader: {value: 'stale-key'}}));
  }, {origin: baseURL});
  await page.route('**/management/**', async route => {
    const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS'};
    if (route.request().method() === 'OPTIONS') {await route.fulfill({status: 204, headers: cors}); return;}
    const url = new URL(route.request().url()); managementCalls.push(url.pathname);
    expect(route.request().headers().authorization).toBe('PortalContextToken');
    if (url.pathname.endsWith('/authorizationServers')) {
      await route.fulfill({headers: cors, status: serverViaList ? 200 : 403, json: {value: serverViaList ? [
        {name: 'unrelated-server', properties: {clientId: 'wrong-client'}},
        {name: 'sp-apim-apbapipre', properties: {clientId: 'api-specific-client', grantTypes: ['authorizationCode'],
          authorizationEndpoint: 'http://127.0.0.1:3199/authorize', tokenEndpoint: 'http://127.0.0.1:3199/token'}},
      ] : []}}); return;
    }
    if (url.pathname.includes('/authorizationServers/')) {
      await route.fulfill({status: oauthStatus, headers: cors, json: {properties: {clientId: 'api-specific-client', grantTypes: ['authorizationCode'],
        authorizationEndpoint: 'http://127.0.0.1:3199/authorize', tokenEndpoint: 'http://127.0.0.1:3199/token'}}}); return;
    }
    const id = decodeURIComponent(url.pathname.split('/').pop()!);
    if (url.searchParams.has('export')) {
      const spec = document(id);
      if (missingExportedOAuth && id === ids.countries) {
        delete spec.components.securitySchemes['oauth2sp-apim-apbapipre'];
        spec.security = [{apiKeyHeader: []}, {apiKeyQuery: []}];
      }
      await route.fulfill({headers: cors, json: spec}); return;
    }
    if (unavailable) {await route.fulfill({headers: cors, status: 403, json: {}}); return;}
    await route.fulfill({headers: cors, json: {properties: {subscriptionRequired: id === ids.echo || id === ids.custom,
      ...(id === ids.custom ? {subscriptionKeyParameterNames: {header: 'X-Custom-Subscription', query: 'custom-sub'}} : {}),
      ...(id === ids.oauth ? {authenticationSettings: {oAuth2AuthenticationSettings: [{authorizationServerId: 'api-oauth', scope: 'api.read'}]}} : {}),
      ...(id === ids.countries ? {authenticationSettings: {oAuth2: {authorizationServerId: 'sp-apim-apbapipre', scope: countryScope}}} : {}),
    }}});
  });
  await page.route('http://127.0.0.1:3199/**', async route => {
    requests.push({url: route.request().url(), headers: route.request().headers()});
    await route.fulfill({json: {ok: true}, headers: {'Access-Control-Allow-Origin': '*'}});
  });
  const open = async (id: string) => {
    const url = new URL(baseURL);
    url.searchParams.set('editorData', JSON.stringify({values: {clientId: 'legacy-client', tenantId: 'tenant', scopes: 'wrong-scope', subscriptionKey: 'legacy-editor-key'}, environment: 'runtime', instanceId: 'test-widget'}));
    url.hash = `api=${encodeURIComponent(id)}`;
    await page.goto(url.href);
    await expect(page.getByRole('heading', {name: new RegExp(`^${id} documentation`)}).first()).toBeVisible();
  };
  return {open, managementCalls, requests, errors};
}

async function execute(page: Page, kind: string) {
  if (kind === 'swagger') {
    await page.locator('.opblock-summary').filter({hasText: 'Ping'}).click();
    const tryButton = page.getByRole('button', {name: 'Try it out', exact: true});
    if (await tryButton.count()) await tryButton.click();
    await page.getByRole('button', {name: 'Execute', exact: true}).click();
  } else {
    await page.getByRole('button', {name: /Test Request/i}).first().click();
    await page.getByRole('button', {name: /^Send/}).first().click();
  }
}

async function authorize(page: Page, kind: string, scheme: string, credential: string) {
  if (kind === 'swagger') {
    await page.getByRole('button', {name: 'Authorize', exact: true}).first().click();
    const section = page.locator('.auth-container').filter({hasText: scheme});
    await expect(section.locator('input')).toHaveValue('');
    await section.locator('input').fill(credential);
    await section.getByRole('button', {name: 'Apply credentials', exact: true}).click();
    await section.getByRole('button', {name: 'Close', exact: true}).click();
  } else {
    const input = page.getByRole('group', {name: 'Authentication Required', exact: true}).getByRole('textbox').last();
    await expect(input).toHaveValue('');
    await input.fill(credential);
  }
}

test('PTP no pide claves ni envía credenciales heredadas', async ({page, baseURL}, testInfo) => {
  const {open, managementCalls, requests, errors} = await setup(page, baseURL!);
  await open(ids.ptp);
  await expect(page.getByText('Ocp-Apim-Subscription-Key', {exact: true})).toHaveCount(0);
  await expect(page.getByText('subscription-key', {exact: true})).toHaveCount(0);
  if (testInfo.project.name === 'swagger') await expect(page.getByRole('button', {name: 'Authorize', exact: true})).toHaveCount(0);
  await execute(page, testInfo.project.name);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  const outgoing = requests.find(request => new URL(request.url).pathname.endsWith('/ping'))!;
  expect(outgoing).toBeDefined();
  expect(outgoing.headers.authorization).toBeUndefined();
  expect(outgoing.headers['ocp-apim-subscription-key']).toBeUndefined();
  expect(new URL(outgoing.url).searchParams.has('subscription-key')).toBe(false);
  expect(managementCalls.some(path => path.includes('authorizationServers'))).toBe(false);
  expect(errors).toEqual([]);
});

test('echo-api conserva suscripción sin reutilizar claves al cambiar de API', async ({page, baseURL}, testInfo) => {
  const {open, requests, errors} = await setup(page, baseURL!);
  await open(ids.echo);
  await authorize(page, testInfo.project.name, 'apiKeyHeader', 'consumer-key');
  await execute(page, testInfo.project.name);
  await expect.poll(() => requests.some(request => request.headers['ocp-apim-subscription-key'] === 'consumer-key')).toBe(true);
  await page.evaluate(id => {location.hash = `api=${id}`;}, ids.custom);
  await expect(page.getByRole('heading', {name: new RegExp(`^${ids.custom} documentation`)}).first()).toBeVisible();
  if (testInfo.project.name === 'swagger') {
    await page.getByRole('button', {name: 'Authorize', exact: true}).first().click();
    const section = page.locator('.auth-container').filter({hasText: 'apiKeyHeader'});
    await expect(section.locator('input')).toHaveValue('');
    await section.getByRole('button', {name: 'Close', exact: true}).click();
  } else await expect(page.getByRole('group', {name: 'Authentication Required', exact: true}).getByRole('textbox').last()).toHaveValue('');
  await page.evaluate(id => {location.hash = `api=${id}`;}, ids.ptp);
  await expect(page.getByRole('heading', {name: new RegExp(`^${ids.ptp} documentation`)}).first()).toBeVisible();
  requests.length = 0;
  await execute(page, testInfo.project.name);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every(request => !request.headers['ocp-apim-subscription-key'] && !request.headers.authorization)).toBe(true);
  expect(errors).toEqual([]);
});

test('COUNTRIES recupera OAuth configurado y Try it cuando el servidor devuelve 403', async ({page, baseURL}, testInfo) => {
  const {open, requests, errors} = await setup(page, baseURL!, false, 403, true);
  await open(ids.countries);
  await expect(page.getByText('Descripción original', {exact: true}).first()).toBeVisible();
  if (testInfo.project.name === 'swagger') {
    await page.getByRole('button', {name: 'Authorize', exact: true}).first().click();
    await expect(page.locator('.auth-container')).toHaveCount(1);
    await expect(page.locator('input[aria-readonly="true"]')).toHaveValue('legacy-client');
    await expect(page.getByText(countryScope, {exact: true}).first()).toBeVisible();
    await page.getByRole('button', {name: 'Close', exact: true}).last().click();
    await page.locator('.opblock-summary').filter({hasText: 'Ping'}).click();
    await expect(page.getByRole('button', {name: 'Execute', exact: true})).toBeVisible();
  } else {
    await expect(page.getByRole('button', {name: /Test Request/i}).first()).toBeVisible();
    await page.getByRole('button', {name: /Scopes Selected/}).click();
    await expect(page.getByText(countryScope, {exact: true}).first()).toBeVisible();
  }
  expect(requests).toEqual([]);
  await page.evaluate(id => {location.hash = `api=${id}`;}, ids.ptp);
  await expect(page.getByRole('heading', {name: new RegExp(`^${ids.ptp} documentation`)}).first()).toBeVisible();
  await execute(page, testInfo.project.name);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every(request => !request.headers.authorization)).toBe(true);
  expect(errors).toEqual([]);
});

test('COUNTRIES resuelve el servidor por coincidencia exacta en la colección si falla el detalle', async ({page, baseURL}, testInfo) => {
  const {open, errors} = await setup(page, baseURL!, false, 403, true, true);
  await open(ids.countries);
  await expect(page.getByText(/envío de peticiones está deshabilitado/)).toHaveCount(0);
  if (testInfo.project.name === 'swagger') {
    await page.getByRole('button', {name: 'Authorize', exact: true}).first().click();
    await expect(page.locator('.auth-container')).toHaveCount(1);
    await expect(page.locator('input[aria-readonly="true"]')).toHaveValue('api-specific-client');
  } else await page.getByRole('button', {name: /Scopes Selected/}).click();
  await expect(page.getByText(countryScope, {exact: true}).first()).toBeVisible();
  await expect(page.getByText('wrong-scope', {exact: true})).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const status of [200, 403]) test(`COUNTRIES conserva OAuth exportado sin fallback ni duplicados, HTTP ${status}`, async ({page, baseURL}, testInfo) => {
  const {open, managementCalls, errors} = await setup(page, baseURL!, false, status);
  await open(ids.countries);
  if (testInfo.project.name === 'swagger') {
    await page.getByRole('button', {name: 'Authorize', exact: true}).first().click();
    await expect(page.locator('.auth-container')).toHaveCount(1);
    await expect(page.locator('.auth-container')).toContainText('oauth2sp-apim-apbapipre');
  } else await page.getByRole('button', {name: /Scopes Selected/}).click();
  await expect(page.getByText(countryScope, {exact: true}).first()).toBeVisible();
  await expect(page.getByText('wrong-scope', {exact: true})).toHaveCount(0);
  await expect(page.getByText('Ocp-Apim-Subscription-Key', {exact: true})).toHaveCount(0);
  // A hash transition uses the same instance and must discard the previous auth.
  await page.evaluate(id => {location.hash = `api=${id}`;}, ids.adv);
  await expect(page.getByRole('heading', {name: new RegExp(`^${ids.adv} documentation`)}).first()).toBeVisible();
  await expect(page.getByText(countryScope, {exact: true})).toHaveCount(0);
  if (testInfo.project.name === 'swagger') await expect(page.getByRole('button', {name: 'Authorize', exact: true})).toHaveCount(0);
  await page.evaluate(id => {location.hash = `api=${id}`;}, ids.countries);
  await expect(page.getByRole('heading', {name: new RegExp(`^${ids.countries} documentation`)}).first()).toBeVisible();
  expect(managementCalls.filter(path => path.includes('authorizationServers'))).toEqual([
    '/management/authorizationServers/sp-apim-apbapipre', '/management/authorizationServers/sp-apim-apbapipre',
  ]);
  expect(errors).toEqual([]);
});

test('OAuth asociado se conserva sin claves de suscripción ni scopes de otra API', async ({page, baseURL}, testInfo) => {
  const {open, managementCalls, errors} = await setup(page, baseURL!);
  await open(ids.oauth);
  if (testInfo.project.name === 'swagger') await page.getByRole('button', {name: 'Authorize', exact: true}).first().click();
  else await page.getByRole('button', {name: /Scopes Selected/}).click();
  await expect(page.getByText('api.read', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Ocp-Apim-Subscription-Key', {exact: true})).toHaveCount(0);
  await expect(page.getByText('wrong-scope', {exact: true})).toHaveCount(0);
  if (testInfo.project.name === 'swagger') {
    await expect.poll(async () => page.locator('input').evaluateAll(inputs => inputs.some(input => input.value === 'api-specific-client'))).toBe(true);
    await expect(page.locator('input[aria-readonly="true"]')).toHaveValue('api-specific-client');
  } else {
    await expect.poll(async () => page.getByRole('combobox', {name: 'Client ID', exact: true}).evaluate(element =>
      (element as HTMLInputElement).value ?? element.textContent)).toBe('api-specific-client');
  }
  expect(managementCalls.filter(path => path.includes('authorizationServers'))).toEqual(['/management/authorizationServers/api-oauth']);
  expect(errors).toEqual([]);
});

test('error de metadatos conserva seguridad y muestra advertencia', async ({page, baseURL}) => {
  const {open} = await setup(page, baseURL!, true);
  await open(ids.ptp);
  await expect(page.getByText(/No se pudo confirmar si esta API requiere suscripción/)).toBeVisible();
});

test('Bearer/JWT llega al backend sin añadir claves APIM', async ({page, baseURL}, testInfo) => {
  const {open, requests, errors} = await setup(page, baseURL!);
  await open(ids.jwt);
  await authorize(page, testInfo.project.name, 'bearer', 'consumer-jwt');
  await execute(page, testInfo.project.name);
  await expect.poll(() => requests.some(request => request.headers.authorization === 'Bearer consumer-jwt')).toBe(true);
  expect(requests.every(request => !request.headers['ocp-apim-subscription-key'] && !new URL(request.url).searchParams.has('subscription-key'))).toBe(true);
  expect(errors).toEqual([]);
});

test('Subscription Key obligatoria respeta el header personalizado', async ({page, baseURL}, testInfo) => {
  const {open, requests, errors} = await setup(page, baseURL!);
  await open(ids.custom);
  await authorize(page, testInfo.project.name, 'apiKeyHeader', 'custom-consumer-key');
  await execute(page, testInfo.project.name);
  await expect.poll(() => requests.some(request => request.headers['x-custom-subscription'] === 'custom-consumer-key')).toBe(true);
  expect(requests.every(request => !request.headers['ocp-apim-subscription-key'])).toBe(true);
  expect(errors).toEqual([]);
});

test('iframe sandbox existente conserva carga y navegación con el hash propagado por APIM', async ({page, baseURL}, testInfo) => {
  const {errors} = await setup(page, baseURL!);
  const iframeUrl = new URL(baseURL!);
  iframeUrl.searchParams.set('editorData', JSON.stringify({values: {}, environment: 'runtime', instanceId: 'sandbox-widget'}));
  iframeUrl.hash = `api=${ids.ptp}`;
  await page.route('**/harness.html', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html><body>
    <script>addEventListener('message', event => {
      if(event.data?.askForSecretsMSAPIM) event.source.postMessage({askForSecretsMSAPIM:{
        managementApiUrl: ${JSON.stringify(`${baseURL}/management`)}, apiVersion:'2024-05-01', token:'PortalContextToken',
        parentLocation:{href:location.href,origin:location.origin}
      }},'*');
    });</script><iframe title="Widget" sandbox="allow-scripts allow-forms allow-popups${testInfo.project.name === 'scalar' ? ' allow-same-origin' : ''}" src="${iframeUrl.href.replaceAll('&', '&amp;')}"></iframe>
    </body></html>`}));
  await page.goto(`${baseURL}/harness.html#api=${ids.ptp}`);
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', {name: new RegExp(`^${ids.ptp} documentation`)}).first()).toBeVisible();
  await page.locator('iframe').evaluate((element, api) => {
    const iframe = element as HTMLIFrameElement;
    location.hash = `api=${api}`;
    const url = new URL(iframe.src); url.hash = `api=${api}`; iframe.src = url.href;
  }, ids.echo);
  await expect(frame.getByRole('heading', {name: new RegExp(`^${ids.echo} documentation`)}).first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const sandbox of [false, true]) test(`Authorize OAuth abre el proveedor con PKCE y el scope de la API, sandbox=${sandbox}`, async ({page, baseURL}, testInfo) => {
  test.skip(testInfo.project.name !== 'swagger');
  const {open, errors} = await setup(page, baseURL!);
  await page.context().route('http://127.0.0.1:3199/authorize**', route => route.fulfill({contentType: 'text/html', body: '<h1>Proveedor OAuth de prueba</h1>'}));
  if (sandbox) {
    const iframeUrl = new URL(baseURL!);
    iframeUrl.hash = `api=${ids.countries}`;
    await page.route('**/harness.html', route => route.fulfill({contentType: 'text/html', body: `<!doctype html><html><body>
      <script>addEventListener('message', event => {
        if(event.data?.askForSecretsMSAPIM) event.source.postMessage({askForSecretsMSAPIM:{
          managementApiUrl:${JSON.stringify(`${baseURL}/management`)},apiVersion:'2024-05-01',token:'PortalContextToken',
          parentLocation:{href:location.href,origin:location.origin}
        }},'*');
      });</script><iframe title="Widget" style="width:1200px;height:1000px" sandbox="allow-scripts allow-forms allow-popups" src="${iframeUrl.href}"></iframe>
    </body></html>`}));
    await page.goto(`${baseURL}/harness.html#api=${ids.countries}`);
  } else await open(ids.countries);
  const view = sandbox ? page.frameLocator('iframe') : page;
  await view.getByRole('button', {name: 'Authorize', exact: true}).first().click();
  const popupPromise = page.waitForEvent('popup', {timeout: 5000});
  await view.getByRole('button', {name: 'Apply given OAuth2 credentials'}).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const url = new URL(popup.url());
  expect(url.pathname).toBe('/authorize');
  expect(url.searchParams.get('client_id')).toBe('api-specific-client');
  expect(url.searchParams.get('scope')).toBe(countryScope);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const widgetFrame = sandbox ? page.frames().find(frame => frame.parentFrame() === page.mainFrame())! : page.mainFrame();
  const verifier = await widgetFrame.evaluate(() => (window as any).swaggerUIRedirectOauth2.auth.codeVerifier);
  expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'));
  expect(errors).toEqual([]);
  await popup.close();
});
