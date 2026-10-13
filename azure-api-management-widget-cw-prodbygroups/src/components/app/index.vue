<style src="../../styles/app.scss"></style>

<template>
  <div class="products-catalog">
    <div class="auth-info-container">
      <div class="info-card compact-card">
        <div class="info-icon small-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0M12 9v4m0 4h.01" />
          </svg>
        </div>

        <div class="info-content-row">
          <span class="info-title-inline">Acceso a las APIs:</span>
          <span class="info-text-inline">
            El acceso a determinadas APIs puede requerir permisos adicionales o credenciales específicas.
          </span>
        </div>

        <div class="info-action-row">
          <button class="request-btn small-btn" type="button" disabled title="No disponible en este momento">
            Solicitar acceso
          </button>
        </div>
      </div>
    </div>

    <div id="app-content" class="widget-container app-content">
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <span>Cargando productos...</span>
      </div>

      <div v-else-if="error" class="error-panel">
        <span class="error-icon" aria-hidden="true">!</span>
        {{ error }}
      </div>

      <div v-else-if="!isAuthenticated" class="no-data">
        <span class="empty-icon" aria-hidden="true">🔐</span>
        <p>Inicia sesión para ver tus productos disponibles</p>
      </div>

      <div v-else-if="products.length === 0" class="no-data">
        <span class="empty-icon" aria-hidden="true">[]</span>
        <p>No tienes productos asignados</p>
        <a href="/solicitar-acceso" class="request-access-btn">Solicitar acceso</a>
      </div>

      <template v-else>
        <div class="toolbar">
          <div class="search-container">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>

            <input
              v-model="search"
              type="text"
              class="search-input"
              placeholder="Buscar por equipo o API..."
              aria-label="Buscar por equipo o API"
            />

            <button v-if="search" class="search-clear" type="button" aria-label="Limpiar búsqueda" @click="clearSearch">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>

          <div class="view-toggle">
            <button
              class="toggle-btn"
              :class="{ active: viewMode === 'table' }"
              type="button"
              title="Vista de tabla"
              aria-label="Vista de tabla"
              @click="showTableView"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 5v14h18V5H3zm4 2v2H5V7h2zm-2 6v-2h2v2H5zm0 2h2v2H5v-2zm14 2H9v-2h10v2zm0-4H9v-2h10v2zm0-4H9V7h10v2z" />
              </svg>
            </button>

            <button
              class="toggle-btn"
              :class="{ active: viewMode === 'cards' }"
              type="button"
              title="Vista de tarjetas"
              aria-label="Vista de tarjetas"
              @click="showCardsView"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4 5v13h17V5H4zm10 2v3h-3V7h3zM6 7h3v3H6V7zm0 9v-3h3v3H6zm5 0v-3h3v3h-3zm8 0h-3v-3h3v3zm0-5h-3V7h3v3z" />
              </svg>
            </button>
          </div>
        </div>

        <div v-if="filteredProducts.length === 0" class="no-results">
          No se encontraron resultados para "{{ search }}"
        </div>

        <div v-else-if="viewMode === 'cards'" :key="`cards-${resultsRenderKey}`" class="cards-grid">
          <div
            v-for="product in pagedProducts"
            :key="product.id"
            class="card"
            :class="{ 'card-expanded': isExpanded(product) }"
          >
            <div class="card-header" @click="toggleProduct(product.name)">
              <div class="card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 7h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 4h4v3h-4V4zm10 16H4V9h16v11z" />
                </svg>
              </div>

              <div class="card-info">
                <h3 class="card-title">{{ product.displayName }}</h3>
                <span class="card-count">{{ product.apiCount }} API{{ product.apiCount !== 1 ? "s" : "" }}</span>
              </div>

              <svg class="card-expand-icon" :class="{ rotated: isExpanded(product) }" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
              </svg>
            </div>

            <div v-if="isExpanded(product)" class="card-apis">
              <div v-if="product.apis.length === 0" class="card-no-apis">
                No hay APIs disponibles
              </div>

              <div v-for="api in product.apis" v-else :key="api.id" class="card-api-item">
                <svg class="card-api-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2 5 5h-5V4zM6 20V4h5v7h7v9H6z" />
                </svg>
                <div class="api-details">
                  <span class="card-api-name">{{ api.displayName }}</span>
                  <span class="api-description">{{ selectedApi(api).description || "-" }}</span>
                </div>
                <select
                  v-if="api.versions.length > 1"
                  v-model="selectedApiVersionIds[api.id]"
                  class="version-select"
                  aria-label="Seleccionar versión"
                  @click.stop
                  @change="refreshLayout"
                >
                  <option v-for="version in api.versions" :key="version.id" :value="version.id">
                    {{ getVersionLabel(version) }}
                  </option>
                </select>
                <span v-else-if="selectedApi(api).apiVersion" class="single-version">
                  {{ getVersionLabel(selectedApi(api)) }}
                </span>
                <div class="item-actions">
                  <button class="nav-btn nav-btn-custom" type="button" @click.stop="openApi(selectedApi(api).name, 'custom-api-details', selectedApi(api).apiVersion)">Scalar</button>
                  <button class="nav-btn nav-btn-default" type="button" @click.stop="openApi(selectedApi(api).name, 'api-details', selectedApi(api).apiVersion)">APIM</button>
                  <button class="nav-btn nav-btn-swagger" type="button" @click.stop="openApi(selectedApi(api).name, 'custom-apis-swagger', selectedApi(api).apiVersion)">Swagger</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else :key="`table-${resultsRenderKey}`" class="table-view">
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="expand-col"></th>
                  <th>Equipo</th>
                  <th>Descripción</th>
                  <th>APIs</th>
                </tr>
              </thead>

              <tbody>
                <template v-for="product in pagedProducts" :key="product.id">
                  <tr
                    class="table-row"
                    :class="{ expanded: isExpanded(product) }"
                    @click="toggleProduct(product.name)"
                  >
                    <td class="expand-cell">
                      <svg class="expand-icon" :class="{ rotated: isExpanded(product) }" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                      </svg>
                    </td>
                    <td class="product-cell">
                      <span class="product-name">{{ product.displayName }}</span>
                    </td>
                    <td class="status-cell">
                      <span>{{ product.description || "-" }}</span>
                    </td>
                    <td class="apis-cell">{{ product.apiCount }}</td>
                  </tr>

                  <tr v-if="isExpanded(product)" class="expanded-row">
                    <td colspan="4">
                      <div v-if="product.apis.length === 0" class="no-apis">
                        No hay APIs disponibles para este producto
                      </div>

                      <div v-else class="apis-list">
                        <div v-for="api in product.apis" :key="api.id" class="api-item">
                          <svg class="api-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2 5 5h-5V4zM6 20V4h5v7h7v9H6z" />
                          </svg>
                          <div class="api-details">
                            <span class="api-name">{{ api.displayName }}</span>
                            <span class="api-description">{{ selectedApi(api).description || "-" }}</span>
                          </div>
                          <select
                            v-if="api.versions.length > 1"
                            v-model="selectedApiVersionIds[api.id]"
                            class="version-select"
                            aria-label="Seleccionar versión"
                            @click.stop
                            @change="refreshLayout"
                          >
                            <option v-for="version in api.versions" :key="version.id" :value="version.id">
                              {{ getVersionLabel(version) }}
                            </option>
                          </select>
                          <span v-else-if="selectedApi(api).apiVersion" class="single-version">
                            {{ getVersionLabel(selectedApi(api)) }}
                          </span>
                          <div class="item-actions">
                            <button class="nav-btn nav-btn-custom" type="button" @click.stop="openApi(selectedApi(api).name, 'custom-api-details', selectedApi(api).apiVersion)">Scalar</button>
                            <button class="nav-btn nav-btn-default" type="button" @click.stop="openApi(selectedApi(api).name, 'api-details', selectedApi(api).apiVersion)">APIM</button>
                            <button class="nav-btn nav-btn-swagger" type="button" @click.stop="openApi(selectedApi(api).name, 'custom-apis-swagger', selectedApi(api).apiVersion)">Swagger</button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <div v-if="totalPages > 1" class="pagination">
            <button class="pagination-btn" type="button" :disabled="currentPage === 1" aria-label="Página anterior" @click="goToPage(currentPage - 1)">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>

            <template v-for="page in totalPages" :key="page">
              <button
                v-if="shouldShowPage(page)"
                class="pagination-btn"
                :class="{ active: page === currentPage }"
                type="button"
                @click="goToPage(page)"
              >
                {{ page }}
              </button>

              <span v-else-if="shouldShowEllipsis(page)" class="pagination-ellipsis">...</span>
            </template>

            <button class="pagination-btn" type="button" :disabled="currentPage === totalPages" aria-label="Página siguiente" @click="goToPage(currentPage + 1)">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
              </svg>
            </button>

            <span class="pagination-info">
              {{ paginationStart }}-{{ paginationEnd }} de {{ filteredProducts.length }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, inject, nextTick, onMounted, onUnmounted, ref, watch} from "vue"
