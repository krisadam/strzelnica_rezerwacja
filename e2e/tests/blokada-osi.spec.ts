import { expect, test } from '@playwright/test'
import {
  czasBloku,
  dzienRezerwacji,
  dzienZaDni,
  OBSLUGA_DEMO,
  OS_KARABINOWA,
  OS_PISTOLETOWA,
  otworzWidget,
  REZERWACJA_DEMO,
  wolnyBlokPoDniach,
  zadeklarujPozwolenie,
  zalogujDoPanelu,
  ZIMNY_START_MS,
} from './pomocniki.js'

/**
 * Blokada Osi — droga od formularza w Panelu do terminu, którego w Widgecie
 * nie ma.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że Blokada zapisana w Panelu
 * naprawdę zdejmuje terminy z kalendarza klienta, że stoi w kalendarzu Panelu
 * odróżnialna od Rezerwacji i że klient nie dowiaduje się z niej **niczego**
 * poza brakiem terminu. Same reguły — kolizja, zakres, powód — są pokryte
 * w `packages/shared` i nie ma ich tu po raz drugi.
 *
 * Druga rzecz stąd jest własnością bazy, nie ekranu: Blokada nie wchodzi na
 * czas zajęty przez Rezerwację. Formularz pyta o to zajętością sprzed chwili,
 * a rozstrzyga zapis pod blokadą doradczą — więc pytamy o odmowę tam, gdzie
 * zapada, czyli za funkcją.
 *
 * Izolacja tej drogi ma własne miejsce: `izolacja-strzelnic.spec.ts` pyta
 * `place_closure` i `zablokuj-os` obcym kontem, obok interfejsu.
 */

/**
 * Dzień, na którym ten test wyłącza Oś — na własnej wysokości horyzontu, żeby
 * nie zabierać terminów testom rezerwującym (te celują w 16, 22 i 27).
 * Oś karabinowa, bo pistoletową zajmują na tej głębokości Rezerwacje z seeda.
 */
const DZIEN_BLOKADY = 12

const POWOD = 'Serwis wyciągu łusek.'

/** Ile dni od zadanej głębokości test przegląda w poszukiwaniu wolnego Bloku. */
const DNI_SZUKANIA = 5

/** Wołanie Edge Function przechodzi przez jej zimny start. */
test.slow()

test('Blokada wprowadzona w Panelu zdejmuje terminy z Widgetu', async ({ page }) => {
  // Termin, który przed Blokadą jest do wzięcia — bo „zniknął" bez tego kroku
  // znaczyłoby tyle, co „nigdy go nie było". Dzień szukany od zadanej
  // głębokości w przód, tak jak przy składaniu Rezerwacji: Oś karabinowa nie
  // pracuje w niedzielę, a Strzelnica ma w tym oknie dzień zamknięty.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  let dni = DZIEN_BLOKADY
  let wolny = await wolnyBlokPoDniach(page, OS_KARABINOWA, DZIEN_BLOKADY)
  while (!wolny && dni < DZIEN_BLOKADY + DNI_SZUKANIA) {
    dni += 1
    wolny = await wolnyBlokPoDniach(page, OS_KARABINOWA, 1)
  }
  if (!wolny) throw new Error(`Oś „${OS_KARABINOWA}" nie ma wolnego Bloku w oknie szukania.`)
  const czas = await czasBloku(wolny)

  const dzien = dzienZaDni(dni)

  // Cały dzień tej Osi, od północy do północy: zakres Blokady jest dowolny,
  // więc nie ma powodu dobierać go do siatki Bloków — a wyłączenie na dzień
  // jest tym, co obsługa robi przy serwisie.
  await zalogujDoPanelu(page, OBSLUGA_DEMO)
  await page.getByLabel('Oś do wyłączenia').selectOption({ label: OS_KARABINOWA })
  await page.getByLabel('Od', { exact: true }).fill(`${dzien}T00:00`)
  await page.getByLabel('Do', { exact: true }).fill(`${dzien}T23:59`)
  await page.getByLabel('Powód wyłączenia').fill(POWOD)
  await page.getByRole('button', { name: 'Wyłącz Oś ze sprzedaży' }).click()

  await expect(page.getByText('Oś wyłączona')).toBeVisible({ timeout: ZIMNY_START_MS })

  // Blokada stoi w kalendarzu Panelu, w kolumnie swojej Osi, z powodem
  // i znacznikiem — bo obsługa czyta z niej dwie różne rzeczy niż z Rezerwacji:
  // nie „kogo przyjąć", a „czego nie sprzedawać".
  await page.getByLabel('Dzień kalendarza').fill(dzien)
  const kolumna = page.locator('.os').filter({ hasText: OS_KARABINOWA })
  await expect(kolumna.getByText('Blokada')).toBeVisible()
  await expect(kolumna.getByText(POWOD)).toBeVisible()

  // I termin zniknął ze sprzedaży, choć nie ma tam żadnej Rezerwacji. Klient
  // widzi dokładnie to samo, co przy cudzej Rezerwacji — Oś i zakres czasu,
  // nigdy powód: „Serwis wyciągu łusek" jest sprawą Strzelnicy.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await wolnyBlokPoDniach(page, OS_KARABINOWA, dni)
  const blok = page.locator('.blok', { hasText: czas })
  await expect(blok).toHaveClass(/blok--niedostepny/)
  await expect(blok).toContainText('termin już zajęty')
  await expect(page.getByText(POWOD)).toHaveCount(0)

  // Cały dzień tej Osi, nie tylko ten jeden Blok: Blokada wzięła zakres,
  // a nie termin z rozkładu.
  await expect(page.getByRole('button', { name: 'wolny' })).toHaveCount(0)

  // Oś obok stoi tym niewzruszona — Blokada jest wyłączna dla swojej Osi,
  // tak samo jak Rezerwacja.
  const naSasiedniej = await wolnyBlokPoDniach(page, OS_PISTOLETOWA, 0)
  expect(naSasiedniej).not.toBeNull()
})

test('Blokada nie wchodzi na czas zajęty przez Rezerwację', async ({ page }) => {
  // Rezerwacja z seeda: potwierdzona, na Osi pistoletowej, 10:00–12:00.
  const dzien = await dzienRezerwacji(REZERWACJA_DEMO)

  await zalogujDoPanelu(page, OBSLUGA_DEMO)
  await page.getByLabel('Oś do wyłączenia').selectOption({ label: OS_PISTOLETOWA })
  await page.getByLabel('Od', { exact: true }).fill(`${dzien}T11:00`)
  await page.getByLabel('Do', { exact: true }).fill(`${dzien}T13:00`)
  await page.getByLabel('Powód wyłączenia').fill('Zawody klubowe.')
  await page.getByRole('button', { name: 'Wyłącz Oś ze sprzedaży' }).click()

  // Odmowa mówi, co z nią zrobić: Rezerwację trzeba najpierw odwołać, żeby
  // klient dostał powód, a nie zastał zamknięte.
  await expect(page.getByText('W tym czasie Oś jest już czyjaś')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Rezerwacja stoi, jak stała: odmowa nie jest tu „prawie zapisem".
  await page.getByLabel('Dzień kalendarza').fill(dzien)
  const kolumna = page.locator('.os').filter({ hasText: OS_PISTOLETOWA })
  await expect(kolumna.getByText('Jan Przykładowy')).toBeVisible()
  await expect(kolumna.getByText('Blokada')).toHaveCount(0)
})
