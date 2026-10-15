import {createApp} from "vue"
import {askForSecrets} from "@azure/api-management-custom-widgets-tools"
import {createWidgetClient} from "@portdebarcelona/apim-core"
import App from "./components/app/index.vue"

const secretsPromise = askForSecrets("app")
const clientPromise = secretsPromise.then(createWidgetClient)

const app = createApp(App)
  .provide("secretsPromise", secretsPromise)
  .provide("clientPromise", clientPromise)

app.mount("#root")
