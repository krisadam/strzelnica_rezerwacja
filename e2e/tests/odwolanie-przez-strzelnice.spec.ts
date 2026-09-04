import { expect, test } from '@playwright/test'
import {
  dzienRezerwacji,
  listyDo,
  OBSLUGA_DEMO,
  OS_PISTOLETOWA,
  otworzWidget,
  wolnyBlokPoDniach,
  zadeklarujPozwolenie,
  zalogujDoPanelu,
  ZIMNY_START_MS,
  zlozIPotwierdz,
} from './pomocniki.js'

/**
 * Odwołanie Rezerwacji przez Strzelnicę — droga od kliknięcia w Panelu do
 * pustego terminu w kalendarzu Widgetu.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że odwołanie naprawdę oddaje
 * termin kalendarzowi, że klient dowiaduje się o nim pocztą wraz z powodem
 * i kontaktem, i że Rezerwacja zostaje w Panelu ze swoim stanem. Same reguły —
 * co da się odwołać i co znaczy odpowiedź bazy — są pokryte
 * w `packages/shared` i nie ma ich tu po raz drugi.
 *
 * Wymaganie powodu jest tu natomiast **jednym kliknięciem**, i nie jest to ta
 * sama rzecz: reguła mówi, że pusty powód nie przechodzi, a to kliknięcie —
 * że formularz w ogóle o powód pyta, zamiast wysyłać wprost. Przycisk
 * odwołujący bez pytania przeszedłby regułę i padłby wyłącznie tutaj.
 *
 * Izolacja tej drogi ma własne miejsce: `izolacja-strzelnic.spec.ts` pyta
 * `revoke_booking` obcym kontem, obok interfejsu — bo Panel, który obcej
 * Rezerwacji nie pokazuje, wygląda tak samo jak baza, która nie da jej odwołać.
 */

/**
 * Dzień, od którego ten test szuka terminu — na własnej wysokości horyzontu;
 * powód stoi przy `zlozRezerwacje`. Oś pistoletowa, bo karabinową na tej
 * głębokości zajmują testy powiadomień.
 */
const DZIEN_ODWOLANIA = 27

/** Powód wpisywany w Panelu; ten sam ma dojść do klienta i zostać w opisie. */
const POWOD = 'Awaria wentylacji na Osi.'

/** Kontakt Strzelnicy demonstracyjnej z seeda — to, co ma wyjść do klienta. */
const TELEFON_STRZELNICY = '+48 123 456 789'

/**
 * Cała ścieżka: złożenie, potwierdzenie, odwołanie w Panelu, poczta, ekran
 * klienta i kalendarz — pięć Edge Functions, każda z własnym zimnym startem.
 */
test.slow()

test('Strzelnica odwołuje Rezerwację z powodem, a klient dowiaduje się mailem', async ({
  page,
}) => {
  const email = 'celina.odwolana@example.pl'
  const { termin, bookingId, linkZarzadzania } = await zlozIPotwierdz(page, {
    os: OS_PISTOLETOWA,
    email,
    odDnia: DZIEN_ODWOLANIA,
  })

  await zalogujDoPanelu(page, OBSLUGA_DEMO)

  // Rezerwacja odszukana filtrami listy — dniem i Osią, bo o tej samej godzinie
  // stoją Rezerwacje innych testów na drugiej Osi.
  await page.getByLabel('Dzień', { exact: true }).fill(await dzienRezerwacji(bookingId))
  await page.getByLabel('Oś', { exact: true }).selectOption({ label: OS_PISTOLETOWA })

  /**
   * Na ten sam termin lista ma czasem kilka wierszy: Rezerwacja zwolniona
   * w poprzednim przebiegu — anulowana, odwołana albo wygasła — zostaje na niej
   * ze swoim stanem, a Blok wraca do puli i bierze go następna. Wyłączność Osi
   * znaczy, że **potwierdzona** jest wśród nich dokładnie jedna, i to ta,
   * którą ten test właśnie złożył.
   */
  const wiersz = page
    .getByRole('row')
    .filter({ hasText: termin.czas })
    .filter({ hasText: 'potwierdzona' })
  await wiersz.getByRole('button').click()
  await expect(page.getByRole('heading', { name: 'Szczegóły Rezerwacji' })).toBeVisible()

  // Powód jest wymagany, więc odwołanie bez niego nie dochodzi nawet do
  // pytania o pewność — a formularz mówi, czego brakuje.
  await page.getByRole('button', { name: 'Odwołaj Rezerwację' }).click()
  await expect(page.getByText('Podaj powód odwołania')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tak, odwołaj' })).toHaveCount(0)

  await page.getByLabel('Powód odwołania').fill(POWOD)
  await page.getByRole('button', { name: 'Odwołaj Rezerwację' }).click()
  await page.getByRole('button', { name: 'Tak, odwołaj' }).click()

  await expect(page.getByText('Odwołaliśmy Rezerwację')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Rezerwacja zostaje w Panelu ze swoim stanem i powodem: dzwoni się właśnie
  // w sprawie tej odwołanej. Formularza już nie ma — nie ma czego odwoływać.
  const opis = page.locator('.opis')
  await expect(opis).toContainText('odwołana przez Strzelnicę')
  await expect(opis).toContainText(POWOD)
  await expect(page.getByRole('button', { name: 'Odwołaj Rezerwację' })).toHaveCount(0)

  // Klient dowiaduje się pocztą — i to jest cała rzecz, po którą ten ekran
  // istnieje: ma nie przyjechać na zamknięty obiekt. List niesie powód
  // i Kontakt Strzelnicy, bo pytanie „ale dlaczego" musi mieć gdzie trafić.
  const [list] = await listyDo(email)
  expect(list?.temat).toContain('Odwołana Rezerwacja')
  expect(list?.tresc).toContain(POWOD)
  expect(list?.tresc).toContain(TELEFON_STRZELNICY)

  // Ten sam powód pod linkiem klienta: list bywa skasowany, a link żyje tak
  // długo jak Rezerwacja.
  await page.goto(linkZarzadzania)
  await expect(page.getByText('Strzelnica odwołała tę Rezerwację')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })
  await expect(page.getByText(POWOD)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Anuluj Rezerwację' })).toHaveCount(0)

  // I termin wrócił do kalendarza, bez żadnego osobnego kroku po drodze.
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await wolnyBlokPoDniach(page, OS_PISTOLETOWA, termin.dni)
  await expect(page.locator('.blok', { hasText: termin.czas })).toHaveClass(/blok--wolny/)
})
