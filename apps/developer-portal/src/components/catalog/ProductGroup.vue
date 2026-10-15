<script setup lang="ts">
import {ref} from "vue"
import {compareApiVersions, type ApiGroup, type ApiItem, type ViewMode} from "@portdebarcelona/apim-core"
import type {ProductCatalog} from "../../api/contracts"
import ApiActions from "./ApiActions.vue"
import ApiVersionSelector from "./ApiVersionSelector.vue"

defineProps<{product: ProductCatalog; viewMode: ViewMode}>()
const expanded = ref(false)
const selections = ref<Record<string, string>>({})

function selected(group: ApiGroup): ApiItem {
  return group.versions.find((item) => item.id === selections.value[group.id]) ||
    group.versions.slice().sort((a, b) => compareApiVersions(b, a))[0]
}

function select(groupId: string, versionId: string): void {
  selections.value = {...selections.value, [groupId]: versionId}
}
</script>

<template>
  <template v-if="viewMode === 'table'">
    <tr class="table-row grouped-row" :class="{expanded}" @click="expanded = !expanded">
      <td class="expand-cell"><svg class="expand-icon" :class="{rotated: expanded}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg></td>
      <td class="product-cell"><span class="product-name">{{ product.displayName }}</span></td>
      <td class="status-cell">{{ product.description || "-" }}</td>
      <td class="apis-cell">{{ product.apiCount }}</td>
    </tr>
    <tr v-if="expanded" class="expanded-row">
      <td colspan="4">
        <div v-if="!product.apis.length" class="no-apis">No hay APIs disponibles para este producto</div>
        <div v-else class="apis-list">
          <div v-for="api in product.apis" :key="api.id" class="api-item">
            <svg class="api-icon-small" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2 5 5h-5V4zM6 20V4h5v7h7v9H6z" /></svg>
            <div class="item-details"><span class="api-name">{{ api.displayName }}</span><span class="item-description">{{ selected(api).description || "-" }}</span></div>
            <ApiVersionSelector :versions="api.versions" :model-value="selected(api).id" @click.stop @update:model-value="select(api.id, $event)" />
            <div class="item-actions"><ApiActions :api="selected(api)" /></div>
          </div>
        </div>
      </td>
    </tr>
  </template>

  <article v-else class="card product-card" :class="{'card-expanded': expanded}">
    <button class="card-header expandable-card-header" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <div class="card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 7h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 4h4v3h-4V4zm10 16H4V9h16v11z" /></svg></div>
      <div class="card-info"><h3 class="card-title">{{ product.displayName }}</h3><span class="card-count">{{ product.apiCount }} API{{ product.apiCount === 1 ? "" : "s" }}</span></div>
      <svg class="card-expand-icon" :class="{rotated: expanded}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" /></svg>
    </button>
    <div v-if="expanded" class="card-apis">
      <div v-if="!product.apis.length" class="card-no-apis">No hay APIs disponibles</div>
      <div v-for="api in product.apis" v-else :key="api.id" class="card-api-item">
        <svg class="api-icon-small" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2 5 5h-5V4zM6 20V4h5v7h7v9H6z" /></svg>
        <div class="item-details"><span class="api-name">{{ api.displayName }}</span><span class="item-description">{{ selected(api).description || "-" }}</span></div>
        <ApiVersionSelector :versions="api.versions" :model-value="selected(api).id" @update:model-value="select(api.id, $event)" />
        <div class="item-actions"><ApiActions :api="selected(api)" /></div>
      </div>
    </div>
  </article>
</template>
