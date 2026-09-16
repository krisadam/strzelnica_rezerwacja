import { expect, test } from '@playwright/test'
import {
  dzienZaDni,
  OBSLUGA_DEMO,
  OBSLUGA_DRUGIEJ,
  OS_KARABINOWA,
  otworzWidget,
  wolnyBlokPoDniach,
  wrocDoPanelu,
  zadeklarujPozwolenie,
  zalogujDoPanelu,
  ZIMNY_START_MS,
  zlozIPotwierdz,
} from './pomocniki.js'
import { baza } from './srodowisko.js'

/**
 * Godziny otwarcia i Wyjątki kalendarzowe — droga od formularza w Panelu do
 * dnia, którego w Widgecie nie ma czym zarezerwować, i z powrotem.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że wyjątek zapisany przed
 * chwilą zdejmuje Bloki klientowi bez czekania na cokolwiek, że dzień skrócony
 * zostawia je widoczne i niedostępne, że Rezerwacja stojąca w zamkniętym dniu
 * **zostaje** — i że Panel mówi o niej wprost, zamiast pozwolić jej zniknąć po
 * cichu.
 *
 * Czego tu nie ma, bo jest pokryte w `packages/shared`: reguły „wyjątek
 * zastępuje tydzień", zakresu godzin i samego wyliczania kolizji.
 */

/** Powód wpisywany w wyjątki tego testu — po nim poznaje je sprzątanie. */
const POWOD_TESTU = 'Zawody testowe'

const KLIENT = 'godziny@example.pl'

/**
 * Głębokość horyzontu, na której ten test zamyka dzień — własna, żeby nie
 * zdejmować Bloków testom rezerwującym (te celują w 11, 12, 16, 19, 22 i 27)
 * i za dniem zamkniętym z seeda (`current_date + 10`).
 */
const DZIEN_TESTU = 24

/** Skrócony dzień wyjątku: godzina, w której nie mieści się żaden Blok seeda. */
const OTWARCIE_SKROCONE = '00:30'
const ZAMKNIECIE_SKROCONE = '01:00'

/** Druga Strzelnica z seeda — jej tydzień układa drugi test. */
const DRUGA_STRZELNICA = '00000000-0000-0000-0000-000000000002'

/** Wołanie Edge Function przechodzi przez jej zimny start, a tych jest tu kilka. */
test.slow()

/**
 * Wyjątki i Rezerwacje tego testu. Sprzątanie **przed** przebiegiem, a nie po
 * nim: przebieg przerwany w połowie zostawia dzień zamknięty, a zamknięty dzień
 * zabiera Bloki następnemu uruchomieniu.
 */
async function usunSladyTestu(): Promise<void> {
  await baza(`calendar_exceptions?reason=eq.${encodeURIComponent(POWOD_TESTU)}`, {
    method: 'DELETE',
  })
  await baza(`bookings?contact_email=eq.${encodeURIComponent(KLIENT)}`, { method: 'DELETE' })
}

test.beforeEach(usunSladyTestu)
test.afterAll(usunSladyTestu)

