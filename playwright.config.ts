import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 45000, expect: {timeout: 10000}, workers: 2,
  use: {browserName: 'chromium', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure'},
  projects: [
    {name: 'scalar', use: {baseURL: 'http://127.0.0.1:3173'}},
    {name: 'swagger', use: {baseURL: 'http://127.0.0.1:3174'}},
  ],
  webServer: [
    {command: 'npm run preview --workspace cw-api-documentation -- --host 127.0.0.1 --port 3173 --strictPort', url: 'http://127.0.0.1:3173', reuseExistingServer: false},
    {command: 'npm run preview --workspace cw-api-documentation-swagger -- --host 127.0.0.1 --port 3174 --strictPort', url: 'http://127.0.0.1:3174', reuseExistingServer: false},
  ],
});
