<script setup lang="ts">
defineProps<{modelValue: string; placeholder?: string}>()
const emit = defineEmits<{"update:modelValue": [value: string]}>()
</script>

<template>
  <label class="search-container">
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
    <input
      type="text"
      class="search-input"
      :value="modelValue"
      :placeholder="placeholder || 'Buscar APIs...'"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button v-if="modelValue" class="search-clear" type="button" aria-label="Limpiar búsqueda" @click="emit('update:modelValue', '')">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
      </svg>
    </button>
  </label>
</template>
