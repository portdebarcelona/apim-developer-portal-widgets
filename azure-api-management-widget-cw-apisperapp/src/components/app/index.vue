<style src="../../styles/app.scss"></style>

<template>
  <div class="applications-catalog">
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
        <span>Cargando APIs...</span>
      </div>

      <div v-else-if="error" class="error-panel">
        <span class="error-icon" aria-hidden="true">!</span>
        {{ error }}
      </div>

      <div v-else-if="groupRows.length === 0" class="no-data">
        <span class="empty-icon" aria-hidden="true">[]</span>
        <p>No se encontraron APIs</p>
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
              placeholder="Buscar aplicaciones o APIs..."
              aria-label="Buscar aplicaciones o APIs"
            />

            <button v-if="search" class="search-clear" type="button" aria-label="Limpiar búsqueda" @click="clearSearch">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>

          <div class="view-toggle">
            <button class="toggle-btn" :class="{ active: viewMode === 'table' }" type="button" title="Vista de tabla" aria-label="Vista de tabla" @click="showTableView">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 5v14h18V5H3zm4 2v2H5V7h2zm-2 6v-2h2v2H5zm0 2h2v2H5v-2zm14 2H9v-2h10v2zm0-4H9v-2h10v2zm0-4H9V7h10v2z" />
              </svg>
            </button>
            <button class="toggle-btn" :class="{ active: viewMode === 'cards' }" type="button" title="Vista de tarjetas" aria-label="Vista de tarjetas" @click="showCardsView">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4 5v13h17V5H4zm10 2v3h-3V7h3zM6 7h3v3H6V7zm0 9v-3h3v3H6zm5 0v-3h3v3h-3zm8 0h-3v-3h3v3zm0-5h-3V7h3v3z" />
              </svg>
            </button>
          </div>
        </div>

        <div v-if="filteredRows.length === 0" class="no-results">
          No se encontraron resultados para "{{ search }}"
        </div>

        <div v-else-if="viewMode === 'cards'" class="cards-grid">
          <div v-for="row in filteredRows" :key="row.name" class="card">
            <div class="card-header">
              <div class="card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 7h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 4h4v3h-4V4zm10 16H4V9h16v11z" />
                </svg>
              </div>
              <div class="card-info">
                <h3 class="card-title">{{ row.name }}</h3>
                <span class="card-count">{{ getApiCountText(row.apiCount) }}</span>
              </div>
            </div>

            <div class="card-body">
              <div v-for="api in row.apis" :key="api.id" class="card-item">
                <div class="item-main">
                  <svg class="api-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2 5 5h-5V4zM6 20V4h5v7h7v9H6z" />
                  </svg>
                  <div class="item-details">
                    <span class="item-name">{{ api.displayName }}</span>
                    <span class="item-description">{{ selectedApiVersion(api).description || "-" }}</span>
                  </div>
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
                  <span v-else-if="shouldShowVersion(api)" class="item-version-label">{{ getVersionLabel(selectedApiVersion(api)) }}</span>
                </div>
                <div class="item-actions">
                  <button class="nav-btn nav-btn-custom" type="button" @click="openApi(selectedApiVersion(api).name, 'custom-api-details', selectedApiVersion(api).label)">Scalar</button>
                  <button class="nav-btn nav-btn-default" type="button" @click="openApi(selectedApiVersion(api).name, 'api-details', selectedApiVersion(api).label)">APIM</button>
                  <button class="nav-btn nav-btn-swagger" type="button" @click="openApi(selectedApiVersion(api).name, 'custom-apis-swagger', selectedApiVersion(api).label)">Swagger</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="table-view">
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="expand-col"></th>
                  <th>Aplicación</th>
                  <th>APIs</th>
                </tr>
              </thead>

              <tbody>
                <template v-for="row in pagedRows" :key="row.name">
                  <tr class="table-row" :class="{ expanded: isExpanded(row) }" @click="toggleApp(row.name)">
                    <td class="expand-cell">
                      <svg class="expand-icon" :class="{ rotated: isExpanded(row) }" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                      </svg>
                    </td>
                    <td class="app-cell">
                      <span class="app-name">{{ row.name }}</span>
                    </td>
                    <td class="count-cell">{{ getApiCountText(row.apiCount) }}</td>
                  </tr>

                  <tr v-if="isExpanded(row)" class="expanded-row">
                    <td colspan="3">
                      <div class="apis-list">
                        <div v-for="api in row.apis" :key="api.id" class="api-item">
                          <svg class="api-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2 5 5h-5V4zM6 20V4h5v7h7v9H6z" />
                          </svg>
                          <div class="item-details">
                            <span class="api-name">{{ api.displayName }}</span>
                            <span class="item-description">{{ selectedApiVersion(api).description || "-" }}</span>
                          </div>
                          <select
                            v-if="api.versions.length > 1"
                            v-model="selectedVersionIds[api.id]"
                            class="version-select"
                            aria-label="Seleccionar versión"
                            @click.stop
                            @change="refreshLayout"
                          >
                            <option v-for="version in api.versions" :key="version.id" :value="version.id">
                              {{ getVersionLabel(version) }}
                            </option>
                          </select>
                          <span v-else-if="shouldShowVersion(api)" class="item-version-label">{{ getVersionLabel(selectedApiVersion(api)) }}</span>
                          <div class="item-actions">
                            <button class="nav-btn nav-btn-custom" type="button" @click.stop="openApi(selectedApiVersion(api).name, 'custom-api-details', selectedApiVersion(api).label)">Scalar</button>
                            <button class="nav-btn nav-btn-default" type="button" @click.stop="openApi(selectedApiVersion(api).name, 'api-details', selectedApiVersion(api).label)">APIM</button>
                            <button class="nav-btn nav-btn-swagger" type="button" @click.stop="openApi(selectedApiVersion(api).name, 'custom-apis-swagger', selectedApiVersion(api).label)">Swagger</button>
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
              <button v-if="shouldShowPage(page)" class="pagination-btn" :class="{ active: page === currentPage }" type="button" @click="goToPage(page)">
                {{ page }}
              </button>
              <span v-else-if="shouldShowEllipsis(page)" class="pagination-ellipsis">...</span>
            </template>

            <button class="pagination-btn" type="button" :disabled="currentPage === totalPages" aria-label="Página siguiente" @click="goToPage(currentPage + 1)">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
              </svg>
            </button>

            <span class="pagination-info">{{ paginationStart }}-{{ paginationEnd }} de {{ filteredRows.length }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, inject, nextTick, onMounted, onUnmounted, ref, watch} from "vue"
