import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  ADRES_POWIADOMIEN,
  czasBloku,
  juzWygasla,
  LINK_ZARZADZANIA,
  listyDo,
  otworzWidget,
  OS_KARABINOWA,
  przechwyconyList,
  wolnyBlokPoDniach,
  wypelnijFormularz,
  zadeklarujPozwolenie,
  ZIMNY_START_MS,
} from './pomocniki.js'

/**
 * Potwierdzenie adresu i wygaśnięcie — ścieżka przez link z e-maila.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że list w ogóle wyszedł, że
 * niesie link prowadzący tam, gdzie trzeba, i że zegar bazy naprawdę zwalnia
 * termin. Reguły — co znaczy który stan i jak wygląda wiadomość — są pokryte
 * w `packages/shared` i nie są tu sprawdzane po raz drugi.
 *
 * E-maile weryfikujemy przez przechwycenie wysyłki: bez klucza dostawcy Edge
 * Function zapisuje wiadomość do `mail_outbox`. Sprawdzamy fakt wysyłki
 * i zawartość linku, nie dostarczenie.
 */

/**
 * Dni, od których te dwa testy zaczynają szukać terminu. Osi są dwie, a testów
 * rezerwujących więcej — wyścigi o Blok i o sztukę broni biorą terminy
 * najbliższe, bo obie strony wyścigu muszą trafić na ten sam. Odsuwamy się
 * więc w głąb horyzontu, każdy test na własną wysokość: inaczej zabralibyśmy
 * wyścigowi Blok sprzed nosa i to on by padał, a nie my.
 */
const DZIEN_POTWIERDZENIA = 16
const DZIEN_WYGASNIECIA = 22
const DZIEN_POWIADOMIEN = 27

/** Ile dni od swojego początku test przegląda w poszukiwaniu wolnego Bloku. */
const DNI_SZUKANIA = 5

/**
 * Termin Rezerwacji zapamiętany tak, żeby dało się do niego wrócić po
 * przeładowaniu strony: sama godzina nie wystarczy, bo kalendarz wstaje na
 * dzisiaj, a wolny Blok bywa za kilka dni.
 */
type Termin = { czas: string; dni: number }

/**
 * Sprzęt zamawiany tam, gdzie test ogląda listy. Nie po to, żeby sprawdzić
 * wyliczenie — to należy do szwu czystych funkcji — a po to, żeby przejść
 * odczyt katalogów, z których podsumowanie bierze nazwy pozycji.
 */
type Sprzet = {
  bron: { typ: string; sztuki: number }
  amunicja: { rodzaj: string; sztuki: number }
}

