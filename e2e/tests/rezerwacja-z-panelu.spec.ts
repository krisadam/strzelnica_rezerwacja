import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  dzienRezerwacji,
  dzienZaDni,
  HASLO_PANELU,
  listyDo,
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
import { baza, funkcjaJakoUzytkownikPanelu } from './srodowisko.js'

/**
 * Ręczna Rezerwacja telefoniczna — droga od formularza w Panelu do terminu,
 * którego w Widgecie już nie ma.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że wpis przekraczający limit
 * Strzelnicy naprawdę wchodzi do bazy, że przekroczenie zostaje przy nim
 * zapisane i widać je w szczegółach, że Źródło odróżnia go od zgłoszenia
 * klienta i że nie idzie przy tym do nikogo żaden list. Same reguły — co wolno
 * przekroczyć, czego nie i jak nazwać odmowę — są pokryte w `packages/shared`
 * i nie ma ich tu po raz drugi.
 *
 * Druga rzecz stąd jest własnością bazy, nie ekranu: na termin zajęty przez
 * cudzą Rezerwację nie wchodzi się i nie da się tego przekroczyć. Pytamy o to
 * dwa razy — formularzem i wprost funkcją — bo formularz odmawia z zajętości
 * sprzed chwili, a rozstrzyga ograniczenie wykluczające w schemacie.
 *
 * Izolacja tej drogi ma własne miejsce: `izolacja-strzelnic.spec.ts` pyta
 * `place_booking` i `wpisz-rezerwacje` obcym kontem, obok interfejsu.
 */

/**
 * Dzień, na którym ten test wpisuje Rezerwację — na własnej wysokości
 * horyzontu, żeby nie zabierać terminów testom rezerwującym (te celują w 16, 22
 * i 27) ani testowi Blokady (12). Oś karabinowa, bo jest dwuosobowa: wpis na
 * pięć osób przekracza jej pojemność, a pistoletowa zmieściłaby cztery.
 */
const DZIEN_WPISU = 19

/** Ile dni od zadanej głębokości test przegląda w poszukiwaniu wolnego Bloku. */
const DNI_SZUKANIA = 5

const KLIENT = 'Telefoniczna Klientka'
const ADRES_KLIENTKI = 'telefoniczna@example.pl'

/** Wołanie Edge Function przechodzi przez jej zimny start. */
test.slow()

/** Lista wyboru terminu w formularzu ręcznego wpisu. */
function terminy(page: Page): Locator {
  return page.getByLabel('Termin', { exact: true })
}

/**
 * Pierwszy wolny termin wskazanej Osi, szukany dzień po dniu od zadanej
 * głębokości. Wolny poznaje się po opisie w liście wyboru — formularz wypisuje
 * przy każdym Bloku, czy jest do wzięcia, a jeśli nie, to dlaczego.
 *
 * Rozkład Osi karabinowej nie ma niedziel, a Strzelnica ma w tym oknie dzień
 * zamknięty, więc szukanie idzie w przód tak samo jak w Widgecie.
 */
async function wolnyTermin(
  page: Page,
  os: string,
  odDnia: number,
): Promise<{ dzien: string; dni: number; wartosc: string; czas: string }> {
  await page.getByLabel('Oś Rezerwacji').selectOption({ label: os })

  for (let krok = 0; krok < DNI_SZUKANIA; krok += 1) {
    const dni = odDnia + krok
    const dzien = dzienZaDni(dni)
    await page.getByLabel('Dzień Rezerwacji').fill(dzien)

    const opcje = terminy(page).locator('option')
    for (let numer = 0; numer < (await opcje.count()); numer += 1) {
      const opcja = opcje.nth(numer)
      const opis = (await opcja.textContent()) ?? ''
      const wartosc = await opcja.getAttribute('value')
      if (!opis.includes('wolny') || !wartosc) continue

      // Godzina i głębokość dnia zapamiętane razem, bo do tego samego terminu
      // trzeba potem wrócić kalendarzem Widgetu — a ten chodzi po dniach, nie
      // po datach.
      return { dzien, dni, wartosc, czas: opis.split(' — ')[0]?.trim() ?? '' }
    }
  }

  throw new Error(`Oś „${os}" nie ma wolnego terminu w oknie szukania.`)
}

