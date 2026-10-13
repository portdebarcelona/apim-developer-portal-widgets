<script setup lang="ts">
import {computed, inject, nextTick, onBeforeUnmount, ref, watch} from "vue"
import SwaggerUI from "swagger-ui-dist/swagger-ui-es-bundle.js"
import "swagger-ui-dist/swagger-ui.css"
import type {PortalRuntimeConfig} from "../config"
import {createDocumentationOAuthConfiguration} from "../documentation/oauth"
import {useOpenApiDocument} from "../documentation/useOpenApiDocument"

const runtimeConfig = inject<PortalRuntimeConfig>("runtimeConfig")!
const {specification, loading, error, apiId} = useOpenApiDocument("swagger")
const container = ref<HTMLElement | null>(null)
const title = computed(() => specification.value?.info?.title || apiId.value)
const version = computed(() => specification.value?.info?.version || "")
const description = computed(() => specification.value?.info?.description || "")

watch(specification, async (document) => {
  if (!document) return
  await nextTick()
  if (!container.value) return
  container.value.replaceChildren()
  const oauth = createDocumentationOAuthConfiguration(document, runtimeConfig)
  const ui = SwaggerUI({
    domNode: container.value,
    spec: oauth.specification,
    deepLinking: true,
    persistAuthorization: false,
    oauth2RedirectUrl: oauth.swaggerRedirectUri,
    validatorUrl: "none",
    tryItOutEnabled: false,
  })
  if (oauth.swaggerOAuth) ui.initOAuth(oauth.swaggerOAuth)
})

onBeforeUnmount(() => container.value?.replaceChildren())
</script>

<template>
  <section class="documentation-page swagger-documentation">
    <div v-if="loading" class="status-panel">Cargando Swagger UI…</div>
    <div v-else-if="error" class="status-panel error">
      <h1>No se pudo abrir Swagger UI</h1>
      <p>{{ error }}</p>
      <p>API: <code>{{ apiId }}</code></p>
    </div>
    <template v-else>
      <header class="documentation-heading">
        <p class="documentation-kind">SWAGGER UI</p>
        <h1>{{ title }} <small v-if="version">{{ version }}</small></h1>
        <p v-if="description">{{ description }}</p>
      </header>
      <div ref="container" class="swagger-container" />
    </template>
  </section>
</template>
