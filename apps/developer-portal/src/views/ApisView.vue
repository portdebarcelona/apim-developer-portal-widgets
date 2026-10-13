<script setup lang="ts">
import type {ApiGroup} from "@portdebarcelona/apim-core"
import {useBff} from "../api/useBff"
import AccessInfo from "../components/AccessInfo.vue"
import ApiCatalog from "../components/catalog/ApiCatalog.vue"
import {useRemoteData} from "../composables/useRemoteData"

const bff = useBff()
const {data, loading, error, reload} = useRemoteData((signal) => bff.getCatalog<ApiGroup[]>("/api/catalog/apis", signal))
</script>

<template>
  <section class="catalog-page api-catalog">
    <h1 class="legacy-page-title">APIs</h1>
    <AccessInfo />
    <div class="widget-container">
      <div v-if="loading" class="loading"><div class="spinner"></div><span>Cargando APIs...</span></div>
      <div v-else-if="error" class="error-panel"><span class="error-icon" aria-hidden="true">!</span><span>{{ error }}</span><button type="button" @click="reload">Reintentar</button></div>
      <ApiCatalog v-else :groups="data || []" />
    </div>
  </section>
</template>
