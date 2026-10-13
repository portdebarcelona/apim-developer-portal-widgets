import {createApp} from "vue"
import App from "./App.vue"
import {createPortalRouter} from "./router"
import {authKey, createAuthClient} from "./auth"
import {readRuntimeConfig} from "./config"
import "./styles/main.css"

const config = readRuntimeConfig()
const auth = createAuthClient(config)

await auth.initialize()

createApp(App)
  .provide(authKey, auth)
  .provide("runtimeConfig", config)
  .use(createPortalRouter())
  .mount("#app")