import {ApimClient} from "@portdebarcelona/apim-core"
import type {
  ApimApiRaw,
  ApplicationApiItem,
  ApplicationApiVersion,
  ApplicationGroups,
  ApplicationGroupRow,
  ViewMode,
} from "../../types"
import {openApi} from "../../utils/navigation"
import {injectParentStyles} from "../../utils/parentStyles"
import {resizeWidget} from "../../utils/resizeWidget"

const CACHE_KEY = "apim-widget-cache-v4"
const CACHE_TTL = 5 * 60 * 1000
const CONCURRENCY = 30
const PAGE_SIZE = 6

const clientPromise = inject<Promise<ApimClient>>("clientPromise")

const groups = ref<ApplicationGroups>({})
const loading = ref(true)
const error = ref("")
const search = ref("")
const viewMode = ref<ViewMode>("table")
const currentPage = ref(1)
const expandedAppName = ref<string | null>(null)
const selectedVersionIds = ref<Record<string, string>>({})
let resizeObserver: ResizeObserver | null = null

const filteredGroups = computed<ApplicationGroups>(() => {
  const term = search.value.trim().toLowerCase()

  if (!term) {
    return groups.value
  }

  const filtered: ApplicationGroups = {}

  Object.entries(groups.value).forEach(([appName, apis]) => {
    const appMatches = appName.toLowerCase().includes(term)

    if (appMatches) {
      filtered[appName] = apis
      return
    }

    const matchedApis = apis.filter((api) =>
      api.displayName.toLowerCase().includes(term) ||
      api.versions.some((version) =>
        version.name.toLowerCase().includes(term) ||
        version.label.toLowerCase().includes(term) ||
        version.description.toLowerCase().includes(term),
      ),
    )

    if (matchedApis.length > 0) {
      filtered[appName] = matchedApis
    }
  })

  return filtered
})

