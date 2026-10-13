import {createRouter, createWebHistory, type Router} from "vue-router"
import HomeView from "./views/HomeView.vue"
import SignInView from "./views/SignInView.vue"
import ApisView from "./views/ApisView.vue"
import ApplicationsView from "./views/ApplicationsView.vue"
import TeamsView from "./views/TeamsView.vue"

export function createPortalRouter(): Router {
  return createRouter({
    history: createWebHistory(),
    routes: [
      {path: "/", component: HomeView},
      {path: "/signin", component: SignInView},
      {path: "/apis", component: ApisView},
      {path: "/applications", component: ApplicationsView},
      {path: "/teams", component: TeamsView},
      {path: "/api/:apiId/scalar", name: "api-scalar", component: () => import("./views/ScalarView.vue")},
      {path: "/api/:apiId/swagger", name: "api-swagger", component: () => import("./views/SwaggerView.vue")},
      {path: "/oauth2/scalar-callback", name: "scalar-oauth-callback", component: () => import("./views/OAuthCallbackView.vue")},
    ],
    scrollBehavior: () => ({top: 0}),
  })
}
