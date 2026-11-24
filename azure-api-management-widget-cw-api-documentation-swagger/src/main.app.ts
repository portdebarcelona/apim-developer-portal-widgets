import {createApp} from 'vue';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import AppHost, {type RenderViewer} from '../../shared/api-documentation/AppHost.vue';
import {stripSubscription} from '../../shared/api-documentation/security';
import {adaptArrayQueries} from '../../shared/api-documentation/swagger-parameters';
import {lockAssociatedOAuth} from '../../shared/api-documentation/swagger-oauth-ui';

const renderViewer: RenderViewer = async (element, api, values, active) => {
  const root = createRoot(element);
  const unlock = lockAssociatedOAuth(element, api.oauth?.id, api.oauth?.scopes);
  let ui: any;
  root.render(createElement(SwaggerUI, {
    spec: structuredClone(api.document),
    plugins: [() => ({components: {OnlineValidatorBadge: () => null}})],
    layout: 'BaseLayout', deepLinking: false, displayOperationId: false,
    defaultModelsExpandDepth: 1, defaultModelExpandDepth: 1, docExpansion: 'list',
    filter: false, showExtensions: false, showCommonExtensions: false,
    tryItOutEnabled: true, persistAuthorization: false, validatorUrl: null,
    oauth2RedirectUrl: values.oauth2RedirectUrl || new URL('./oauth2-redirect.html', window.location.href).href,
    onComplete: (system: any) => {
      ui = system;
      if (!active()) return;
      system.initOAuth({clientId: api.oauth?.clientId || '', scopes: api.oauth?.scopes.join(' ') || '',
        scopeSeparator: ' ', usePkceWithAuthorizationCodeGrant: true});
    },
    requestInterceptor: (request: {url: string; headers?: Record<string, string>}) => {
      if (!active()) throw new Error('La API seleccionada ha cambiado.');
      request.url = adaptArrayQueries(request.url);
      return stripSubscription(request, api.metadata, api.document);
    },
  }));
  // A fresh Swagger store per API, never a global preauthorization or editor key.
  return () => {
    unlock();
    if (ui) ui.authActions.logout(ui.authSelectors.authorized().keySeq().toArray());
    delete (window as Window & {swaggerUIRedirectOauth2?: unknown}).swaggerUIRedirectOauth2;
    root.unmount();
  };
};
createApp(AppHost, {kind: 'swagger', renderViewer}).mount('#root');