const groupRows = computed<ApplicationGroupRow[]>(() => toRows(groups.value))
const filteredRows = computed<ApplicationGroupRow[]>(() => toRows(filteredGroups.value))
const totalPages = computed(() => Math.ceil(filteredRows.value.length / PAGE_SIZE))

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredRows.value.slice(start, start + PAGE_SIZE)
})

const paginationStart = computed(() => {
  if (filteredRows.value.length === 0) {
    return 0
  }

  return (currentPage.value - 1) * PAGE_SIZE + 1
})

const paginationEnd = computed(() =>
  Math.min(currentPage.value * PAGE_SIZE, filteredRows.value.length),
)

function toRows(source: ApplicationGroups): ApplicationGroupRow[] {
  return Object.entries(source)
    .map(([name, apis]) => ({
      name,
      apis,
      apiCount: apis.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", {sensitivity: "base"}))
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

function isExpanded(row: ApplicationGroupRow): boolean {
  return expandedAppName.value === row.name
}

function toggleApp(appName: string): void {
  expandedAppName.value = expandedAppName.value === appName ? null : appName
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

function getApiCountText(count: number): string {
  return `${count} API${count !== 1 ? "s" : ""}`
}

function shouldShowVersion(api: ApplicationApiItem): boolean {
  const version = selectedApiVersion(api)
  return Boolean(version.label && version.label !== "default")
}

function getApiGroupKey(api: ApimApiRaw): string {
  const properties = api.properties || {}
  return properties.apiVersionSetId || properties.displayName || api.name
}

function getApiDisplayName(api: ApimApiRaw): string {
  return api.properties?.displayName || api.name
}

function getApiVersionLabel(api: ApimApiRaw): string {
  const properties = api.properties || {}
  return properties.apiVersion || properties.apiRevision || "default"
}

function compareVersionDesc(a: {label: string}, b: {label: string}): number {
  return b.label.localeCompare(a.label, "es", {
    numeric: true,
    sensitivity: "base",
  })
}

function getApiVersion(api: ApimApiRaw): ApplicationApiVersion {
  return {
    id: api.id || api.name,
    name: api.name,
    label: getApiVersionLabel(api),
    description: api.properties?.description || "",
  }
}

function getVersionLabel(version: ApplicationApiVersion): string {
  if (!version.label || version.label === "default") {
    return "v1"
  }

  return version.label.trim().toLowerCase().startsWith("v") ? version.label : `v${version.label}`
}

function selectedApiVersion(api: ApplicationApiItem): ApplicationApiVersion {
  return api.versions.find((version) => version.id === selectedVersionIds.value[api.id]) || api.versions[0]
}

function getLatestVersion(versions: ApplicationApiVersion[]): ApplicationApiVersion | undefined {
  return versions.slice().sort((a, b) =>
    compareVersionDesc({label: a.label}, {label: b.label}),
  )[0]
}

function refreshLayout(): void {
  nextTick(resizeWidget)
}

function syncSelectedVersions(nextGroups: ApplicationGroups): void {
  const nextSelected = {...selectedVersionIds.value}

  Object.values(nextGroups).forEach((apis) => {
    apis.forEach((api) => {
      if (!nextSelected[api.id] || !api.versions.some((version) => version.id === nextSelected[api.id])) {
        nextSelected[api.id] = getLatestVersion(api.versions)?.id || ""
      }
    })
  })

  selectedVersionIds.value = nextSelected
}

function finalizeGroups(source: Record<string, Map<string, ApplicationApiItem>>): ApplicationGroups {
  return Object.fromEntries(
    Object.entries(source).map(([appName, apiMap]) => {
      const apis = Array.from(apiMap.values())
        .map((api) => ({
          ...api,
          versions: api.versions.slice().sort((a, b) => compareVersionDesc({label: a.label}, {label: b.label})),
        }))
        .sort((a, b) =>
          a.displayName.localeCompare(b.displayName, "es", {sensitivity: "base"}),
        )

      return [appName, apis]
    }),
  )
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let index = 0

  const workers = Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (index < items.length) {
      const currentIndex = index++
      await worker(items[currentIndex], currentIndex)
    }
  })

  await Promise.all(workers)
}

function readCache(): ApplicationGroups | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (!cached) {
      return null
    }

    const parsed = JSON.parse(cached) as {data?: {groups?: ApplicationGroups}; ts?: number}
    if (!parsed.ts || Date.now() - parsed.ts >= CACHE_TTL) {
      return null
    }

    return parsed.data?.groups || null
  } catch {
    return null
  }
}

function writeCache(nextGroups: ApplicationGroups): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data: {groups: nextGroups},
      ts: Date.now(),
    }))
  } catch {
    // Ignore storage restrictions.
  }
}

