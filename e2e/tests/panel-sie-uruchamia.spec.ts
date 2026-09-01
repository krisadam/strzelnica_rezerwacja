import { expect, test } from '@playwright/test'
import { PANEL_URL } from '../playwright.config.js'

// Reszta testu fazy F0 („produkcyjne buildy Widgetu i Panelu uruchamiają się"):
// część o Widgecie zastąpiło przejście całej ścieżki, część o Panelu nie ma
// jeszcze czym. Zostaje do czasu logowania i podglądu Rezerwacji (ticket #13),
// który obejmie Panel własnymi testami.
test('produkcyjny build Panelu uruchamia się w przeglądarce', async ({ page }) => {
  await page.goto(PANEL_URL)
  await expect(page.getByRole('heading', { name: 'Panel Strzelnicy' })).toBeVisible()
})
