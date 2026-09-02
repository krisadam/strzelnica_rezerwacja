import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  czasBloku,
  juzWygasla,
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

/** Ile dni od swojego początku test przegląda w poszukiwaniu wolnego Bloku. */
const DNI_SZUKANIA = 5

/**
 * Termin Rezerwacji zapamiętany tak, żeby dało się do niego wrócić po
 * przeładowaniu strony: sama godzina nie wystarczy, bo kalendarz wstaje na
 * dzisiaj, a wolny Blok bywa za kilka dni.
 */
type Termin = { czas: string; dni: number }

/** Złożenie Rezerwacji na pierwszym wolnym Bloku Osi karabinowej od wskazanego dnia. */
async function zlozRezerwacje(page: Page, email: string, odDnia: number): Promise<Termin> {
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
  })
  await page.getByRole('button', { name: 'Rezerwuję' }).click()

  await expect(page.getByRole('heading', { name: 'Sprawdź skrzynkę' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  return { czas, dni }
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
