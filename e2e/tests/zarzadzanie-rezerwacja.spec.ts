import { expect, test } from '@playwright/test'
import {
  ADRES_POWIADOMIEN,
  juzZaPozno,
  listyDo,
  otworzWidget,
  OS_PISTOLETOWA,
  wolnyBlokPoDniach,
  zadeklarujPozwolenie,
  zlozIPotwierdz,
  ZIMNY_START_MS,
} from './pomocniki.js'

/**
 * Zarządzanie Rezerwacją przez link — ścieżka od listu z podsumowaniem do
 * zwolnionego terminu.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że link z listu prowadzi do
 * własnej Rezerwacji i wyłącznie do niej, że anulowanie naprawdę oddaje termin
 * kalendarzowi i że obsługa dowiaduje się o tym pocztą. Sama reguła Okna
 * anulowania — do kiedy wolno, także co do sekundy na granicy — jest pokryta
 * w `packages/shared` i nie jest tu sprawdzana po raz drugi.
 */

/**
 * Dni, od których te testy zaczynają szukać terminu — każdy na własnej
 * wysokości horyzontu; powód stoi przy `zlozRezerwacje`. Oś pistoletowa, bo
 * karabinową na tej głębokości zajmują testy potwierdzenia.
 */
const DZIEN_ANULOWANIA = 16
const DZIEN_PO_OKNIE = 22

/**
 * Oba testy jadą całą ścieżką: złożenie, potwierdzenie, odczyt i anulowanie —
 * cztery Edge Functions, każda z własnym zimnym startem. Domyślne trzydzieści
 * sekund na test nie starcza na tyle pierwszych odpowiedzi, a `test.slow()`
 * mówi to Playwrightowi raz, zamiast podnosić limit przy każdej asercji.
 */
test.slow()

/** Powiadomienia Strzelnicy dotyczące tego jednego klienta. */
function powiadomieniaOKliencie(email: string) {
  return listyDo(ADRES_POWIADOMIEN).then((listy) =>
    listy.filter((wiadomosc) => wiadomosc.tresc.includes(email)),
  )
}

test('link z podsumowania pokazuje Rezerwację, a anulowanie zwalnia termin', async ({ page }) => {
  const email = 'celina.anuluje@example.pl'
  const { termin, linkZarzadzania } = await zlozIPotwierdz(page, {
    os: OS_PISTOLETOWA,
    email,
    odDnia: DZIEN_ANULOWANIA,
    sprzet: {
      bron: { typ: 'Glock 17', sztuki: 1 },
      amunicja: { rodzaj: '9 × 19 mm Parabellum', sztuki: 50 },
    },
  })

  await page.goto(linkZarzadzania)
  await expect(page.getByRole('heading', { name: 'Szczegóły Twojej Rezerwacji' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Wszystkie szczegóły wraz z Kwotą — po to Osoba rezerwująca tu wraca.
  // Wyliczenie Kwoty jest pokryte na szwie czystych funkcji; tutaj chodzi o to,
  // że stoi na ekranie razem z resztą zamówienia.
  await expect(page.getByText(termin.czas)).toBeVisible()
  await expect(page.getByText(OS_PISTOLETOWA)).toBeVisible()
  await expect(page.getByText('Glock 17')).toBeVisible()
  await expect(page.getByText('9 × 19 mm Parabellum')).toBeVisible()
  await expect(page.locator('.kwota__razem')).toContainText(/zł/)
  // Kontakt do Strzelnicy stoi tu zawsze, nie tylko po upływie okna.
  await expect(page.getByRole('heading', { name: 'Kontakt do Strzelnicy' })).toBeVisible()

  // Anulowanie pyta raz, bo zwolniony termin bierze pierwszy chętny.
  await page.getByRole('button', { name: 'Anuluj Rezerwację' }).click()
  await page.getByRole('button', { name: 'Tak, anuluj' }).click()

  await expect(page.getByText('Anulowaliśmy Twoją Rezerwację')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })
  // Po anulowaniu nie ma już czego anulować — przycisk znika razem z powodem.
  await expect(page.getByRole('button', { name: 'Anuluj Rezerwację' })).toHaveCount(0)

  // Strzelnica dowiaduje się o tym pocztą, bez zaglądania do Panelu. Dwa listy
  // o tym kliencie: powiadomienie o nowej Rezerwacji i to o anulowaniu.
  const powiadomienia = await powiadomieniaOKliencie(email)
  expect(powiadomienia.map((wiadomosc) => wiadomosc.temat.split(' —')[0])).toEqual([
    'Anulowana Rezerwacja',
    'Nowa Rezerwacja',
  ])

  // I to jest cała rzecz, o którą chodzi: termin wrócił do kalendarza, bez
  // żadnego zadania cyklicznego po drodze.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await wolnyBlokPoDniach(page, OS_PISTOLETOWA, termin.dni)
  await expect(page.locator('.blok', { hasText: termin.czas })).toHaveClass(/blok--wolny/)
})

test('podmiana identyfikatora w adresie nie otwiera cudzej Rezerwacji', async ({ page }) => {
  const email = 'celina.podglada@example.pl'
  const { bookingId, linkZarzadzania } = await zlozIPotwierdz(page, {
    os: OS_PISTOLETOWA,
    email,
    odDnia: DZIEN_PO_OKNIE,
  })

  // Identyfikator Rezerwacji jest tym, co Osoba rezerwująca ma pod ręką: widzi
  // go na ekranie potwierdzenia. Podstawiony w miejsce tokenu nie otwiera nic
  // — i to jest właśnie powód, dla którego link niesie token, a nie numer.
  await page.goto(linkZarzadzania.replace(/rezerwacja=[0-9a-f]+/, `rezerwacja=${bookingId}`))
  await expect(page.getByText('Nie znamy tego linku')).toBeVisible({ timeout: ZIMNY_START_MS })
  await expect(page.getByRole('button', { name: 'Anuluj Rezerwację' })).toHaveCount(0)

  // Ten sam link po upływie Okna anulowania: Rezerwacja stoi i jest widoczna
  // w całości, ale zwolnić termin może już tylko Strzelnica — i klient dostaje
  // jej numer, a nie samą odmowę.
  await juzZaPozno(bookingId)
  await page.goto(linkZarzadzania)
  await expect(page.getByRole('heading', { name: 'Szczegóły Twojej Rezerwacji' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })
  await expect(page.getByText('Okno anulowania minęło')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Anuluj Rezerwację' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '+48 123 456 789' })).toBeVisible()
})