test('wyjątek zamyka dzień klientowi, nie ruszając Rezerwacji, które w nim stoją', async ({
  page,
}) => {
  await zalogujDoPanelu(page, OBSLUGA_DEMO)

  // Rezerwacja, która stanie w zamkniętym dniu. Własna, a nie ta z seeda:
  // dzień seeda jest terminem dla pozostałych testów.
  const { termin } = await zlozIPotwierdz(page, {
    os: OS_KARABINOWA,
    email: KLIENT,
    odDnia: DZIEN_TESTU,
  })
  const dzien = dzienZaDni(termin.dni)

  await wrocDoPanelu(page)
  const formularzWyjatku = page.locator('.godziny__wyjatek')
  await formularzWyjatku.getByLabel('Data').fill(dzien)
  await formularzWyjatku.getByLabel('Powód (dla obsługi)').fill(POWOD_TESTU)

  // Kolizja widać, **zanim** cokolwiek pójdzie do bazy: formularz przykłada
  // wyjątek do Rezerwacji, które już stoją, i wypisuje te, które po zmianie
  // wypadną poza godziny.
  await expect(formularzWyjatku.locator('.kolizje').getByText('Celina Nowak')).toBeVisible()

  await formularzWyjatku.getByRole('button', { name: 'Zapisz wyjątek' }).click()
  await expect(page.getByText('Wyjątek zapisany')).toBeVisible({ timeout: ZIMNY_START_MS })
  // Wiersz tej daty, a nie „gdzieś na liście": wyjątek z seeda stoi obok
  // i mówi o sobie dokładnie to samo.
  const wiersz = page.locator('.godziny__wyjatki li').filter({ hasText: dzien })
  await expect(wiersz).toContainText('zamknięte przez cały dzień')
  await expect(wiersz).toContainText(POWOD_TESTU)

  // Klientowi tego dnia nie ma czego wziąć — i nie jest to dzień bez wolnych
  // Bloków, tylko dzień bez Bloków w ogóle. Strzelnica mówi to wprost, zamiast
  // zostawiać pusty kalendarz do zinterpretowania.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await wolnyBlokPoDniach(page, OS_KARABINOWA, termin.dni)
  await expect(page.locator('.blok')).toHaveCount(0)
  await expect(page.getByText('Tego dnia Strzelnica jest zamknięta')).toBeVisible()

  // A Rezerwacja stoi, jak stała: wyjątek mówi, czego Strzelnica nie sprzedaje,
  // a nie komu odbiera termin. Klient, który kupił Blok wczoraj, przyjedzie —
  // chyba że ktoś mu to odwoła, z powodem i na piśmie.
  await wrocDoPanelu(page)
  await page.getByLabel('Dzień kalendarza').fill(dzien)
  await expect(
    page.locator('.os').filter({ hasText: OS_KARABINOWA }).getByText('Celina Nowak'),
  ).toBeVisible()

  // Ten sam dzień skrócony zamiast zamkniętego: Bloki wracają na grafik, ale
  // żaden nie mieści się w godzinach, więc ani jeden nie jest do wzięcia.
  // To jest różnica między dniem zamkniętym a dniem poza godzinami.
  await formularzWyjatku.getByLabel('Data').fill(dzien)
  await formularzWyjatku.getByLabel('Powód (dla obsługi)').fill(POWOD_TESTU)
  await formularzWyjatku.getByLabel('Zamknięte przez cały dzień').uncheck()
  await formularzWyjatku.getByLabel('Otwarcie').selectOption({ label: OTWARCIE_SKROCONE })
  await formularzWyjatku.getByLabel('Zamknięcie').selectOption({ label: ZAMKNIECIE_SKROCONE })
  await formularzWyjatku.getByRole('button', { name: 'Zapisz wyjątek' }).click()
  await expect(page.getByText('Wyjątek zapisany')).toBeVisible({ timeout: ZIMNY_START_MS })

  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await wolnyBlokPoDniach(page, OS_KARABINOWA, termin.dni)
  await expect(page.locator('.blok').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'wolny' })).toHaveCount(0)

  // Wyjątek zdjęty: data wraca do rytmu tygodnia, a dzień do sprzedaży.
  await wrocDoPanelu(page)
  await page
    .locator('.godziny__wyjatki')
    .getByRole('button', { name: `Zdejmij wyjątek z dnia ${dzien}` })
    .click()
  await expect(page.getByText('Wyjątek zdjęty')).toBeVisible({ timeout: ZIMNY_START_MS })

  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await wolnyBlokPoDniach(page, OS_KARABINOWA, termin.dni)
  await expect(page.getByRole('button', { name: 'wolny' }).first()).toBeVisible()
})

/**
 * Tydzień godzin układany na **drugiej** Strzelnicy, a nie demonstracyjnej,
 * i jest to konieczność, a nie ostrożność: godziny są własnością Strzelnicy,
 * więc zamknięty dzień tygodnia zdejmuje Bloki wszystkim jej Osiom naraz — na
 * trzydzieści dni w przód i wszystkim testom, które akurat jadą obok.
 *
 * Tydzień drugiej Strzelnicy wraca po przebiegu do stanu z seeda: dla testów
 * izolacji jest on wierszem, który ma **być**, a nie wierszem o konkretnych
 * godzinach, więc wystarczy tu przywrócenie, bez porządku między plikami.
 */
