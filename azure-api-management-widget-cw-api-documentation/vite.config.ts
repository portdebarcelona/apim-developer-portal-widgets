import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()], base: './', publicDir: 'static', resolve: {dedupe: ['vue']},
  server: {port: 3003, strictPort: true, fs: {allow: ['..']}},
  preview: {host: '127.0.0.1', cors: true},
  build: {outDir: 'dist', emptyOutDir: true, rollupOptions: {input: {index: 'index.html', editor: 'editor.html'}}},
});
