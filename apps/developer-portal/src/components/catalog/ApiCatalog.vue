<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {compareApiVersions, type ApiGroup, type ApiItem, type ViewMode} from "@portdebarcelona/apim-core"
import ApiCard from "./ApiCard.vue"
import ApiTable from "./ApiTable.vue"
import Pagination from "./Pagination.vue"
import SearchBox from "./SearchBox.vue"

const props = withDefaults(defineProps<{groups: ApiGroup[]; pageSize?: number}>(), {pageSize: 6})
const search = ref("")
const page = ref(1)
const viewMode = ref<ViewMode>("table")
const selections = ref<Record<string, string>>({})

const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase("es")
  if (!term) return props.groups
  return props.groups.filter((group) =>
    group.displayName.toLocaleLowerCase("es").includes(term) ||
    group.versions.some((api) => [api.name, api.description, api.apiVersion, ...(api.tags || [])]
      .some((value) => value.toLocaleLowerCase("es").includes(term))),
  )
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / props.pageSize)))
const paged = computed(() => filtered.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize))
const selectedVersions = computed<Record<string, ApiItem>>(() => Object.fromEntries(
  props.groups.map((group) => [group.id, group.versions.find((item) => item.id === selections.value[group.id]) || latest(group)]),
))

function latest(group: ApiGroup): ApiItem {
  return group.versions.slice().sort((a, b) => compareApiVersions(b, a))[0]
}

function select(groupId: string, versionId: string): void {
  selections.value = {...selections.value, [groupId]: versionId}
}

watch([search, viewMode], () => { page.value = 1 })
watch(pageCount, (count) => { if (page.value > count) page.value = count })
</script>

<template>
  <section class="catalog">
    <div class="toolbar">
      <SearchBox v-model="search" />
      <div class="view-toggle" aria-label="Modo de vista">
        <button class="toggle-btn" type="button" :class="{active: viewMode === 'table'}" title="Vista de tabla" aria-label="Vista de tabla" @click="viewMode = 'table'">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5v14h18V5H3zm4 2v2H5V7h2zm-2 6v-2h2v2H5zm0 2h2v2H5v-2zm14 2H9v-2h10v2zm0-4H9v-2h10v2zm0-4H9V7h10v2z" /></svg>
        </button>
        <button class="toggle-btn" type="button" :class="{active: viewMode === 'cards'}" title="Vista de tarjetas" aria-label="Vista de tarjetas" @click="viewMode = 'cards'">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 5v13h17V5H4zm10 2v3h-3V7h3zM6 7h3v3H6V7zm0 9v-3h3v3H6zm5 0v-3h3v3h-3zm8 0h-3v-3h3v3zm0-5h-3V7h3v3z" /></svg>
        </button>
      </div>
    </div>
    <p v-if="filtered.length === 0" class="no-results">No se encontraron resultados para "{{ search }}"</p>
    <div v-else-if="viewMode === 'cards'" class="cards-grid">
      <ApiCard
        v-for="group in filtered"
        :key="group.id"
        :group="group"
        :selected="selectedVersions[group.id]"
        @select="select(group.id, $event)"
      />
    </div>
    <ApiTable v-else :groups="paged" :selected-versions="selectedVersions" @select="select" />
    <Pagination v-if="viewMode === 'table'" :page="page" :page-count="pageCount" :total="filtered.length" :page-size="pageSize" @change="page = $event" />
  </section>
</template>
