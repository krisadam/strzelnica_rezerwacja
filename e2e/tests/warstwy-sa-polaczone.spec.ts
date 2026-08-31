import { expect, test } from '@playwright/test'
import { PANEL_URL } from '../playwright.config.js'

// Jedyny test przeglądarkowy fazy F0: dowód, że produkcyjne buildy obu
// aplikacji dają się podać i uruchomić. Zastąpi go test przejścia całej
// ścieżki od kalendarza do potwierdzenia, kiedy ta ścieżka zaistnieje.
test('produkcyjne buildy Widgetu i Panelu uruchamiają się w przeglądarce', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Rezerwacja osi' })).toBeVisible()

  await page.goto(PANEL_URL)
  await expect(page.getByRole('heading', { name: 'Panel Strzelnicy' })).toBeVisible()
})
