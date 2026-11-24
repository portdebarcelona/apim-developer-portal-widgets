<script setup lang="ts">
import {reactive, watch} from 'vue';
import {buildOnChange, getEditorValues} from '@azure/api-management-custom-widgets-tools';
import {defaults, type WidgetValues} from './types';
import './editor.css';
const props = defineProps<{kind: 'scalar' | 'swagger'}>();
const values = reactive({...defaults, ...getEditorValues<WidgetValues>()});
const changed = buildOnChange<WidgetValues>();
const fields = props.kind === 'scalar' ? ['tenantId', 'clientId'] as const :
  ['tenantId', 'clientId', 'authorizationUrl', 'tokenUrl', 'scopes', 'oauth2RedirectUrl'] as const;
const labels: Record<string, string> = {tenantId: 'Azure AD Tenant ID', clientId: 'OAuth2 Client ID',
  authorizationUrl: 'Authorization URL', tokenUrl: 'Token URL', scopes: 'Scopes', oauth2RedirectUrl: 'OAuth2 Redirect URL'};
for (const field of ['theme', ...fields] as const) watch(() => values[field], value => changed({[field]: value}));
</script>
<template>
  <div class="form">
    <div v-if="kind === 'scalar'" class="form-group">
      <label for="theme" class="form-label">Theme</label>
      <select id="theme" v-model="values.theme" class="form-control">
        <option value="">Purple (default)</option><option value="purple">Purple</option><option value="default">Default</option>
        <option value="kepler">Kepler (light)</option><option value="saturn">Saturn (dark)</option><option value="none">None</option>
      </select>
    </div>
    <div v-for="field in fields" :key="field" class="form-group">
      <label :for="field" class="form-label">{{ labels[field] }}</label>
      <input :id="field" v-model="values[field]" type="text" class="form-control" />
    </div>
    <small class="form-hint">Los valores OAuth solo se utilizan para un servidor asociado a la API seleccionada. Los scopes de APIM tienen prioridad. Las claves de suscripción se introducen en el visualizador para cada API; las claves guardadas anteriormente en el editor no se envían automáticamente.</small>
  </div>
</template>