import {
  ApimClient,
  compareApiVersions,
  formatVersionLabel,
  getSubscribedProductNames,
  groupApisByVersion,
  mapApi,
} from "@portdebarcelona/apim-core"
import type {
  ApiGroup,
  ApiItem,
  ApimProductRaw,
  ApimWidgetSecrets,
  ProductItem,
  ViewMode,
} from "../../types"
import {openApi} from "../../utils/navigation"
import {injectParentStyles} from "../../utils/parentStyles"
import {resizeWidget} from "../../utils/resizeWidget"

const PAGE_SIZE = 6

const secretsPromise = inject<Promise<ApimWidgetSecrets>>("secretsPromise")
const clientPromise = inject<Promise<ApimClient>>("clientPromise")

const products = ref<ProductItem[]>([])
const loading = ref(true)
const error = ref("")
const isAuthenticated = ref(false)
const search = ref("")
const viewMode = ref<ViewMode>("table")
const currentPage = ref(1)
const expandedProductName = ref<string | null>(null)
const selectedApiVersionIds = ref<Record<string, string>>({})
const resultsRenderKey = ref(0)
let resizeObserver: ResizeObserver | null = null

const filteredProducts = computed(() => {
  const term = search.value.trim().toLowerCase()

  if (!term) {
    return products.value
  }

  return products.value.flatMap((product) => {
    const productMatches =
      product.displayName.toLowerCase().includes(term) ||
      product.name.toLowerCase().includes(term) ||
      product.description.toLowerCase().includes(term)

    if (productMatches) {
      return [product]
    }

    const matchingApis = product.apis.filter((apiGroup) =>
      apiGroup.displayName.toLowerCase().includes(term) ||
      apiGroup.versions.some((api) =>
        api.name.toLowerCase().includes(term) ||
        api.displayName.toLowerCase().includes(term) ||
        api.description.toLowerCase().includes(term) ||
        getVersionLabel(api).toLowerCase().includes(term),
      ),
    )

    if (matchingApis.length === 0) {
      return []
    }

    return [{
      ...product,
      apis: matchingApis,
      apiCount: matchingApis.length,
    }]
  })
})

