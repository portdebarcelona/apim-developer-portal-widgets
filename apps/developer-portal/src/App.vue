<script setup lang="ts">
import {computed, onBeforeUnmount, provide, ref} from "vue"
import {RouterLink, RouterView, useRoute} from "vue-router"
import {useAuth} from "./auth"
import {portalSessionKey} from "./auth/session"
import DocksLinksMenu from "./components/navigation/DocksLinksMenu.vue"
import SignInView from "./views/SignInView.vue"

const auth = useAuth()
const route = useRoute()
const account = ref(auth.account())
const menuOpen = ref(false)
const stopAccountSync = auth.onAccountChanged((updatedAccount) => {
  account.value = updatedAccount
})

onBeforeUnmount(stopAccountSync)

async function signIn(): Promise<void> {
  await auth.login()
  account.value = auth.account()
  menuOpen.value = false
}

async function signOut(): Promise<void> {
  await auth.logout()
  account.value = null
  menuOpen.value = false
}

provide(portalSessionKey, {account, signIn, signOut})

const protectedRoute = computed(() => !["/", "/signin"].includes(route.path))
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <div class="header-inner">
        <RouterLink class="brand" to="/" aria-label="Port de Barcelona">
          <img src="/assets/Logo.png" width="160" height="38" alt="Port de Barcelona" />
        </RouterLink>

        <button
          class="menu-toggle"
          type="button"
          :aria-expanded="menuOpen"
          aria-controls="main-navigation"
          aria-label="Abrir o cerrar navegación"
          @click="menuOpen = !menuOpen"
        >
          <span></span><span></span><span></span>
        </button>

        <div v-if="menuOpen" class="navigation-scrim" aria-hidden="true" @click="menuOpen = false"></div>
        <nav id="main-navigation" class="main-nav" :class="{open: menuOpen}" aria-label="Navegación principal">
          <button class="menu-close" type="button" aria-label="Cerrar navegación" @click="menuOpen = false">×</button>
          <RouterLink to="/" @click="menuOpen = false">Inicio</RouterLink>
          <template v-if="account">
            <RouterLink to="/applications" @click="menuOpen = false">Apis por Aplicación</RouterLink>
            <RouterLink to="/teams" @click="menuOpen = false">Apis por Equipo</RouterLink>
            <RouterLink to="/apis" @click="menuOpen = false">APIs</RouterLink>
            <DocksLinksMenu @navigate="menuOpen = false" />
            <button class="nav-session-button" type="button" @click="signOut">Salir</button>
          </template>
          <RouterLink v-else to="/signin" @click="menuOpen = false">Acceder</RouterLink>
        </nav>
      </div>
    </header>

    <main class="site-main">
      <SignInView v-if="!account && protectedRoute" />
      <RouterView v-else />
    </main>

    <footer class="site-footer"></footer>
  </div>
</template>
