<script setup lang="ts">
import {computed, inject} from "vue"
import type {ApiItem} from "@portdebarcelona/apim-core"
import type {PortalRuntimeConfig} from "../../config"
import {buildDocumentationHref, buildManagedPortalApiDetailsUrl} from "../../documentation/navigation"

const props = defineProps<{api: ApiItem; operationId?: string}>()
const runtimeConfig = inject<PortalRuntimeConfig>("runtimeConfig")!
const scalarUrl = computed(() => buildDocumentationHref("scalar", props.api))
const swaggerUrl = computed(() => buildDocumentationHref("swagger", props.api))
const apimUrl = computed(() => buildManagedPortalApiDetailsUrl(
  runtimeConfig.managedPortalUrl,
  props.api,
  props.operationId,
))
</script>

<template>
  <div class="action-buttons">
    <a class="nav-btn nav-btn-custom" :href="scalarUrl" target="_blank" rel="noopener noreferrer">Scalar</a>
    <a class="nav-btn nav-btn-default" :href="apimUrl" target="_blank" rel="noopener noreferrer">APIM</a>
    <a class="nav-btn nav-btn-swagger" :href="swaggerUrl" target="_blank" rel="noopener noreferrer">Swagger</a>
  </div>
</template>
