import { defineConfig, devices } from '@playwright/test'

export const WIDGET_URL = 'http://localhost:5173'
export const PANEL_URL = 'http://localhost:5174'

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WIDGET_URL,
    trace: 'on-first-retry',
  },
  // Oba buildy są statyczne, więc testy jadą przeciwko `vite preview` — tak,
  // jak wygląda produkcja, a nie przeciwko serwerowi deweloperskiemu.
  webServer: [
    {
      command: 'pnpm --filter @strzelnica/widget preview --port 5173 --strictPort',
      url: WIDGET_URL,
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @strzelnica/panel preview --port 5174 --strictPort',
      url: PANEL_URL,
      cwd: '..',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
