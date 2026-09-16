import { expect, test } from '@playwright/test'
import {
  dzienZaDni,
  OBSLUGA_DEMO,
  OS_KARABINOWA,
  otworzWidget,
  pierwszyWolnyBlok,
  wrocDoPanelu,
  zadeklarujPozwolenie,
  zalogujDoPanelu,
  ZIMNY_START_MS,
  zlozIPotwierdz,
} from './pomocniki.js'
import { baza } from './srodowisko.js'

/**
 * Katalogi sprzętu — droga od formularza w Panelu do pozycji, którą klient ma
 * w Widgecie do wzięcia, i z powrotem do jej zniknięcia.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że pozycja dodana w Panelu
 * naprawdę wchodzi do oferty, że wycofana znika klientowi z oczu **zostając**
 * w Rezerwacji, która ją zamówiła, że zmiana ceny nie rusza Kwoty złożonej
 * wcześniej i że zmniejszenie puli wypisuje Rezerwacje, którym sztuk już nie
 * starcza, zamiast im cokolwiek odbierać.
 *
 * Czego tu nie ma, bo jest pokryte w `packages/shared`: samego liczenia
 * przekroczeń puli, zakresu ceny i zajętej nazwy. Izolacja tej drogi ma własne
 * miejsce: `izolacja-strzelnic.spec.ts` pyta `save_weapon_type`
 * i `save_ammunition_kind` obcym kontem, obok interfejsu.
 */

/**
 * Pozycje zakładane przez ten test. Własne, a nie te z seeda: test wycofuje je
 * ze sprzedaży i zmniejsza pulę, a katalogi z seeda są sprzętem dla wszystkich
 * pozostałych testów.
 */
const TYP_TESTOWY = 'Karabinek testowy'
const RODZAJ_TESTOWY = 'Amunicja testowa'

const KLIENT = 'katalogi@example.pl'

/**
 * Głębokość horyzontu, od której ten test szuka terminu — własna, żeby nie
 * zabierać Bloków testom rezerwującym (te celują w 11, 12, 16, 19, 22 i 27)
 * i za dniem zamkniętym wyjątkiem kalendarzowym z seeda (`current_date + 10`).
 */
const DZIEN_TESTU = 13

/** Cena początkowa i podwyżka — obie w zapisie, którego oczekuje pole. */
const CENA = '50,00'
const CENA_PO_PODWYZCE = '99,00'

/** Wołanie Edge Function przechodzi przez jej zimny start, a tych jest tu kilka. */
test.slow()

/**
 * Pozycje tego testu razem z Rezerwacjami, które je zamówiły. Kolejność jest
 * tu treścią: pozycję katalogu wskazuje Wypożyczenie kluczem obcym `on delete
 * restrict`, więc najpierw znika Rezerwacja, a dopiero potem katalog — i to
 * samo mówi ADR 0013 o tym, dlaczego ekran Panelu nie ma przycisku „Usuń".
 *
 * Sprzątanie **przed** przebiegiem, a nie po nim: przebieg przerwany w połowie
 * zostawia pozycję, a nazwa jest w katalogu jedyna, więc następne uruchomienie
 * odbiłoby się od niej.
 */
async function usunSladyTestu(): Promise<void> {
  await baza(`bookings?contact_email=eq.${encodeURIComponent(KLIENT)}`, { method: 'DELETE' })
  await baza(`weapon_types?name=eq.${encodeURIComponent(TYP_TESTOWY)}`, { method: 'DELETE' })
  await baza(`ammunition_kinds?name=eq.${encodeURIComponent(RODZAJ_TESTOWY)}`, {
    method: 'DELETE',
  })
}

test.beforeEach(usunSladyTestu)
test.afterAll(usunSladyTestu)

