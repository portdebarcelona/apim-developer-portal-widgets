import {createApp} from 'vue';
import {createApiReference} from '@scalar/api-reference';
import '@scalar/api-reference/style.css';
import AppHost, {type RenderViewer} from '../../shared/api-documentation/AppHost.vue';
import {isConsumerAuthHeader, subscriptionNames} from '../../shared/api-documentation/security';

const renderViewer: RenderViewer = async (element, api, values, active) => {
  const content = structuredClone(api.document);
  const scheme = api.oauth && (content.openapi ? content.components?.securitySchemes : content.securityDefinitions)?.[api.oauth.id];
  if (scheme?.flows && api.oauth?.clientId) {
    for (const flow of Object.values(scheme.flows) as Record<string, unknown>[]) {
      flow['x-scalar-client-id'] = api.oauth.clientId;
      flow['x-scalar-credentials-location'] = 'body';
    }
  }
  const reference = createApiReference(element, {
    content, theme: (values.theme || 'purple') as 'purple',
    documentDownloadType: 'none', hideClientButton: true, darkMode: false, forceDarkModeState: 'light', hideDarkModeToggle: true,
    persistAuth: false, persistSelectedClient: false, telemetry: false,
    showDeveloperTools: 'never',
    // Requests go directly to the documented gateway; never to a public proxy.
    proxyUrl: '',
    onRequestBuilt: ({request}: {request: Request}) => {
      if (!active()) throw new Error('La API seleccionada ha cambiado.');
      if (api.metadata?.subscriptionRequired === false) {
        const names = subscriptionNames(api.metadata);
        if (!isConsumerAuthHeader(api.document, names.header)) request.headers.delete(names.header);
        // The normalizer also removes APIM parameter definitions. Block any key
        // manually reintroduced into the URL rather than sending it accidentally.
        if (new URL(request.url).searchParams.has(names.query)) throw new Error('Esta API no requiere una clave de suscripción.');
      }
    },
  });
  return () => reference.destroy();
};
createApp(AppHost, {kind: 'scalar', renderViewer}).mount('#root');
