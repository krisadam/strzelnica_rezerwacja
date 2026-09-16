import { expect, test } from '@playwright/test'
import {
  DRUGA_STRZELNICA,
  OBSLUGA_DRUGIEJ,
  otworzWidget,
  pierwszyWolnyBlok,
  wrocDoPanelu,
  zadeklarujPozwolenie,
  zalogujDoPanelu,
  ZIMNY_START_MS,
} from './pomocniki.js'
import { baza } from './srodowisko.js'

/**
 * Cennik, Pula instruktorów i reguły czasowe — droga od formularza w Panelu do
 * Kwoty, którą klient widzi w Widgecie, i do terminu, którego już tam nie ma.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że stawka zapisana przed chwilą
 * liczy Kwotę klientowi bez czekania na cokolwiek, że skrócony horyzont
 * zdejmuje dni z kalendarza, że Kwota Rezerwacji złożonej wcześniej stoi
 * niewzruszona — i że zmniejszona Pula instruktorów wypisuje Rezerwacje, którym
 * nadzoru już nie starcza, zamiast im cokolwiek odbierać.
 *
 * Czego tu nie ma, bo jest pokryte w `packages/shared`: zakresów liczb, samego
 * liczenia przekroczeń Puli i wyliczania Kwoty. Izolacja tej drogi ma własne
 * miejsce: `izolacja-strzelnic.spec.ts` pyta `set_facility_configuration`
 * obcym kontem, obok interfejsu.
 *
 * Wszystko na **drugiej** Strzelnicy, a nie demonstracyjnej, i jest to
 * konieczność, a nie ostrożność — ta sama, co przy tygodniu godzin otwarcia:
 * cennik i reguły czasowe są własnością całej Strzelnicy, więc horyzont
 * skrócony w demonstracyjnej zdjąłby terminy wszystkim testom, które akurat
 * jadą obok, a zmieniona stawka przestawiłaby ich Kwoty. Konfiguracja drugiej
 * wraca po przebiegu do stanu z seeda.
 */

/** Strzelnica, na której ten test pracuje — ta sama, co `DRUGA_STRZELNICA`. */
const STRZELNICA_ID = '00000000-0000-0000-0000-000000000002'
/**
 * Oś **nr 2**, a nie nr 1: na tej pierwszej stoi świadek testów izolacji
 * („obca Oś nietknięta"), a ten test stawce za Blok każe się zmienić. Dwa
 * testy patrzące na jedną liczbę z dwoma różnymi oczekiwaniami rozjechałyby
 * się przy pierwszym równoległym przebiegu.
 */
const OS_OBCA = 'Oś obcej Strzelnicy nr 2'

/**
 * Rezerwacja z seeda, po której poznaje się, że zmiana cennika niczego nie
 * rusza: potwierdzona, z Instruktorem i z Kwotą zamrożoną w chwili złożenia.
 * Jej klientka jest zarazem jedyną osobą, która może stanąć na liście
 * przekroczeń Puli — bo jako jedyna trzyma Instruktora.
 */
const REZERWACJA_Z_INSTRUKTOREM = '00000000-0000-0000-0000-0000000000b3'
const KLIENTKA_Z_INSTRUKTOREM = 'Obca Klientka'

/** Nowe stawki: okrągłe i wyraźnie różne od seeda, żeby Kwota mówiła sama. */
const STAWKA_UCZESTNICTWA = '40,00'
const STAWKA_INSTRUKTORA = '100,00'
const STAWKA_ZA_BLOK = '200,00'

/**
 * Horyzont skrócony do trzech dni. Na tyle krótko, żeby dzień, w którym stoi
 * Rezerwacja z seeda (`current_date + 14`), wypadł daleko poza nim — i żeby
 * dało się dojść kalendarzem do jego granicy trzema kliknięciami.
 */
const HORYZONT_KROTKI = 3

/** Wołanie Edge Function przechodzi przez jej zimny start, a tych jest tu kilka. */
test.slow()

/**
 * Konfiguracja drugiej Strzelnicy z seeda. Przywracana po przebiegu, bo dla
 * testów izolacji ta Strzelnica jest wierszem, który ma **być** i stać
 * nietknięty — a stawka zostawiona po nas byłaby cudzą konfiguracją zmienioną
 * bez jej wiedzy, czyli dokładnie tym, czego tamte testy pilnują.
 */
