<script setup lang="ts">
import {computed, ref, watch} from "vue"
import type {ViewMode} from "@portdebarcelona/apim-core"
import type {ProductCatalog} from "../api/contracts"
import {useBff} from "../api/useBff"
import AccessInfo from "../components/AccessInfo.vue"
import Pagination from "../components/catalog/Pagination.vue"
import ProductGroup from "../components/catalog/ProductGroup.vue"
import SearchBox from "../components/catalog/SearchBox.vue"
import {useRemoteData} from "../composables/useRemoteData"

const pageSize = 6
const bff = useBff()
const {data, loading, error, reload} = useRemoteData((signal) => bff.getCatalog<ProductCatalog[]>("/api/catalog/products", signal))
const search = ref("")
const page = ref(1)
const viewMode = ref<ViewMode>("table")
const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase("es")
  if (!term) return data.value || []
  return (data.value || []).filter((product) =>
    [product.name, product.displayName, product.description].some((value) => value.toLocaleLowerCase("es").includes(term)) ||
    product.apis.some((group) => group.displayName.toLocaleLowerCase("es").includes(term) ||
      group.versions.some((api) => api.name.toLocaleLowerCase("es").includes(term))),
  )
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch([search, viewMode], () => { page.value = 1 })
</script>

<template>
  <section class="catalog-page products-catalog">
    <h1 class="legacy-page-title">APIs por equipo</h1>
    <AccessInfo />
    <div class="widget-container">
      <div v-if="loading" class="loading"><div class="spinner"></div><span>Cargando productos...</span></div>
      <div v-else-if="error" class="error-panel"><span class="error-icon" aria-hidden="true">!</span><span>{{ error }}</span><button type="button" @click="reload">Reintentar</button></div>
      <div v-else-if="!data?.length" class="no-data"><span class="empty-icon" aria-hidden="true">[]</span><p>No tienes productos asignados</p></div>
      <template v-else>
        <div class="toolbar">
          <SearchBox v-model="search" placeholder="Buscar por equipo o API..." />
          <div class="view-toggle">
            <button class="toggle-btn" :class="{active: viewMode === 'table'}" type="button" title="Vista de tabla" aria-label="Vista de tabla" @click="viewMode = 'table'">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5v14h18V5H3zm4 2v2H5V7h2zm-2 6v-2h2v2H5zm0 2h2v2H5v-2zm14 2H9v-2h10v2zm0-4H9v-2h10v2zm0-4H9V7h10v2z" /></svg>
            </button>
            <button class="toggle-btn" :class="{active: viewMode === 'cards'}" type="button" title="Vista de tarjetas" aria-label="Vista de tarjetas" @click="viewMode = 'cards'">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 5v13h17V5H4zm10 2v3h-3V7h3zM6 7h3v3H6V7zm0 9v-3h3v3H6zm5 0v-3h3v3h-3zm8 0h-3v-3h3v3zm0-5h-3V7h3v3z" /></svg>
            </button>
          </div>
        </div>
        <div v-if="!filtered.length" class="no-results">No se encontraron resultados para "{{ search }}"</div>
        <div v-else-if="viewMode === 'cards'" class="cards-grid grouped-cards">
          <ProductGroup v-for="product in filtered" :key="product.id" :product="product" view-mode="cards" />
        </div>
        <div v-else class="table-view">
          <div class="table-container">
            <table class="data-table product-table">
              <thead><tr><th class="expand-col"></th><th>Equipo</th><th>Descripción</th><th>APIs</th></tr></thead>
              <tbody><ProductGroup v-for="product in paged" :key="product.id" :product="product" view-mode="table" /></tbody>
            </table>
          </div>
          <Pagination :page="page" :page-count="pageCount" :total="filtered.length" :page-size="pageSize" @change="page = $event" />
        </div>
      </template>
    </div>
  </section>
</template>
