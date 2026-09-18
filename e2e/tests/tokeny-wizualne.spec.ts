import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { PANEL_URL, WIDGET_URL } from '../playwright.config.js'
import { STRZELNICA } from './pomocniki.js'

// Paleta stoi w jednym pliku w `packages/shared`, a oba arkusze go importują.
// Nierozwiązywalny import przerywa build, więc do testu zostaje awaria cichsza:
// arkusz dotarł do jednej aplikacji, a do drugiej w okrojonej postaci. Zmienne
// wtedy nie powstają, odwołania do nich przestają cokolwiek malować, a strona
// renderuje się dalej — bez błędu i bez ostrzeżenia.
//
// Obie aplikacje sprawdzamy osobno: mają osobne konfiguracje budowania, więc
// rozwiązanie importu może zadziałać w jednej i nie zadziałać w drugiej. Widget
// w ramce na stronie gospodarza nie potrzebuje trzeciej asercji — ramka ładuje
// ten sam build, co asercja pierwsza.

/**
 * Kolor rzeczy wyjętych ze sprzedaży — Blokady, Osi wyłączonej, pozycji
 * katalogu wycofanej. Świadek wybrany spośród tokenów dlatego, że przed
 * wyciągnięciem palety do wspólnego pliku miał go wyłącznie Panel: arkusz
 * okrojony do dawnej zawartości Widgetu odda tu pustą wartość.
 *
 * Wartości stoją tu drugą kopią świadomie — to one są przedmiotem asercji.
 * Test ma zauważyć, że token zgubił wartość, którą ma mieć w swojej palecie,
 * więc każdy ticket ruszający paletę poprawia je tutaj razem z nią.
 */
const TOKEN = '--wylaczony'
const WYLACZONY_JASNY = '#6b4ea8'
const WYLACZONY_CIEMNY = '#a98be0'

const WIDGET = `${WIDGET_URL}/?strzelnica=${STRZELNICA}`

/**
 * Ciemna paleta modułu (ADR 0014) stoi w arkuszu tokenów obok jasnej, a włącza
 * ją atrybut `data-motyw` na korzeniu dokumentu. Widget wszedł w nią własnym
 * ticketem i ustawia ten atrybut u siebie; Panel czeka na swój bliźniaczy
 * ticket i dlatego renderuje się dalej jasny. Ta różnica jest zamierzona
 * i przejściowa — test pilnuje jej w obie strony, żeby żadna z aplikacji nie
 * przeskoczyła na drugą paletę mimochodem.
 */
const APLIKACJE = [
  { nazwa: 'Widget', adres: WIDGET, motyw: 'ciemny', wartosc: WYLACZONY_CIEMNY },
  { nazwa: 'Panel', adres: PANEL_URL, motyw: null, wartosc: WYLACZONY_JASNY },
]

function zmiennaCss(page: Page, nazwa: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    nazwa,
  )
}

for (const { nazwa, adres, motyw, wartosc } of APLIKACJE) {
  test(`${nazwa} zna tokeny wizualne modułu`, async ({ page }) => {
    await page.goto(adres)

    expect(await page.locator('html').getAttribute('data-motyw')).toBe(motyw)
    expect(await zmiennaCss(page, TOKEN)).toBe(wartosc)
  })
}

/**
 * Przełącznik ma działać także tam, gdzie go dziś nikt nie ustawia: Panel
 * bierze ciemną paletę w chwili, gdy atrybut się pojawi. To jedyna rzecz,
 * której nie policzy test jednostkowy przy arkuszu tokenów — czy przełącznik
 * faktycznie przemalowuje wyrenderowany dokument.
 */
test('Panel daje się przełączyć na ciemną paletę', async ({ page }) => {
  await page.goto(PANEL_URL)

  await page.evaluate(() => document.documentElement.setAttribute('data-motyw', 'ciemny'))

  expect(await zmiennaCss(page, TOKEN)).toBe(WYLACZONY_CIEMNY)
})

/**
 * Natywne kontrolki — pola liczbowe, pola wyboru, suwaki — nie biorą koloru
 * z palety, tylko z tego, co strona zadeklaruje przeglądarce. Bez tej
 * deklaracji formularz rezerwacji renderuje się białymi polami na granacie
 * i jest to awaria widoczna wyłącznie okiem: żaden token nie ma złej wartości.
 */
test('Widget zapowiada przeglądarce ciemne kontrolki', async ({ page }) => {
  await page.goto(WIDGET)

  const schemat = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)

  expect(schemat).toBe('dark')
})
