<script setup lang="ts">
import type {ApiGroup, ApiItem} from "@portdebarcelona/apim-core"
import ApiActions from "./ApiActions.vue"
import ApiVersionSelector from "./ApiVersionSelector.vue"

defineProps<{groups: ApiGroup[]; selectedVersions: Record<string, ApiItem>}>()
const emit = defineEmits<{select: [groupId: string, versionId: string]}>()
</script>

<template>
  <div class="table-container">
    <table class="data-table api-list-table">
      <thead><tr><th>Nombre</th><th>Descripción</th><th></th></tr></thead>
      <tbody>
        <tr v-for="group in groups" :key="group.id" class="table-row">
          <td class="api-cell">
            <strong class="api-name">{{ group.displayName }}</strong>
            <ApiVersionSelector
              :versions="group.versions"
              :model-value="selectedVersions[group.id].id"
              @update:model-value="emit('select', group.id, $event)"
            />
          </td>
          <td class="description-cell">{{ selectedVersions[group.id].description || "-" }}</td>
          <td class="action-cell"><ApiActions :api="selectedVersions[group.id]" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
