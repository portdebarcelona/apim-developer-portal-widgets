<script setup lang="ts">
import {computed, inject} from "vue"
import {ApiReference, type ApiReferenceConfiguration} from "@scalar/api-reference"
import "@scalar/api-reference/style.css"
import type {PortalRuntimeConfig} from "../config"
import {createDocumentationOAuthConfiguration} from "../documentation/oauth"
import {useOpenApiDocument} from "../documentation/useOpenApiDocument"

const runtimeConfig = inject<PortalRuntimeConfig>("runtimeConfig")!
const {specification, loading, error, apiId} = useOpenApiDocument("scalar")
const title = computed(() => specification.value?.info?.title || apiId.value)
const version = computed(() => specification.value?.info?.version || "")
const description = computed(() => specification.value?.info?.description || "")
const configuration = computed<ApiReferenceConfiguration | undefined>(() => {
  if (!specification.value) return undefined
  const oauth = createDocumentationOAuthConfiguration(specification.value, runtimeConfig)
  return {
    content: oauth.specification,
    theme: "default",
    layout: "modern",
    localization: {locale: "es"},
    persistAuth: false,
    telemetry: false,
    agent: {disabled: true},
    mcp: {disabled: true},
    oauth2RedirectUri: oauth.scalarRedirectUri,
    authentication: oauth.scalarAuthentication,
  } as unknown as ApiReferenceConfiguration
})
</script>

<template>
  <section class="documentation-page">
    <div v-if="loading" class="status-panel">Cargando documentación Scalar…</div>
    <div v-else-if="error" class="status-panel error">
      <h1>No se pudo abrir Scalar</h1>
      <p>{{ error }}</p>
      <p>API: <code>{{ apiId }}</code></p>
    </div>
    <template v-else-if="configuration">
      <header class="documentation-heading">
        <p class="documentation-kind">SCALAR</p>
        <h1>{{ title }} <small v-if="version">{{ version }}</small></h1>
        <p v-if="description">{{ description }}</p>
      </header>
      <ApiReference :configuration="configuration" />
    </template>
  </section>
</template>