test('pozycja dodana w Panelu wchodzi do oferty, a wycofana zostaje w Rezerwacji', async ({
  page,
}) => {
  await zalogujDoPanelu(page, OBSLUGA_DEMO)

  // Nowy Typ broni: nazwa, pula sztuk i cena za sztukę. Pula dwie, żeby dało
  // się ją potem zmniejszyć pod Rezerwacją, która weźmie obie.
  const nowyTyp = page.locator('.pozycja-katalogu').filter({ hasText: 'Nowy Typ broni' })
  await nowyTyp.getByLabel('Nazwa').fill(TYP_TESTOWY)
  await nowyTyp.getByLabel('Pula (sztuk)').fill('2')
  await nowyTyp.getByLabel('Cena za sztukę (zł)').fill(CENA)
  await nowyTyp.getByRole('button', { name: 'Dodaj Typ' }).click()
  await expect(page.getByText('Typ broni dodany')).toBeVisible({ timeout: ZIMNY_START_MS })

  const nowyRodzaj = page.locator('.pozycja-katalogu').filter({ hasText: 'Nowy Rodzaj amunicji' })
  await nowyRodzaj.getByLabel('Nazwa').fill(RODZAJ_TESTOWY)
  await nowyRodzaj.getByLabel('Cena za sztukę (zł)').fill('1,50')
  await nowyRodzaj.getByRole('button', { name: 'Dodaj Rodzaj' }).click()
  await expect(page.getByText('Rodzaj amunicji dodany')).toBeVisible({ timeout: ZIMNY_START_MS })

  // I sprzęt jest do wzięcia — bez czekania na cokolwiek. Rezerwacja idzie tą
  // samą drogą, co każda inna: to ona jest dowodem, że pozycja dodana w Panelu
  // jest ofertą, a nie wierszem w tabeli.
  const { termin, bookingId } = await zlozIPotwierdz(page, {
    os: OS_KARABINOWA,
    email: KLIENT,
    odDnia: DZIEN_TESTU,
    sprzet: {
      bron: { typ: TYP_TESTOWY, sztuki: 2 },
      amunicja: { rodzaj: RODZAJ_TESTOWY, sztuki: 100 },
    },
  })
  const dzienRezerwacji = dzienZaDni(termin.dni)

  // Kwota zapisana w chwili złożenia — po niej pozna się, że podwyżka jej nie
  // rusza. Czytana z bazy, a nie z ekranu: to ona jest tym, co Rezerwacja
  // niesie, a ekran ma ją tylko pokazać.
  const [zlozona] = await baza<{ amount_gr: number }[]>(
    `bookings?id=eq.${bookingId}&select=amount_gr`,
  )
  expect(zlozona?.amount_gr).toBeGreaterThan(0)

  await wrocDoPanelu(page)
  const formularzTypu = page.locator('.pozycja-katalogu').filter({ hasText: TYP_TESTOWY })

  // Pula zmniejszona pod Rezerwacją, która wzięła obie sztuki: Panel wypisuje
  // ją z nazwiskiem, zanim cokolwiek pójdzie do bazy — i zapisuje mimo to,
  // bo Rezerwacja niesie własne sztuki i nikt jej ich nie odbiera.
  await formularzTypu.getByLabel('Pula (sztuk)').fill('1')
  const przekroczenia = formularzTypu.locator('.kolizje')
  await expect(przekroczenia.getByText('Celina Nowak')).toBeVisible()
  await expect(przekroczenia.getByText('sztuk w tym czasie: 2 z 1')).toBeVisible()

  // Podwyżka ceny przy okazji tego samego zapisu: jedno i drugie jest zmianą
  // katalogu, a Rezerwacja ma przeżyć obie.
  await formularzTypu.getByLabel('Cena za sztukę (zł)').fill(CENA_PO_PODWYZCE)
  await formularzTypu.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('Typ broni zapisany')).toBeVisible({ timeout: ZIMNY_START_MS })

  // Kwota Rezerwacji stoi, jak stała: klient płaci to, co zobaczył, a nie to,
  // co Strzelnica ustaliła po jego zgłoszeniu.
  const [poPodwyzce] = await baza<{ amount_gr: number }[]>(
    `bookings?id=eq.${bookingId}&select=amount_gr`,
  )
  expect(poPodwyzce?.amount_gr).toBe(zlozona?.amount_gr)

  // Wycofanie obu pozycji: jedno pole, nie kasowanie. Kasowania nie ma i nie
  // będzie — pozycję wskazuje Wypożyczenie tej Rezerwacji (ADR 0013).
  await formularzTypu.getByLabel('Typ w ofercie').uncheck()
  await formularzTypu.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('Typ broni zapisany')).toBeVisible({ timeout: ZIMNY_START_MS })

  const formularzRodzaju = page.locator('.pozycja-katalogu').filter({ hasText: RODZAJ_TESTOWY })
  await formularzRodzaju.getByLabel('Rodzaj w ofercie').uncheck()
  await formularzRodzaju.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.getByText('Rodzaj amunicji zapisany')).toBeVisible({ timeout: ZIMNY_START_MS })

  // Klient nie widzi ich wcale — a sprzęt z seeda stoi niewzruszony:
  // wycofanie dotyczy jednej pozycji, a nie oferty Strzelnicy. Katalog pokazuje
  // się dopiero w formularzu, więc idziemy tam, gdzie klient by go zobaczył:
  // przez wybór Bloku.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  const blok = await pierwszyWolnyBlok(page, OS_KARABINOWA)
  await blok.click()
  await expect(page.getByLabel('Glock 17')).toBeVisible()
  await expect(page.getByLabel(TYP_TESTOWY)).toHaveCount(0)
  await expect(page.getByLabel(RODZAJ_TESTOWY)).toHaveCount(0)

  // Obsłudze zostaje i pozycja, i Rezerwacja z nią: pierwsza ze znacznikiem,
  // druga bez zmian. Klient przyjedzie po ten karabinek, bo nikt mu niczego
  // nie odwołał — i musi być z czego przygotować sprzęt.
  await wrocDoPanelu(page)
  await expect(formularzTypu.getByText('wycofana ze sprzedaży')).toBeVisible()
  await page.getByLabel('Dzień kalendarza').fill(dzienRezerwacji)
  const kolumna = page.locator('.os').filter({ hasText: OS_KARABINOWA })
  await kolumna.getByRole('button', { name: /Celina Nowak/ }).click()
  await expect(page.getByRole('heading', { name: 'Szczegóły Rezerwacji' })).toBeVisible()
  await expect(page.getByText(TYP_TESTOWY)).toBeVisible()
  await expect(page.getByText(RODZAJ_TESTOWY)).toBeVisible()
})