async function loadTagsForApi(client: ApimClient, api: ApimApiRaw): Promise<string[]> {
  try {
    const tags = await client.listApiTags(api.name)

    return tags
      .map((tag) => tag.properties?.displayName || tag.name || "")
      .filter((tagName) => tagName.startsWith("app:"))
      .map((tagName) => tagName.slice(4))
      .filter(Boolean)
  } catch (exception) {
    console.warn(`Error loading tags for API ${api.name}:`, exception)
    return []
  }
}

async function loadApis(): Promise<void> {
  const cachedGroups = readCache()
  if (cachedGroups) {
    groups.value = cachedGroups
    syncSelectedVersions(cachedGroups)
    loading.value = false
    nextTick(resizeWidget)
    return
  }

  if (!clientPromise) {
    error.value = "Error: no se pudo inicializar el contexto de APIM"
    loading.value = false
    return
  }

  try {
    const client = await clientPromise
    const allApis = await client.listApis()
    const groupsMap: Record<string, Map<string, ApplicationApiItem>> = {}

    await runWithConcurrency(allApis, CONCURRENCY, async (api) => {
      const appNames = await loadTagsForApi(client, api)
      const groupKey = getApiGroupKey(api)
      const displayName = getApiDisplayName(api)
      const version = getApiVersion(api)

      appNames.forEach((appName) => {
        if (!groupsMap[appName]) {
          groupsMap[appName] = new Map<string, ApplicationApiItem>()
        }

        const existingApi = groupsMap[appName].get(groupKey)

        if (existingApi) {
          if (!existingApi.versions.some((existingVersion) => existingVersion.id === version.id)) {
            existingApi.versions.push(version)
          }
        } else {
          groupsMap[appName].set(groupKey, {
            id: `${appName}-${groupKey}`,
            groupKey,
            displayName,
            versions: [version],
          })
        }
      })

      const partialGroups = finalizeGroups(groupsMap)
      if (Object.keys(partialGroups).length > 0) {
        groups.value = partialGroups
        syncSelectedVersions(partialGroups)
        loading.value = false
        nextTick(resizeWidget)
      }
    })

    const finalGroups = finalizeGroups(groupsMap)
    groups.value = finalGroups
    syncSelectedVersions(finalGroups)
    writeCache(finalGroups)
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
  expandedAppName.value = null
  nextTick(resizeWidget)
})

watch(currentPage, () => {
  expandedAppName.value = null
  nextTick(resizeWidget)
})

watch([groups, loading], () => {
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

  const observedElement = document.getElementById("app-content") || document.body
  resizeObserver = new ResizeObserver(() => resizeWidget())
  resizeObserver.observe(observedElement)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>