/** Wypełnienie zgłoszenia przyjętego przez telefon — bez terminu i bez Osi. */
async function wypelnijZgloszenie(page: Page, uczestnicy: number): Promise<void> {
  await page.getByLabel('Liczba Uczestników').fill(String(uczestnicy))
  // Pozwolenie zadeklarowane, żeby nie zajmować miejsca w Puli instruktorów:
  // Pula demo ma jedno miejsce, a testy jadą równolegle. Przekroczenie Puli
  // jest pokryte na szwie czystych funkcji.
  await page.getByLabel('Klient deklaruje Pozwolenie na broń').check()
  await page.getByLabel('Imię i nazwisko').fill(KLIENT)
  await page.getByLabel('Adres e-mail').fill(ADRES_KLIENTKI)
  await page.getByLabel('Telefon', { exact: true }).fill('600700800')
  await page.getByLabel('Klient zaakceptował regulamin').check()
}

test('Rezerwacja przyjęta przez telefon wchodzi z przekroczonym limitem i zdejmuje termin', async ({
  page,
}) => {
  await zalogujDoPanelu(page, OBSLUGA_DEMO)

  const { dzien, dni, wartosc, czas } = await wolnyTermin(page, OS_KARABINOWA, DZIEN_WPISU)
  await terminy(page).selectOption(wartosc)

  // Pięć osób na Osi dwuosobowej: to jest owa reguła, o której obsługa wie
  // więcej niż system — grupa przychodzi z jednym karabinem i strzela po kolei.
  await wypelnijZgloszenie(page, 5)

  // Kwota stoi na ekranie, zanim cokolwiek zostanie wysłane: obsługa podaje ją
  // klientowi w rozmowie. Liczy ją ta sama funkcja, która zapisze ją przy
  // Rezerwacji — 150 zł za Blok Osi karabinowej i 30 zł za każdego Uczestnika
  // poza pierwszym.
  await expect(page.locator('.wpis-kwota')).toContainText('270,00 zł')

  // Pytanie o pewność jest jawnym potwierdzeniem: wymienia przekraczany limit
  // z nazwy i bez niego wpis nie idzie dalej.
  await page.getByRole('button', { name: 'Wpisz Rezerwację' }).click()
  await expect(page.getByText('Ta Rezerwacja przekracza limity Strzelnicy')).toBeVisible()
  await expect(page.getByText('Uczestnicy ponad pojemność Osi')).toBeVisible()

  await page.getByRole('button', { name: 'Tak, wpisuję mimo to' }).click()
  await expect(page.getByText('Wpisaliśmy Rezerwację')).toBeVisible({ timeout: ZIMNY_START_MS })
  // Co dokładnie zostało odnotowane — bo to jest odpowiedź serwera, a nie
  // powtórzenie tego, na co obsługa przystała.
  await expect(page.getByText('odnotowaliśmy przekroczone limity')).toBeVisible()

  // Rezerwacja stoi w kalendarzu dnia, w kolumnie swojej Osi — od razu
  // potwierdzona, bo nie ma na co czekać.
  await page.getByLabel('Dzień kalendarza').fill(dzien)
  const kolumna = page.locator('.os').filter({ hasText: OS_KARABINOWA })
  await expect(kolumna.getByText(KLIENT)).toBeVisible()
  await expect(kolumna.getByText('potwierdzona')).toBeVisible()

  // A w szczegółach: Źródło i przekroczony limit, oba na piśmie. Bez nich
  // Rezerwacja na pięć osób na Osi dwuosobowej wygląda na pomyłkę systemu.
  await kolumna.getByText(KLIENT).click()
  await expect(page.getByRole('heading', { name: 'Szczegóły Rezerwacji' })).toBeVisible()
  await expect(page.getByText('Panel — Rezerwacja przyjęta przez telefon')).toBeVisible()
  await expect(page.getByText('Uczestnicy ponad pojemność Osi')).toBeVisible()
  await expect(page.getByText('5 os.')).toBeVisible()

  // Nie poszedł ani jeden list: klient jest na linii i słyszy termin oraz Kwotę
  // od obsługi, a potwierdzać adresu nie ma po co — nie on go wpisał.
  expect(await listyDo(ADRES_KLIENTKI)).toEqual([])

  // I termin zniknął ze sprzedaży. Rezerwacja przekraczająca limit zajmuje Oś
  // tak samo jak każda inna — a klient nie ma czym poznać, że przy jej
  // przyjmowaniu ktoś złamał regułę.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await wolnyBlokPoDniach(page, OS_KARABINOWA, dni)
  const blok = page.locator('.blok', { hasText: czas })
  await expect(blok).toHaveClass(/blok--niedostepny/)
  await expect(blok).toContainText('termin już zajęty')
})

