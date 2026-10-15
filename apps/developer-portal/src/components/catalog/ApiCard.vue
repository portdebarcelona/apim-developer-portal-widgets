<script setup lang="ts">
import type {ApiGroup, ApiItem} from "@portdebarcelona/apim-core"
import ApiActions from "./ApiActions.vue"
import ApiVersionSelector from "./ApiVersionSelector.vue"

defineProps<{group: ApiGroup; selected: ApiItem}>()
const emit = defineEmits<{select: [id: string]}>()
</script>

<template>
  <article class="card">
    <div class="card-header">
      <span class="card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2 5 5h-5V4zM6 20V4h5v7h7v9H6z" /></svg>
      </span>
      <div class="card-info">
        <h3 class="card-title">{{ group.displayName }}</h3>
        <ApiVersionSelector :versions="group.versions" :model-value="selected.id" @update:model-value="emit('select', $event)" />
      </div>
    </div>
    <div class="card-body">
      <p class="card-description">{{ selected.description || "-" }}</p>
    </div>
    <div class="card-actions"><ApiActions :api="selected" /></div>
  </article>
</template>
