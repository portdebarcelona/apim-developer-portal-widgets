<script setup lang="ts">
import type {ApiItem} from "@portdebarcelona/apim-core"
import {formatVersionLabel} from "@portdebarcelona/apim-core"

defineProps<{versions: ApiItem[]; modelValue: string}>()
const emit = defineEmits<{"update:modelValue": [value: string]}>()
</script>

<template>
  <select
    v-if="versions.length > 1"
    class="version-select"
    :value="modelValue"
    aria-label="Seleccionar versión"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="version in versions" :key="version.id" :value="version.id">
      {{ formatVersionLabel(version) }}
    </option>
  </select>
  <span v-else-if="versions[0]?.apiVersion || versions[0]?.apiRevision" class="single-version">
    {{ formatVersionLabel(versions[0]) }}
  </span>
</template>