const totalPages = computed(() => Math.ceil(filteredProducts.value.length / PAGE_SIZE))

const pagedProducts = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredProducts.value.slice(start, start + PAGE_SIZE)
})

const paginationStart = computed(() => {
  if (filteredProducts.value.length === 0) {
    return 0
  }

  return (currentPage.value - 1) * PAGE_SIZE + 1
})

const paginationEnd = computed(() =>
  Math.min(currentPage.value * PAGE_SIZE, filteredProducts.value.length),
)

function clearSearch(): void {
  search.value = ""
  currentPage.value = 1
  expandedProductName.value = null
  resultsRenderKey.value += 1
  nextTick(resizeWidget)
}

function showTableView(): void {
  viewMode.value = "table"
}

function showCardsView(): void {
  viewMode.value = "cards"
}

function isExpanded(product: ProductItem): boolean {
  return expandedProductName.value === product.name
}

function toggleProduct(productName: string): void {
  expandedProductName.value = expandedProductName.value === productName ? null : productName
  resizeWidget()
}

function goToPage(page: number): void {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    resizeWidget()
  }
}

function shouldShowPage(page: number): boolean {
  return (
    page === 1 ||
    page === totalPages.value ||
    (page >= currentPage.value - 1 && page <= currentPage.value + 1)
  )
}

function shouldShowEllipsis(page: number): boolean {
  return page === currentPage.value - 2 || page === currentPage.value + 2
}

