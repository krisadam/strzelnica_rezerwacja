import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  otworzWidget,
  OS_KARABINOWA,
  pierwszyWolnyBlok,
  wypelnijFormularz,
  zadeklarujPozwolenie,
  ZIMNY_START_MS,
} from './pomocniki.js'

// Wyścig o ten sam Blok. To własność transakcji, nie logiki: obie strony pytają
// o dostępność, obie dostają „wolny" i obie wysyłają zgłoszenie. Rozstrzyga
// dopiero ograniczenie wyłączności Osi w bazie — czego czysta funkcja
// z definicji nie widzi.
//
// Osobna Oś, żeby test przejścia całej ścieżki nie zabrał Bloku sprzed nosa.

async function doPodsumowania(page: Page, imie: string): Promise<void> {
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  const blok = await pierwszyWolnyBlok(page, OS_KARABINOWA)
  await blok.click()
  await wypelnijFormularz(page, {
    uczestnicy: 2,
    imie,
    email: `${imie.toLowerCase()}@example.pl`,
    telefon: '600100200',
  })
}

test('dwa zgłoszenia na ten sam Blok — dokładnie jedno wygrywa', async ({ browser }) => {
  const pierwszy = await browser.newContext()
  const drugi = await browser.newContext()
  const anna = await pierwszy.newPage()
  const borys = await drugi.newPage()

  // Obie strony dochodzą do podsumowania, zanim którakolwiek wyśle — inaczej
  // druga zobaczyłaby Blok już zajęty i nie byłoby żadnego wyścigu.
  await doPodsumowania(anna, 'Anna')
  await doPodsumowania(borys, 'Borys')

  await Promise.all([
    anna.getByRole('button', { name: 'Rezerwuję' }).click(),
    borys.getByRole('button', { name: 'Rezerwuję' }).click(),
  ])

  const potwierdzenie = (page: Page) =>
    page.getByRole('heading', { name: 'Termin jest Twój' })
  const odmowa = (page: Page) => page.getByText('Ten termin nie jest już dostępny')

  await expect(potwierdzenie(anna).or(odmowa(anna))).toBeVisible({ timeout: ZIMNY_START_MS })
  await expect(potwierdzenie(borys).or(odmowa(borys))).toBeVisible({ timeout: ZIMNY_START_MS })

  const wygrane = await Promise.all([
    potwierdzenie(anna).isVisible(),
    potwierdzenie(borys).isVisible(),
  ])
  expect(wygrane.filter(Boolean)).toHaveLength(1)

  // Przegrany wraca do kalendarza, a nie zostaje na podsumowaniu bez wyjścia.
  const przegrany = wygrane[0] ? borys : anna
  await expect(przegrany.getByRole('group', { name: 'Wybierz Oś' })).toBeVisible()

  await pierwszy.close()
  await drugi.close()
})
