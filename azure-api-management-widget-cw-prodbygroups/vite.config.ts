import {defineConfig} from "vite";
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [vue()],
  base: "",
  server: {
	"port": 3000,
	"open": "https://apbapipre.developer.azure-api.net/?MS_APIM_CW_localhost_port=3000"
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
}))
