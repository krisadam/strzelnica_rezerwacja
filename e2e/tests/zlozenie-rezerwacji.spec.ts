import { expect, test } from '@playwright/test'
import {
  czasBloku,
  otworzWidget,
  OS_PISTOLETOWA,
  pierwszyWolnyBlok,
  wypelnijFormularz,
  zadeklarujPozwolenie,
  ZIMNY_START_MS,
} from './pomocniki.js'

// Przejście całej ścieżki — raz, jako dowód że warstwy są połączone: kalendarz
// czyta grafik z bazy, formularz pyta o zastrzeżenia tę samą czystą funkcję co
// serwer, zapis idzie przez Edge Function, a zajętość wraca do kalendarza.
// Reguły dostępności i walidacji są pokryte w `packages/shared` i nie są tutaj
// sprawdzane po raz drugi.
test('od kalendarza do potwierdzenia i z powrotem, już bez tego terminu', async ({ page }) => {
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)

  const blok = await pierwszyWolnyBlok(page, OS_PISTOLETOWA)
  const czas = await czasBloku(blok)
  await blok.click()

  await expect(page.getByRole('heading', { name: 'Twoja Rezerwacja' })).toBeVisible()
  // Wybrany termin towarzyszy Osobie rezerwującej na każdym kroku.
  await expect(page.getByText(czas)).toBeVisible()

  await wypelnijFormularz(page, {
    uczestnicy: 2,
    imie: 'Anna Kowalska',
    email: 'anna@example.pl',
    telefon: '600100200',
    // Wypożyczenie jedzie razem z Rezerwacją jako pozycja tego samego zapisu —
    // to jedyne, czego czysta funkcja z definicji nie zobaczy. Ile sztuk wolno
    // wziąć, rozstrzyga się w `packages/shared` i nie jest tu sprawdzane.
    bron: { typ: 'Glock 17', sztuki: 1 },
  })

  await expect(page.getByText('Anna Kowalska')).toBeVisible()
  await expect(page.getByText('Glock 17 — 1 szt.')).toBeVisible()
  await expect(page.getByText(czas)).toBeVisible()

  await page.getByRole('button', { name: 'Rezerwuję' }).click()

  await expect(page.getByRole('heading', { name: 'Termin jest Twój' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Kalendarz wraca tam, gdzie go zostawiono — z Blokiem już zajętym.
  await page.getByRole('button', { name: 'Wróć do kalendarza' }).click()
  const pozycja = page.locator('.blok', { hasText: czas })
  await expect(pozycja).toHaveClass(/blok--niedostepny/)
  await expect(pozycja).toContainText('termin już zajęty')
})