test('Rezerwacji telefonicznej nie da się wpisać na termin zajęty przez inną', async ({ page }) => {
  // Rezerwacja z seeda: potwierdzona, na Osi pistoletowej, 10:00–12:00.
  const dzien = await dzienRezerwacji(REZERWACJA_DEMO)

  await zalogujDoPanelu(page, OBSLUGA_DEMO)
  await page.getByLabel('Oś Rezerwacji').selectOption({ label: OS_PISTOLETOWA })
  await page.getByLabel('Dzień Rezerwacji').fill(dzien)

  // Termin stoi w liście wyboru razem z powodem, przez który nie jest wolny —
  // obsługa widzi wszystkie Bloki dnia, także te nie do wzięcia. Blok wskazany
  // minutą rozkładu (10:00), tą samą, w którą celuje Rezerwacja z seeda.
  const zajety = terminy(page).locator('option[value="600"]')
  await expect(zajety).toContainText('termin już zajęty')
  await terminy(page).selectOption('600')

  await wypelnijZgloszenie(page, 2)
  await page.getByRole('button', { name: 'Wpisz Rezerwację' }).click()

  // Odmowa, a nie pytanie o pewność: wyłączność Osi nie jest limitem do
  // przekroczenia, więc nie ma przycisku, którym dałoby się ją minąć.
  await expect(page.getByText('Ten termin jest już czyjś')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tak, wpisuję mimo to' })).toHaveCount(0)

  // Ta sama odmowa za funkcją, a nie tylko przed nią: formularz pyta zajętość
  // sprzed chwili, a rozstrzyga ograniczenie wykluczające w schemacie —
  // z potwierdzeniem wszystkich trzech limitów w żądaniu i tak nie wejdzie.
  const [seed] = await baza<{ lane_id: string; starts_at: string }[]>(
    `bookings?id=eq.${REZERWACJA_DEMO}&select=lane_id,starts_at`,
  )
  const funkcja = await funkcjaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'wpisz-rezerwacje',
    {
      laneId: seed?.lane_id,
      day: dzien,
      startMinute: 600,
      participants: 2,
      contact: { name: KLIENT, email: ADRES_KLIENTKI, phone: '600700800' },
      consent: true,
      hasPermit: true,
      wantsInstructor: false,
      rentals: [],
      ammunition: [],
      overrides: ['poza-godzinami-otwarcia', 'brak-instruktora', 'ponad-pojemnosc-osi'],
    },
  )
  expect(funkcja.status).toBe(200)
  expect(await funkcja.json()).toEqual({ ok: false, problem: 'termin-zajety' })

  // Rezerwacja z seeda stoi jak stała, a drugiej na jej terminie nie ma:
  // odmowa nie jest tu „prawie zapisem".
  const naTerminie = await baza<{ id: string }[]>(
    `bookings?lane_id=eq.${seed?.lane_id}` +
      `&starts_at=eq.${encodeURIComponent(seed?.starts_at ?? '')}&select=id`,
  )
  expect(naTerminie.map((wiersz) => wiersz.id)).toEqual([REZERWACJA_DEMO])
})
