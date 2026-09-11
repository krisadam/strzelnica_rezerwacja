import { expect, test } from '@playwright/test'
import { baza } from './srodowisko.js'
import {
  dzienZaDni,
  OBSLUGA_DEMO,
  OS_PISTOLETOWA,
  otworzWidget,
  zadeklarujPozwolenie,
  wrocDoPanelu,
  zalogujDoPanelu,
  ZIMNY_START_MS,
  zlozIPotwierdz,
} from './pomocniki.js'

/**
 * Osie i rozkład Bloków — droga od formularza w Panelu do terminu, który
 * w Widgecie jest do wzięcia, i z powrotem do jego zniknięcia.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że Oś dodana w Panelu naprawdę
 * staje się ofertą, że rozkład zapisany przed chwilą widać w Widgecie bez
 * czekania na cokolwiek, że jego skasowanie **nie rusza** Rezerwacji, która
 * już stoi, i że Oś wyłączona znika klientowi z oczu, zostając obsłudze.
 *
 * Czego tu nie ma, bo jest pokryte w `packages/shared`: siatki Slotów,
 * zachodzenia Bloków, reguł kopiowania dnia i zajętej nazwy. Kopiowanie dnia
 * przechodzi tędy mimochodem — nie po to, żeby sprawdzić regułę, a po to, żeby
 * sprawdzić, czy przycisk jest do niej podłączony.
 *
 * Izolacja tej drogi ma własne miejsce: `izolacja-strzelnic.spec.ts` pyta
 * `save_lane` i `set_lane_schedule` obcym kontem, obok interfejsu.
 */

/**
 * Oś zakładana przez ten test. Własna, a nie jedna z seeda: test wyłącza ją ze
 * sprzedaży i kasuje jej rozkład, a Osie z seeda są terminami dla wszystkich
 * pozostałych testów.
 */
const OS_TESTOWA = 'Oś testowa konfiguracji'

const KLIENT = 'konfiguracja@example.pl'

/**
 * Głębokość horyzontu, od której ten test szuka terminu — własna, żeby nie
 * zabierać Bloków testom rezerwującym (te celują w 16, 22 i 27), i za dniem
 * zamkniętym wyjątkiem kalendarzowym z seeda (`current_date + 10`).
 */
const DZIEN_TESTU = 11

/** Bloki tej Osi: jedna godzina otwarcia wspólna wszystkim dniom seeda. */
const POCZATEK = '10:00'
const DLUGOSC = '120'

/**
 * Nazwy dni wypisane tu wprost, a nie wzięte ze słownika Panelu: test
 * przeglądarkowy ogląda system z zewnątrz, jak obsługa czytająca ekran, i ma
 * zauważyć zmianę nazwy dnia zamiast podążać za nią po cichu. Ta sama reguła,
 * co przy wzorcach linków w `pomocniki.ts`.
 */
const DNI_TYGODNIA = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela',
] as const

/** Dni, na które przepisuje się poniedziałek — czyli cały tydzień poza nim. */
const POZOSTALE_DNI = DNI_TYGODNIA.slice(1)

/** Wołanie Edge Function przechodzi przez jej zimny start, a tych jest tu kilka. */
test.slow()

/**
 * Oś tego testu razem ze wszystkim, co od niej zależy — rozkładem i własnymi
 * Rezerwacjami (kasuje je klucz obcy kaskadą). Sprzątanie **przed** przebiegiem,
 * a nie po nim: przebieg przerwany w połowie zostawia Oś, a nazwa Osi jest
 * w Strzelnicy jedyna, więc następne uruchomienie odbiłoby się od niej.
 */
async function usunOsTestowa(): Promise<void> {
  await baza(`lanes?name=eq.${encodeURIComponent(OS_TESTOWA)}`, { method: 'DELETE' })
}

test.beforeEach(usunOsTestowa)
test.afterAll(usunOsTestowa)

