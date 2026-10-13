import {defineConfig, loadEnv} from "vite";
import vue from '@vitejs/plugin-vue';
import target from "../config/apim-target.json";

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, "..", "")

  return ({
  plugins: [vue()],
  base: "",
  envDir: "..",
  server: {
	"port": 3000,
	"open": `${env.VITE_APIM_PORTAL_URL || target.portalUrl}?MS_APIM_CW_localhost_port=3000`
},
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: "./index.html",
        editor: "./editor.html",
      },
    },
  },
  publicDir: "static",
})})
