import { expect, test } from '@playwright/test'
import {
  ADRES_POWIADOMIEN,
  juzWygasla,
  LINK_ZARZADZANIA,
  listyDo,
  otworzWidget,
  OS_KARABINOWA,
  przechwyconyList,
  wolnyBlokPoDniach,
  zadeklarujPozwolenie,
  zlozRezerwacje,
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
 * Dni, od których te testy zaczynają szukać terminu — każdy na własnej
 * wysokości horyzontu; powód stoi przy `zlozRezerwacje`.
 */
const DZIEN_POTWIERDZENIA = 16
const DZIEN_WYGASNIECIA = 22
const DZIEN_POWIADOMIEN = 27

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
  await zlozRezerwacje(page, { os: OS_KARABINOWA, email, odDnia: DZIEN_POTWIERDZENIA })

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
  const termin = await zlozRezerwacje(page, {
    os: OS_KARABINOWA,
    email,
    odDnia: DZIEN_WYGASNIECIA,
  })
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
  await zlozRezerwacje(page, {
    os: OS_KARABINOWA,
    email,
    odDnia: DZIEN_POWIADOMIEN,
    sprzet: {
      bron: { typ: 'Glock 17', sztuki: 1 },
      amunicja: { rodzaj: '9 × 19 mm Parabellum', sztuki: 50 },
    },
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