test.describe('tydzień godzin otwarcia', () => {
  const NIEDZIELA_OTWARCIE = '09:00'
  const NIEDZIELA_ZAMKNIECIE = '18:00'

  /** Tydzień z seeda: poniedziałek–sobota 08:00–21:00, niedziela zamknięta. */
  async function przywrocTydzienDrugiej(): Promise<void> {
    await baza(`opening_hours?facility_id=eq.${DRUGA_STRZELNICA}`, { method: 'DELETE' })
    await baza('opening_hours', {
      method: 'POST',
      body: JSON.stringify(
        [1, 2, 3, 4, 5, 6].map((weekday) => ({
          facility_id: DRUGA_STRZELNICA,
          weekday,
          opens_minute: 480,
          closes_minute: 1260,
        })),
      ),
    })
  }

  test.afterAll(przywrocTydzienDrugiej)

  test('dzień otwarty i zamknięty w tygodniowym szablonie', async ({ page }) => {
    await zalogujDoPanelu(page, OBSLUGA_DRUGIEJ)

    const niedziela = page.locator('.godziny__dzien').filter({ hasText: 'Niedziela' })
    // Dzień bez godzin jest dniem zamkniętym i mówi to wprost: pusta ramka
    // wyglądałaby jak ekran, który się nie doczytał.
    await expect(niedziela.getByText('Zamknięte przez cały dzień')).toBeVisible()

    await niedziela.getByLabel('Otwarte').check()
    await niedziela.getByLabel('Otwarcie').selectOption({ label: NIEDZIELA_OTWARCIE })
    await niedziela.getByLabel('Zamknięcie').selectOption({ label: NIEDZIELA_ZAMKNIECIE })

    // Dopóki nie zapisano, zmiana żyje wyłącznie na ekranie — i ekran mówi to
    // wprost, żeby nikt nie wyszedł z Panelu przekonany, że zapisał.
    await expect(page.getByText('Godziny mają niezapisane zmiany')).toBeVisible()

    // Zamknięcie przed otwarciem zatrzymuje się w formularzu, bez pytania
    // serwera: zastrzeżenia liczy ta sama czysta funkcja po obu stronach.
    await niedziela.getByLabel('Zamknięcie').selectOption({ label: '00:30' })
    await page.getByRole('button', { name: 'Zapisz godziny' }).click()
    await expect(page.getByText('Zamknięcie musi wypadać po otwarciu')).toBeVisible()

    await niedziela.getByLabel('Zamknięcie').selectOption({ label: NIEDZIELA_ZAMKNIECIE })
    await page.getByRole('button', { name: 'Zapisz godziny' }).click()
    await expect(page.getByText('Godziny zapisane')).toBeVisible({ timeout: ZIMNY_START_MS })
    await expect(page.getByText('Godziny mają niezapisane zmiany')).toHaveCount(0)

    // Odczyt od nowa, a nie wiara w „udało się": zapisany tydzień ma wrócić
    // z bazy taki, jaki do niej poszedł.
    await wrocDoPanelu(page)
    await expect(niedziela.getByLabel('Otwarcie')).toHaveValue('540')
    await expect(niedziela.getByLabel('Zamknięcie')).toHaveValue('1080')

    // I z powrotem: dzień zamyka się zdjęciem zaznaczenia, a nie zerowymi
    // godzinami — brak wiersza jest w tym module całą treścią zamknięcia.
    await niedziela.getByLabel('Otwarte').uncheck()
    await page.getByRole('button', { name: 'Zapisz godziny' }).click()
    await expect(page.getByText('Godziny zapisane')).toBeVisible({ timeout: ZIMNY_START_MS })

    await wrocDoPanelu(page)
    await expect(niedziela.getByText('Zamknięte przez cały dzień')).toBeVisible()
  })
})
