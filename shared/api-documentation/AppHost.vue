<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch} from 'vue';
import {askForSecrets, getValues} from '@azure/api-management-custom-widgets-tools';
import {defaults, type LoadedApi, type WidgetValues} from './types';
import {loadApi} from './load-api';
import {ApiNavigation, observeNavigation} from './navigation';
import {parentStyles} from './parent-styles';
import './styles.css';

export type RenderViewer = (element: HTMLElement, api: LoadedApi, values: WidgetValues,
  active: () => boolean) => Promise<() => void>;
const props = defineProps<{renderViewer: RenderViewer; kind: 'scalar' | 'swagger'}>();
const values = getValues(defaults);
const apiId = ref('');
const loading = ref(false);
const error = ref('');
const result = shallowRef<LoadedApi>();
const viewer = ref<HTMLElement>();
// A new context is obtained for this widget instance only. It never enters the
// OpenAPI document or a consumer request and is not saved in browser storage.
const context = askForSecrets('app');
// Keep a rejection handler attached even before the first API is selected.
void context.catch(() => {});
const controller = new ApiNavigation(async (id, signal) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const secrets = await Promise.race([context, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('El portal no ha proporcionado el contexto de acceso. Recarga la página.')), 15000);
      abort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', abort, {once: true});
    })]);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return await loadApi(id, secrets, values, signal);
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}, id => {
  result.value = undefined;
  apiId.value = id;
  loading.value = !!id;
  error.value = '';
}, api => { result.value = api; loading.value = false; }, message => { error.value = message; loading.value = false; });

watch(result, async (api, _, onCleanup) => {
  let active = true;
  let dispose: (() => void) | undefined;
  onCleanup(() => { active = false; dispose?.(); });
  if (!api) return;
  await nextTick();
  if (!active || !viewer.value) return;
  try {
    dispose = await props.renderViewer(viewer.value, api, values,
      () => active && result.value === api && apiId.value === api.apiId);
    if (!active) dispose();
  } catch {
    if (active) error.value = 'No se pudo inicializar el visualizador. Vuelve a intentarlo.';
  }
}, {flush: 'post'});

let stop: (() => void) | undefined;
let restoreStyles: (() => void) | undefined;
onMounted(() => {
  restoreStyles = parentStyles(props.kind);
  stop = observeNavigation(id => { void controller.select(id); });
});
onBeforeUnmount(() => { stop?.(); restoreStyles?.(); controller.dispose(); });
</script>

<template>
  <div class="doc-wrapper" :data-api="apiId" :data-viewer="kind">
    <div v-if="loading" class="state-overlay" role="status"><div class="spinner"></div><span class="state-text">Cargando documentación...</span></div>
    <div v-else-if="error" class="state-overlay state-error" role="alert">
      <p class="state-text">{{ error }}</p><button class="retry-btn" @click="controller.select(apiId, true)">Reintentar</button>
    </div>
    <div v-else-if="!apiId" class="state-overlay state-empty"><p class="state-text">Selecciona una API para ver su documentación</p></div>
    <template v-else-if="result">
      <p v-for="warning in result.warnings" :key="warning" class="metadata-warning" role="status">{{ warning }}</p>
      <div :key="apiId" ref="viewer" :class="kind === 'swagger' ? 'swagger-container' : 'scalar-wrap'"></div>
    </template>
  </div>
</template>
