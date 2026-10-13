<script setup lang="ts">
import {ref} from "vue"
import {docksPortalLinks} from "../../navigation/externalLinks"

const emit = defineEmits<{navigate: []}>()
const open = ref(false)

function close(): void {
  open.value = false
}

function closeAfterNavigation(): void {
  close()
  emit("navigate")
}

function closeAfterFocusLeaves(event: FocusEvent): void {
  const menu = event.currentTarget as HTMLElement
  requestAnimationFrame(() => {
    if (!menu.contains(document.activeElement)) close()
  })
}
</script>

<template>
  <div
    class="nav-dropdown"
    @mouseenter="open = true"
    @mouseleave="close"
    @focusout="closeAfterFocusLeaves"
    @keydown.esc="close"
  >
    <button
      class="nav-dropdown-trigger"
      type="button"
      aria-haspopup="menu"
      aria-controls="docks-links-menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      Enlaces DOCKS
      <span class="nav-dropdown-chevron" aria-hidden="true"></span>
    </button>

    <div id="docks-links-menu" v-show="open" class="nav-dropdown-menu" role="menu" aria-label="Enlaces DOCKS">
      <a
        v-for="link in docksPortalLinks"
        :key="link.href"
        :href="link.href"
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        @click="closeAfterNavigation"
      >
        {{ link.label }}
      </a>
    </div>
  </div>
</template>
