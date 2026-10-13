<style src="../../styles/app.scss"></style>

<template>
  <div class="api-catalog">
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

    <div class="widget-container">
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <span>Cargando APIs...</span>
      </div>

      <div v-else-if="error" class="error-panel">
        <span class="error-icon" aria-hidden="true">!</span>
        {{ error }}
      </div>

      <div v-else-if="apiGroups.length === 0" class="no-data">
        <span class="empty-icon" aria-hidden="true">[]</span>
        <p>No hay APIs disponibles</p>
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
              placeholder="Buscar APIs..."
              aria-label="Buscar APIs"
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

        <div v-if="filteredApis.length === 0" class="no-results">
          No se encontraron resultados para "{{ search }}"
        </div>

        <div v-else-if="viewMode === 'cards'" class="cards-grid">
          <div v-for="api in filteredApis" :key="api.id" class="card">
            <div class="card-header">
              <div class="card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4zM6 20V4h5v7h7v9H6z" />
                </svg>
              </div>

              <div class="card-info">
                <h3 class="card-title">{{ api.displayName }}</h3>
                <select
                  v-if="api.versions.length > 1"
                  v-model="selectedVersionIds[api.id]"
                  class="version-select card-version-select"
                  aria-label="Seleccionar versión"
                  @change="refreshLayout"
                >
                  <option v-for="version in api.versions" :key="version.id" :value="version.id">
                    {{ getVersionLabel(version) }}
                  </option>
                </select>
                <span v-else-if="selectedApi(api).apiVersion" class="card-version">
                  {{ getVersionLabel(selectedApi(api)) }}
                </span>
              </div>
            </div>

            <div class="card-body">
              <p v-if="selectedApi(api).description" class="card-description" v-html="sanitizeHtml(selectedApi(api).description)"></p>
              <p v-else class="card-description">-</p>
            </div>

            <div class="card-actions">
              <button class="nav-btn nav-btn-custom" type="button" @click="openApi(selectedApi(api).name, 'custom-api-details', selectedApi(api).apiVersion)">
                Scalar
              </button>
              <button class="nav-btn nav-btn-default" type="button" @click="openApi(selectedApi(api).name, 'api-details', selectedApi(api).apiVersion)">
                APIM
              </button>
              <button class="nav-btn nav-btn-swagger" type="button" @click="openApi(selectedApi(api).name, 'custom-apis-swagger', selectedApi(api).apiVersion)">
                Swagger
              </button>
            </div>
          </div>
        </div>

        <div v-else class="table-view">
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="api in pagedApis" :key="api.id" class="table-row">
                  <td class="api-cell">
                    <span class="api-name">{{ api.displayName }}</span>
                    <select
                      v-if="api.versions.length > 1"
                      v-model="selectedVersionIds[api.id]"
                      class="version-select"
                      aria-label="Seleccionar versión"
                      @change="refreshLayout"
                    >
                      <option v-for="version in api.versions" :key="version.id" :value="version.id">
                        {{ getVersionLabel(version) }}
                      </option>
                    </select>
                    <span v-else-if="selectedApi(api).apiVersion" class="single-version">
                      {{ getVersionLabel(selectedApi(api)) }}
                    </span>
                  </td>

                  <td class="description-cell">
                    <span v-if="selectedApi(api).description" v-html="sanitizeHtml(selectedApi(api).description)"></span>
                    <span v-else>-</span>
                  </td>

                  <td class="action-cell">
                    <div class="action-buttons">
                      <button class="nav-btn nav-btn-custom" type="button" @click="openApi(selectedApi(api).name, 'custom-api-details', selectedApi(api).apiVersion)">
                        Scalar
                      </button>
                      <button class="nav-btn nav-btn-default" type="button" @click="openApi(selectedApi(api).name, 'api-details', selectedApi(api).apiVersion)">
                        APIM
                      </button>
                      <button class="nav-btn nav-btn-swagger" type="button" @click="openApi(selectedApi(api).name, 'custom-apis-swagger', selectedApi(api).apiVersion)">
                        Swagger
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="totalPages > 1" class="pagination">
            <button
              class="pagination-btn"
              type="button"
              :disabled="currentPage === 1"
              aria-label="Página anterior"
              @click="goToPage(currentPage - 1)"
            >
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

              <span v-else-if="shouldShowEllipsis(page)" class="pagination-ellipsis">
                ...
              </span>
            </template>

            <button
              class="pagination-btn"
              type="button"
              :disabled="currentPage === totalPages"
              aria-label="Página siguiente"
              @click="goToPage(currentPage + 1)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
              </svg>
            </button>

            <span class="pagination-info">
              {{ paginationStart }}-{{ paginationEnd }} de {{ filteredApis.length }}
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
  groupApisByVersion,
  mapApi,
} from "@portdebarcelona/apim-core"
import type {ApiGroup, ApiItem, ViewMode} from "../../types"
import {openApi} from "../../utils/navigation"
import {injectParentStyles} from "../../utils/parentStyles"
import {resizeWidget} from "../../utils/resizeWidget"
import {sanitizeHtml} from "../../utils/sanitizeHtml"

