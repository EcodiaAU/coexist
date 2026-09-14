import { defineConfig, devices } from '@playwright/test'
// Points the existing specs at the DEPLOYED app instead of the dev server, so a
// pass is evidence about production rather than about localhost. No webServer.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'https://app.coexistaus.org', trace: 'off', screenshot: 'only-on-failure' },
  projects: [{ name: 'mobile-safari', use: { ...devices['iPhone 14'] } }],
})