function syncSelectedApiVersions(apiGroups: ApiGroup[]): void {
  const nextSelected = {...selectedApiVersionIds.value}

  apiGroups.forEach((group) => {
    if (!nextSelected[group.id] || !group.versions.some((version) => version.id === nextSelected[group.id])) {
      nextSelected[group.id] = getLatestApiVersion(group.versions)?.id || ""
    }
  })

  selectedApiVersionIds.value = nextSelected
}

function selectedApi(group: ApiGroup): ApiItem {
  return group.versions.find((version) => version.id === selectedApiVersionIds.value[group.id]) || group.versions[0]
}

function getLatestApiVersion(versions: ApiItem[]): ApiItem | undefined {
  return versions.slice().sort((a, b) => compareApiVersions(b, a))[0]
}

function getVersionLabel(api: ApiItem): string {
  const label = formatVersionLabel(api)
  return label === "Versión base" ? "v1" : label
}

function refreshLayout(): void {
  nextTick(resizeWidget)
}

async function getSubscribedProducts(client: ApimClient, userId: string): Promise<Set<string>> {
  try {
    return getSubscribedProductNames(await client.listUserSubscriptions(userId))
  } catch (exception) {
    console.warn("Error obteniendo suscripciones del usuario", exception)
    return new Set<string>()
  }
}

async function getProductApis(client: ApimClient, productName: string): Promise<ApiItem[]> {
  try {
    const apis = (await client.listProductApis(productName)).map(mapApi)

    apis.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "es", {sensitivity: "base"}),
    )

    return apis
  } catch (exception) {
    console.warn(`Error obteniendo APIs del producto ${productName}`, exception)
    return []
  }
}

async function mapProduct(
  product: ApimProductRaw,
  client: ApimClient,
  subscribedProducts: Set<string>,
): Promise<ProductItem> {
  const properties = product.properties || {}
  const rawApis = await getProductApis(client, product.name)
  const apis = groupApisByVersion(rawApis)
  syncSelectedApiVersions(apis)

  return {
    id: product.id || product.name,
    name: product.name,
    displayName: properties.displayName || product.name,
    description: properties.description || "",
    apiCount: rawApis.length,
    apis,
    isSubscribed: subscribedProducts.has(product.name),
  }
}

async function loadProducts(): Promise<void> {
  if (!secretsPromise || !clientPromise) {
    error.value = "Error: no se pudo inicializar el contexto de APIM"
    loading.value = false
    return
  }

  try {
    const [secrets, client] = await Promise.all([secretsPromise, clientPromise])

    if (!secrets.userId) {
      isAuthenticated.value = false
      return
    }

    isAuthenticated.value = true

    const subscribedProducts = await getSubscribedProducts(client, secrets.userId)
    const allProducts = await client.listProducts()
    products.value = await Promise.all(
      allProducts.map((product) => mapProduct(product, client, subscribedProducts)),
    )
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : String(exception)
    error.value = `Error: ${message}`
    console.error("Error loading products:", exception)
  } finally {
    loading.value = false
    nextTick(resizeWidget)
  }
}

watch(search, (newValue, oldValue) => {
  currentPage.value = 1
  expandedProductName.value = null

  if (!newValue.trim() && oldValue.trim()) {
    resultsRenderKey.value += 1
  }

  nextTick(resizeWidget)
})

watch(viewMode, () => {
  currentPage.value = 1
  expandedProductName.value = null
  nextTick(resizeWidget)
})

watch(currentPage, () => {
  expandedProductName.value = null
  nextTick(resizeWidget)
})

watch([products, loading], () => {
  nextTick(resizeWidget)
}, {deep: true})

onMounted(async () => {
  injectParentStyles(`
    section { margin-top: 0 !important; }
    section > div { margin-top: 0 !important; padding-top: 0 !important; }
    .ProseMirror:has(> p:only-child:empty),
    .ProseMirror:has(> p.text:only-child:empty) {
      min-height: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
      overflow: hidden !important;
    }
    .ProseMirror > p:empty {
      min-height: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      pointer-events: none !important;
    }
  `)

  await loadProducts()

  const observedElement = document.getElementById("app-content") || document.body
  resizeObserver = new ResizeObserver(() => resizeWidget())
  resizeObserver.observe(observedElement)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>