const KONFIGURACJA_SEEDA = {
  instructor_pool: 2,
  participation_rate_gr: 2500,
  instructor_rate_gr: 7000,
  booking_horizon_days: 30,
  min_lead_minutes: 120,
  cancellation_window_hours: 24,
}

/** Stawka za Blok Osi, na której ten test pracuje — z seeda. */
const STAWKA_OSI_SEEDA = 9000

async function przywrocKonfiguracje(): Promise<void> {
  await baza(`facilities?id=eq.${STRZELNICA_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(KONFIGURACJA_SEEDA),
  })
  await baza(`lanes?facility_id=eq.${STRZELNICA_ID}&name=eq.${encodeURIComponent(OS_OBCA)}`, {
    method: 'PATCH',
    body: JSON.stringify({ block_rate_gr: STAWKA_OSI_SEEDA }),
  })
}

// Przywracanie także **przed** przebiegiem: przebieg przerwany w połowie
// zostawia obcą stawkę, a ta rozstrzygnęłaby o Kwocie w następnym uruchomieniu.
test.beforeEach(przywrocKonfiguracje)
test.afterAll(przywrocKonfiguracje)

test('cennik i reguły z Panelu liczą Kwotę i zdejmują dni w Widgecie', async ({ page }) => {
  await zalogujDoPanelu(page, OBSLUGA_DRUGIEJ)
  const cennik = page.locator('.konfiguracja').filter({ hasText: 'Cennik i reguły' })

  // Stawka ujemna zatrzymuje się w formularzu, bez pytania serwera:
  // zastrzeżenia liczy ta sama czysta funkcja po obu stronach sieci.
  await cennik.getByLabel('Stawka za uczestnictwo (zł)').fill('-10,00')
  await cennik.getByRole('button', { name: 'Zapisz cennik i reguły' }).click()
  await expect(page.getByText('Stawka za uczestnictwo jest kwotą w złotych')).toBeVisible()

  // Tak samo Pula, która nie jest liczbą ludzi. Zero zastrzeżeniem nie jest
  // i nie będzie: znaczy Strzelnicę, która nadzoru nie zapewnia — o tym mówi
  // lista przekroczeń niżej, a nie odmowa zapisu.
  await cennik.getByLabel('Pula (Instruktorów)').fill('-1')
  await cennik.getByRole('button', { name: 'Zapisz cennik i reguły' }).click()
  await expect(page.getByText('Pula instruktorów jest liczbą ludzi')).toBeVisible()

  await cennik.getByLabel('Stawka za uczestnictwo (zł)').fill(STAWKA_UCZESTNICTWA)
  await cennik.getByLabel('Stawka za Instruktora (zł)').fill(STAWKA_INSTRUKTORA)
  await cennik.getByLabel('Pula (Instruktorów)').fill('2')
  // Podgląd stoi obok pola, zanim cokolwiek pójdzie do bazy: pole pyta o same
  // złote, a klient zobaczy Kwotę z walutą — i to ona ma się zgadzać.
  await expect(cennik.getByText('Klient zobaczy: 40,00 zł')).toBeVisible()
  await cennik.getByRole('button', { name: 'Zapisz cennik i reguły' }).click()
  await expect(page.getByText('Cennik i reguły zapisane')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Stawka za Blok stoi przy Osi, a nie w cenniku: jest jej własnością, bo to
  // na niej kiedyś stanie cennik zależny od pory dnia.
  const formularzOsi = page.locator('.os-konfiguracja').filter({ hasText: OS_OBCA })
  await formularzOsi.getByLabel('Stawka za Blok (zł)').fill(STAWKA_ZA_BLOK)
  await formularzOsi.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('Oś zapisana')).toBeVisible({ timeout: ZIMNY_START_MS })

  // I klient liczy po nowemu — bez czekania na cokolwiek. Dwie zmiany naraz,
  // bo Kwota składa się z obu: 200 zł za Blok Osi i 40 zł za drugiego
  // Uczestnika, czyli 240 zł. Pozwolenie zdeklarowane, więc Instruktora przy
  // tej Rezerwacji nie ma i jego stawka się nie nalicza.
  await otworzWidget(page, DRUGA_STRZELNICA)
  await zadeklarujPozwolenie(page)
  const blok = await pierwszyWolnyBlok(page, OS_OBCA)
  await blok.click()
  await page.getByLabel('Liczba Uczestników').fill('2')
  await expect(page.locator('.kwota__razem')).toContainText('240,00 zł')

  // Pula instruktorów zmniejszona do zera pod Rezerwacją, która trzyma
  // jedynego Instruktora: Panel wypisuje ją z nazwiskiem, **zanim** cokolwiek
  // pójdzie do bazy — i zapisuje mimo to, bo nikt tej klientce nadzoru nie
  // odbiera. Rozstrzyga człowiek, a przycisk prowadzi do jej szczegółów.
  await wrocDoPanelu(page)
  await cennik.getByLabel('Pula (Instruktorów)').fill('0')
  const przekroczenia = cennik.locator('.kolizje')
  await expect(przekroczenia.getByText(KLIENTKA_Z_INSTRUKTOREM)).toBeVisible()
  await expect(przekroczenia.getByText('Instruktorów w tym czasie: 1 z 0')).toBeVisible()

  await cennik.getByRole('button', { name: 'Zapisz cennik i reguły' }).click()
  await expect(page.getByText('Cennik i reguły zapisane')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Odczyt od nowa, a nie wiara w „udało się": zapisana konfiguracja ma wrócić
  // z bazy taka, jaka do niej poszła — razem z Rezerwacją, która została na
  // swoim terminie i ze swoim Instruktorem.
  await wrocDoPanelu(page)
  await expect(cennik.getByLabel('Pula (Instruktorów)')).toHaveValue('0')
  await expect(cennik.getByLabel('Stawka za Instruktora (zł)')).toHaveValue(STAWKA_INSTRUKTORA)
  await expect(cennik.locator('.kolizje').getByText(KLIENTKA_Z_INSTRUKTOREM)).toBeVisible()

  // A Kwota tej Rezerwacji stoi, jak stała: niesie własne stawki, po których
  // się policzyła. Czytana z bazy, a nie z ekranu — to ona jest tym, co
  // Rezerwacja niesie, a ekran ma ją tylko pokazać.
  const [rezerwacja] = await baza<{ amount_gr: number; participation_rate_gr: number }[]>(
    `bookings?id=eq.${REZERWACJA_Z_INSTRUKTOREM}&select=amount_gr,participation_rate_gr`,
  )
  expect(rezerwacja).toEqual({ amount_gr: 20500, participation_rate_gr: 2500 })

  // Horyzont skrócony do trzech dni: dalej kalendarz nie idzie. Mierzymy go
  // przyciskiem „Następny dzień", a nie pustym dniem — dzień poza horyzontem
  // bywa też dniem zamkniętym (druga Strzelnica nie pracuje w niedziele),
  // a wtedy pusty kalendarz nie mówiłby, która z dwóch reguł go opróżniła.
  //
  // Na samym końcu, bo horyzont mierzy także okno Panelu: Rezerwacja stojąca
  // za czternaście dni wypada wtedy z kalendarza obsługi, a wraz z nią
  // z każdej listy, którą ten ekran wypisuje.
  await cennik.getByLabel('Horyzont rezerwacji (dni)').fill(String(HORYZONT_KROTKI))
  await cennik.getByRole('button', { name: 'Zapisz cennik i reguły' }).click()
  await expect(page.getByText('Cennik i reguły zapisane')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  await otworzWidget(page, DRUGA_STRZELNICA)
  await zadeklarujPozwolenie(page)
  const nastepnyDzien = page.getByRole('button', { name: 'Następny dzień' })
  for (let krok = 0; krok < HORYZONT_KROTKI; krok += 1) {
    await expect(nastepnyDzien).toBeEnabled()
    await nastepnyDzien.click()
  }
  // Trzeci dzień po dzisiejszym jeszcze się w horyzoncie mieści — czwartego
  // już nie ma dokąd pokazać.
  await expect(nastepnyDzien).toBeDisabled()

  // A Rezerwacja za czternaście dni stoi dalej: horyzont mówi, na kiedy
  // Strzelnica przyjmuje, a nie komu odbiera termin.
  const [poSkroceniu] = await baza<{ status: string }[]>(
    `bookings?id=eq.${REZERWACJA_Z_INSTRUKTOREM}&select=status`,
  )
  expect(poSkroceniu?.status).toBe('potwierdzona')
})