const PAGE_SIZE = 6

const clientPromise = inject<Promise<ApimClient>>("clientPromise")

const apis = ref<ApiItem[]>([])
const loading = ref(true)
const error = ref("")
const search = ref("")
const viewMode = ref<ViewMode>("table")
const currentPage = ref(1)
const selectedVersionIds = ref<Record<string, string>>({})
let resizeObserver: ResizeObserver | null = null

const apiGroups = computed<ApiGroup[]>(() => {
  return groupApisByVersion(apis.value)
})

const filteredApis = computed(() => {
  const term = search.value.trim().toLowerCase()

  if (!term) {
    return apiGroups.value
  }

  return apiGroups.value.filter((api) =>
    api.displayName.toLowerCase().includes(term) ||
    api.versions.some((version) =>
      version.name.toLowerCase().includes(term) ||
      version.description.toLowerCase().includes(term) ||
      getVersionLabel(version).toLowerCase().includes(term),
    ),
  )
})

const totalPages = computed(() => Math.ceil(filteredApis.value.length / PAGE_SIZE))

const pagedApis = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredApis.value.slice(start, start + PAGE_SIZE)
})

const paginationStart = computed(() => {
  if (filteredApis.value.length === 0) {
    return 0
  }

  return (currentPage.value - 1) * PAGE_SIZE + 1
})

const paginationEnd = computed(() =>
  Math.min(currentPage.value * PAGE_SIZE, filteredApis.value.length),
)

function syncSelectedVersions(): void {
  const nextSelected = {...selectedVersionIds.value}

  apiGroups.value.forEach((group) => {
    if (!nextSelected[group.id] || !group.versions.some((version) => version.id === nextSelected[group.id])) {
      nextSelected[group.id] = getLatestApiVersion(group.versions)?.id || ""
    }
  })

  selectedVersionIds.value = nextSelected
}

function selectedApi(group: ApiGroup): ApiItem {
  return group.versions.find((version) => version.id === selectedVersionIds.value[group.id]) || group.versions[0]
}

function getLatestApiVersion(versions: ApiItem[]): ApiItem | undefined {
  return versions.slice().sort((a, b) => compareApiVersions(b, a))[0]
}

function getVersionLabel(api: ApiItem): string {
  return formatVersionLabel(api)
}

function refreshLayout(): void {
  nextTick(resizeWidget)
}

function clearSearch(): void {
  search.value = ""
}

function showTableView(): void {
  viewMode.value = "table"
}

function showCardsView(): void {
  viewMode.value = "cards"
}

function goToPage(page: number): void {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    nextTick(resizeWidget)
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

async function loadApis(): Promise<void> {
  if (!clientPromise) {
    error.value = "Error: no se pudo inicializar el contexto de APIM"
    loading.value = false
    return
  }

  try {
    const client = await clientPromise
    const items = (await client.listApis()).map(mapApi)

    items.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "es", {sensitivity: "base"}),
    )

    apis.value = items
    syncSelectedVersions()
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : String(exception)
    error.value = `Error: ${message}`
    console.error("Error loading APIs:", exception)
  } finally {
    loading.value = false
    nextTick(resizeWidget)
  }
}

watch([search, viewMode], () => {
  currentPage.value = 1
  nextTick(resizeWidget)
})

watch([apis, loading, filteredApis], () => {
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

  await loadApis()

  resizeObserver = new ResizeObserver(() => resizeWidget())
  resizeObserver.observe(document.body)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>
