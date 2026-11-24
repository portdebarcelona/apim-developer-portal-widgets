import {describe, expect, it} from 'vitest';
import {readFileSync, existsSync} from 'node:fs';
import {loadApi} from '../../shared/api-documentation/load-api';
import {defaults} from '../../shared/api-documentation/types';

const root = 'artifacts/apim-doc-deployment-2026-11-23/countries';
const context = {managementApiUrl: 'https://portal.example/management', apiVersion: '2024-05-01', token: ''};
const legacy = {...defaults, tenantId: 'wrong-tenant', clientId: 'wrong-client', scopes: 'wrong-scope', authorizationUrl: 'https://wrong.example/authorize', tokenUrl: 'https://wrong.example/token'};
const read = (file: string) => JSON.parse(readFileSync(`${root}/${file}.json`, 'utf8'));
describe.skipIf(!existsSync(`${root}/summary.json`))('regresión con exportaciones reales locales', () => {
  for (const status of [200, 403, 404, 500]) {
    it.each(['apb-api-countries-v1', 'apb-api-adv-v1', 'pre-apb-api-ptp-v1', 'echo-api', 'apb-api-aeatservice-v1'])(`%s servidor OAuth HTTP ${status}`, async id => {
      const source = read(`${id}.openapi`), metadata = read(`${id}.metadata`);
      const calls: string[] = [];
      const fetcher = (async (input: any) => {
        const url = new URL(input); calls.push(url.pathname);
        if (url.pathname.includes('/authorizationServers/')) return new Response(JSON.stringify({properties: read('sp-apim-apbapipre.server')}), {status});
        return Response.json(url.searchParams.has('export') ? source : {properties: metadata});
      }) as typeof fetch;
      const api = await loadApi(id, context, legacy, new AbortController().signal, fetcher);
      const expected = structuredClone(source);
      if (!metadata.subscriptionRequired) {
        delete expected.components.securitySchemes.apiKeyHeader;
        delete expected.components.securitySchemes.apiKeyQuery;
        expected.security = expected.security.map((r: any) => Object.fromEntries(Object.entries(r).filter(([key]) => !['apiKeyHeader', 'apiKeyQuery'].includes(key)))).filter((r: any) => Object.keys(r).length);
        if (!Object.keys(expected.components.securitySchemes).length) delete expected.components.securitySchemes;
      }
      expect(api.document).toEqual(expected); // Includes endpoints, examples, operations and versioning.
      expect(JSON.stringify(api.document)).not.toContain('wrong-');
      expect(api.oauth?.id).toBe(metadata.authenticationSettings.oAuth2 ? 'oauth2sp-apim-apbapipre' : undefined);
      expect(calls.some(path => path.endsWith('/authorizationServers'))).toBe(false);
      if (metadata.authenticationSettings.oAuth2) {
        expect(api.document.security.every((r: any) => r['oauth2sp-apim-apbapipre'][0] === metadata.authenticationSettings.oAuth2.scope)).toBe(true);
        expect(api.warnings.join(' ')).not.toContain('se utilizará');
      } else expect(calls).toHaveLength(2);
    });
  }
});