/** Złożenie Rezerwacji na pierwszym wolnym Bloku Osi karabinowej od wskazanego dnia. */
async function zlozRezerwacje(
  page: Page,
  email: string,
  odDnia: number,
  sprzet?: Sprzet,
): Promise<Termin> {
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)

  // Pierwszy dzień z wolnym Blokiem, liczony w krokach od dzisiaj — bo do tego
  // samego dnia trzeba będzie potem wrócić po przeładowaniu strony.
  let dni = odDnia
  let blok = await wolnyBlokPoDniach(page, OS_KARABINOWA, odDnia)
  while (!blok && dni < odDnia + DNI_SZUKANIA) {
    dni += 1
    blok = await wolnyBlokPoDniach(page, OS_KARABINOWA, 1)
  }
  if (!blok) throw new Error(`Oś „${OS_KARABINOWA}" nie ma wolnego Bloku w oknie szukania.`)

  const czas = await czasBloku(blok)
  await blok.click()

  await wypelnijFormularz(page, {
    uczestnicy: 1,
    imie: 'Celina Nowak',
    email,
    telefon: '600300400',
    ...sprzet,
  })
  await page.getByRole('button', { name: 'Rezerwuję' }).click()

  await expect(page.getByRole('heading', { name: 'Sprawdź skrzynkę' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  return { czas, dni }
}

/**
 * Powiadomienia Strzelnicy o Rezerwacjach tego jednego klienta. Skrzynka
 * Strzelnicy jest wspólna dla wszystkich testów jadących równolegle, więc
 * jedynym, co wydziela z niej listy tego przebiegu, jest adres klienta w treści.
 */
function powiadomieniaOKliencie(email: string) {
  return listyDo(ADRES_POWIADOMIEN).then((listy) =>
    listy.filter((wiadomosc) => wiadomosc.tresc.includes(email)),
  )
}

test('link z e-maila potwierdza adres, a drugie wejście już niczego nie zmienia', async ({
  page,
}) => {
  const email = 'celina.potwierdza@example.pl'
  await zlozRezerwacje(page, email, DZIEN_POTWIERDZENIA)

  const list = await przechwyconyList(email)

  await page.goto(list.link)
  await expect(page.getByRole('heading', { name: 'Termin jest Twój' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Jednorazowość linku widziana od strony klienta: Rezerwacja zostaje
  // potwierdzona, ale drugie wejście nie udaje, że właśnie coś zdziałało.
  await page.goto(list.link)
  await expect(page.getByText('Ten adres był już potwierdzony')).toBeVisible()
})

test('Rezerwacja niepotwierdzona wygasa, zwalnia termin i unieważnia link', async ({ page }) => {
  const email = 'celina.zwleka@example.pl'
  const termin = await zlozRezerwacje(page, email, DZIEN_WYGASNIECIA)
  const list = await przechwyconyList(email)

  // Termin jest zajęty tak samo, jak zajęłaby go Rezerwacja potwierdzona —
  // to jedyna chwila, w której da się to zobaczyć, bo za moment wygaśnie.
  await page.getByRole('button', { name: 'Wróć do kalendarza' }).click()
  await expect(page.locator('.blok', { hasText: termin.czas })).toHaveClass(/blok--niedostepny/)

  await juzWygasla(list.bookingId)

  // Kalendarz odzyskuje termin bez żadnego zapisu po drodze: zajętość liczy się
  // zegarem w chwili patrzenia, a nie zadaniem cyklicznym (ADR 0006).
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await wolnyBlokPoDniach(page, OS_KARABINOWA, termin.dni)
  await expect(page.locator('.blok', { hasText: termin.czas })).toHaveClass(/blok--wolny/)

  // Ten sam link, który przed chwilą działał, teraz nie ma czego potwierdzić.
  await page.goto(list.link)
  await expect(page.getByRole('heading', { name: 'Nie potwierdziliśmy adresu' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })
  await expect(page.getByText('wrócił do puli')).toBeVisible()
})

test('powiadomienia wychodzą dopiero po potwierdzeniu adresu — do klienta i do Strzelnicy', async ({
  page,
}) => {
  const email = 'celina.powiadomiona@example.pl'
  await zlozRezerwacje(page, email, DZIEN_POWIADOMIEN, {
    bron: { typ: 'Glock 17', sztuki: 1 },
    amunicja: { rodzaj: '9 × 19 mm Parabellum', sztuki: 50 },
  })

  // Do tej pory poszedł jeden list: ten z linkiem. Rezerwacja oczekująca bywa
  // zmyślona, więc nie ma czego podsumowywać ani czym zawracać głowy obsłudze.
  const doPotwierdzenia = await listyDo(email)
  expect(doPotwierdzenia).toHaveLength(1)
  expect(doPotwierdzenia[0]?.tresc).not.toMatch(LINK_ZARZADZANIA)
  expect(await powiadomieniaOKliencie(email)).toHaveLength(0)

  const list = await przechwyconyList(email)
  await page.goto(list.link)
  await expect(page.getByRole('heading', { name: 'Termin jest Twój' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Klient dostaje list z podsumowaniem, a w nim link do swojej Rezerwacji.
  // Same zdania i wyliczenie sprzętu są pokryte na szwie czystych funkcji —
  // tutaj chodzi o to, że list w ogóle wyszedł i prowadzi tam, gdzie trzeba.
  const podsumowanie = (await listyDo(email)).find((wiadomosc) =>
    wiadomosc.temat.includes('Rezerwacja potwierdzona'),
  )
  expect(podsumowanie?.tresc).toMatch(LINK_ZARZADZANIA)

  // Strzelnica dowiaduje się o Rezerwacji bez zaglądania do Panelu — pod
  // adresem, który ma w konfiguracji. Link do zarządzania jest uprawnieniem
  // klienta, nie jej: przesłany Strzelnicy pozwalałby anulować cudzą
  // Rezerwację jej ręką i z pominięciem Okna anulowania.
  const powiadomienia = await powiadomieniaOKliencie(email)
  expect(powiadomienia).toHaveLength(1)
  expect(powiadomienia[0]?.tresc).not.toMatch(LINK_ZARZADZANIA)

  // Drugie wejście w link niczego nie zmienia, więc nie wysyła też drugiego
  // kompletu listów — ani klientowi, ani Strzelnicy.
  await page.goto(list.link)
  await expect(page.getByText('Ten adres był już potwierdzony')).toBeVisible()
  expect(await listyDo(email)).toHaveLength(2)
  expect(await powiadomieniaOKliencie(email)).toHaveLength(1)
})
