import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue(), {
    name: 'swagger-pkce-buffer-interop', enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/swagger-ui-react/swagger-ui-es-bundle-core.js')) return;
      // swagger-ui-react 5.35.1 calls this CommonJS export while calculating
      // SHA-256 for PKCE. Its namespace import is an object, not a function.
      const namespaceImport = /import\*as (\w+) from"to-buffer";/;
      if (!namespaceImport.test(code)) throw new Error('Revisar compatibilidad PKCE tras actualizar Swagger UI.');
      return {code: code.replace(namespaceImport, 'import $1 from"to-buffer";'), map: null};
    },
  }], base: './', publicDir: 'static', resolve: {dedupe: ['vue']},
  server: {port: 3004, strictPort: true, fs: {allow: ['..']}},
  preview: {host: '127.0.0.1', cors: true},
  build: {outDir: 'dist', emptyOutDir: true, rollupOptions: {input: {index: 'index.html', editor: 'editor.html'}}},
});
