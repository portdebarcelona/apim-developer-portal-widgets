import {createApp} from "vue"
import {askForSecrets} from "@azure/api-management-custom-widgets-tools"
import App from "./components/app/index.vue"

const secretsPromise = askForSecrets("app")
const requestPromise = new Promise(async (resolve) => {
  const secrets = await secretsPromise
  resolve((url: string) => {
    const requestUrl = new URL(
      /^https?:\/\//i.test(url) ? url : `${secrets.managementApiUrl}${url}`,
    )

    if (!requestUrl.searchParams.has("api-version")) {
      requestUrl.searchParams.set("api-version", secrets.apiVersion)
    }

    return fetch(
      requestUrl.toString(),
      secrets.token ? {headers: {Authorization: secrets.token}} : undefined,
    )
  })
})

const app = createApp(App)
  .provide("secretsPromise", secretsPromise)
  .provide("requestPromise", requestPromise)

app.mount("#root")