test('Oś dodana w Panelu wchodzi do oferty razem ze swoim rozkładem', async ({ page }) => {
  await zalogujDoPanelu(page, OBSLUGA_DEMO)

  // Nowa Oś: nazwa i pojemność, i nic poza tym. Stawkę za Blok ustawia cennik
  // (ticket #22), a Oś bez rozkładu nie ma jeszcze czego sprzedawać.
  const nowa = page.locator('.os-konfiguracja').filter({ hasText: 'Nowa Oś' })
  await nowa.getByLabel('Nazwa').fill(OS_TESTOWA)
  await nowa.getByLabel('Pojemność (Uczestników)').fill('3')
  await nowa.getByRole('button', { name: 'Dodaj Oś' }).click()
  await expect(page.getByText('Oś dodana')).toBeVisible({ timeout: ZIMNY_START_MS })

  // Oś jest, terminów nie ma: w Widgecie stoi w wyborze Osi, a kalendarz jej
  // dnia jest pusty. To nie to samo, co Oś zamknięta — to Oś, której
  // Strzelnica nie wypisała jeszcze ani jednego Bloku.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await page.getByRole('radio', { name: OS_TESTOWA }).check()
  await expect(page.locator('.blok')).toHaveCount(0)

  // Rozkład: jeden Blok w poniedziałek, przepisany na pozostałe sześć dni.
  // Tydzień wypisywany dzień po dniu byłby siedmiokrotnym powtórzeniem tego
  // samego — i po to właśnie jest przepisywanie.
  await wrocDoPanelu(page)
  await page.getByLabel('Oś, której rozkład układasz').selectOption({ label: OS_TESTOWA })

  const poniedzialek = page.locator('.rozklad__dzien').filter({ hasText: 'Poniedziałek' })
  await poniedzialek.getByLabel('Początek').selectOption(POCZATEK)
  await poniedzialek.getByLabel('Długość (minuty)').fill(DLUGOSC)
  await poniedzialek.getByRole('button', { name: 'Dodaj Blok' }).click()

  for (const dzien of POZOSTALE_DNI) {
    await page.locator('.rozklad__dni').getByLabel(dzien).check()
  }
  await page.getByRole('button', { name: 'Przepisz dzień' }).click()

  // Dopóki nie zapisano, zmiana żyje wyłącznie na ekranie — i ekran mówi to
  // wprost, żeby nikt nie wyszedł z Panelu przekonany, że zapisał.
  await expect(page.getByText('Rozkład ma niezapisane zmiany')).toBeVisible()

  await page.getByRole('button', { name: 'Zapisz rozkład' }).click()
  await expect(page.getByText('Rozkład zapisany')).toBeVisible({ timeout: ZIMNY_START_MS })
  await expect(page.getByText('Rozkład ma niezapisane zmiany')).toHaveCount(0)

  // I termin jest do wzięcia — bez czekania na cokolwiek. Rezerwacja idzie tą
  // samą drogą, co każda inna: to ona jest dowodem, że Oś dodana w Panelu jest
  // Osią, a nie wierszem w tabeli.
  const { termin } = await zlozIPotwierdz(page, {
    os: OS_TESTOWA,
    email: KLIENT,
    odDnia: DZIEN_TESTU,
  })
  const dzienRezerwacji = dzienZaDni(termin.dni)

  // Rozkład skasowany w całości: poniedziałek bez Bloku przepisany na
  // pozostałe dni. Dzień pusty jest odpowiedzią, a nie brakiem danych, więc
  // przepisuje się tak samo jak każdy inny.
  await wrocDoPanelu(page)
  await page.getByLabel('Oś, której rozkład układasz').selectOption({ label: OS_TESTOWA })
  await poniedzialek.getByRole('button', { name: /^Usuń Blok/ }).click()
  for (const dzien of POZOSTALE_DNI) {
    await page.locator('.rozklad__dni').getByLabel(dzien).check()
  }
  await page.getByRole('button', { name: 'Przepisz dzień' }).click()
  await page.getByRole('button', { name: 'Zapisz rozkład' }).click()
  await expect(page.getByText('Rozkład zapisany')).toBeVisible({ timeout: ZIMNY_START_MS })

  // Rezerwacja stoi, jak stała: rozkład mówi, czego Strzelnica nie sprzedaje,
  // a nie komu odbiera termin. Klient, który kupił Blok wczoraj, przyjedzie
  // mimo tego, że dziś tej godziny nie ma już w ofercie.
  await page.getByLabel('Dzień kalendarza').fill(dzienRezerwacji)
  const kolumna = page.locator('.os').filter({ hasText: OS_TESTOWA })
  await expect(kolumna.getByText('Celina Nowak')).toBeVisible()

  // A w Widgecie tej Osi nie ma już czego wziąć — Oś stoi w wyborze, ale bez
  // ani jednego Bloku.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await page.getByRole('radio', { name: OS_TESTOWA }).check()
  await expect(page.locator('.blok')).toHaveCount(0)

  // Wyłączenie Osi: jedno pole, nie kasowanie. Kasowania nie ma i nie będzie —
  // zabrałoby ze sobą Rezerwację, która na niej stoi (ADR 0013).
  await wrocDoPanelu(page)
  const formularz = page.locator('.os-konfiguracja').filter({ hasText: OS_TESTOWA })
  await formularz.getByLabel('Oś w ofercie').uncheck()
  await formularz.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('Oś zapisana')).toBeVisible({ timeout: ZIMNY_START_MS })

  // Klient nie widzi jej wcale — inaczej niż przy Blokadzie, która zostawia
  // termin widoczny jako zajęty: tam Oś jest w ofercie i wraca do niej za
  // tydzień, tu nie ma jej w ofercie w ogóle. Osie z seeda stoją niewzruszone:
  // wyłączenie dotyczy jednej Osi, a nie oferty Strzelnicy.
  await otworzWidget(page)
  await expect(page.getByRole('radio', { name: OS_TESTOWA })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: OS_PISTOLETOWA })).toBeVisible()

  // Obsłudze zostaje i Oś, i Rezerwacja na niej: pierwsza ze znacznikiem,
  // druga bez zmian. Klient przyjedzie, bo nikt mu niczego nie odwołał.
  await wrocDoPanelu(page)
  await expect(
    page.locator('.os-konfiguracja').filter({ hasText: OS_TESTOWA }).getByText('wyłączona'),
  ).toBeVisible()
  await page.getByLabel('Dzień kalendarza').fill(dzienRezerwacji)
  await expect(kolumna.getByText('Celina Nowak')).toBeVisible()
})
