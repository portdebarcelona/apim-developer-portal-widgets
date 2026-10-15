<script setup lang="ts">
import {ref} from "vue"
import {useRouter} from "vue-router"
import {usePortalSession} from "../auth/session"

const session = usePortalSession()
const router = useRouter()
const busy = ref(false)
const error = ref("")

async function signIn(): Promise<void> {
  busy.value = true
  error.value = ""
  try {
    await session.signIn()
    await router.push("/")
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "No se pudo iniciar sesión."
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="signin-page" aria-labelledby="signin-title">
    <h1 id="signin-title">Acceder al Portal</h1>
    <div class="signin-content">
      <button class="entra-signin-button" type="button" :disabled="busy" @click="signIn">
        <span class="entra-mark" aria-hidden="true">◇</span>
        {{ busy ? "Iniciando sesión…" : "Iniciar sesión con Microsoft Entra ID" }}
      </button>
      <p class="signin-supporting"><em>Acceso exclusivo para usuarios corporativos autorizados.</em></p>
      <p class="signin-help"><em>Si no tienes acceso, solicita el alta a través de nuestro formulario de soporte.</em></p>
      <button class="request-access-button" type="button">Solicitar acceso</button>
      <p v-if="error" class="signin-error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
