<script setup lang="ts">
const props = withDefaults(defineProps<{page: number; pageCount: number; total: number; pageSize?: number}>(), {pageSize: 6})
const emit = defineEmits<{change: [page: number]}>()

function showPage(value: number): boolean {
  return value === 1 || value === props.pageCount || Math.abs(value - props.page) <= 1
}

function showEllipsis(value: number): boolean {
  return (value === 2 && props.page > 3) || (value === props.pageCount - 1 && props.page < props.pageCount - 2)
}
</script>

<template>
  <nav v-if="pageCount > 1" class="pagination" aria-label="Paginación">
    <button class="pagination-btn" type="button" :disabled="page <= 1" aria-label="Página anterior" @click="emit('change', page - 1)">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
    </button>
    <template v-for="value in pageCount" :key="value">
      <button v-if="showPage(value)" class="pagination-btn" :class="{active: value === page}" type="button" @click="emit('change', value)">{{ value }}</button>
      <span v-else-if="showEllipsis(value)" class="pagination-ellipsis">...</span>
    </template>
    <button class="pagination-btn" type="button" :disabled="page >= pageCount" aria-label="Página siguiente" @click="emit('change', page + 1)">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" /></svg>
    </button>
    <span class="pagination-info">{{ (page - 1) * pageSize + 1 }}-{{ Math.min(page * pageSize, total) }} de {{ total }}</span>
  </nav>
</template>
