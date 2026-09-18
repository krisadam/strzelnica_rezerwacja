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
 * Wartość stoi tu drugą kopią świadomie — to ona jest przedmiotem asercji.
 * Test ma zauważyć, że token zgubił wartość, którą ma mieć w swojej palecie,
 * więc każdy ticket ruszający paletę poprawia ją tutaj razem z nią.
 */
const TOKEN = '--wylaczony'
const WYLACZONY_CIEMNY = '#a98be0'
const WYLACZONY_JASNY = '#6b4ea8'

const WIDGET = `${WIDGET_URL}/?strzelnica=${STRZELNICA}`

/**
 * Ciemna paleta modułu (ADR 0014) stoi w arkuszu tokenów obok jasnej, a włącza
 * ją atrybut `data-motyw` na korzeniu dokumentu. Obie aplikacje weszły w nią
 * osobnymi ticketami i obie ten atrybut u siebie ustawiają — moduł ma jedną
 * skórę. Przejściowy rozjazd, w którym Panel był jeszcze jasny, skończył się
 * wraz z jego przemalowaniem; test pilnuje teraz, żeby żadna z aplikacji nie
 * wróciła na jasną paletę mimochodem.
 */
const APLIKACJE = [
  { nazwa: 'Widget', adres: WIDGET },
  { nazwa: 'Panel', adres: PANEL_URL },
]

function zmiennaCss(page: Page, nazwa: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    nazwa,
  )
}

for (const { nazwa, adres } of APLIKACJE) {
  test(`${nazwa} zna tokeny wizualne modułu`, async ({ page }) => {
    await page.goto(adres)

    expect(await page.locator('html').getAttribute('data-motyw')).toBe('ciemny')
    expect(await zmiennaCss(page, TOKEN)).toBe(WYLACZONY_CIEMNY)
  })

  /**
   * Natywne kontrolki — pola liczbowe, pola wyboru, listy wyboru, suwaki — nie
   * biorą koloru z palety, tylko z tego, co strona zadeklaruje przeglądarce.
   * Bez tej deklaracji formularze stoją białymi polami na granacie i jest to
   * awaria widoczna wyłącznie okiem: żaden token nie ma złej wartości.
   */
  test(`${nazwa} zapowiada przeglądarce ciemne kontrolki`, async ({ page }) => {
    await page.goto(adres)

    const schemat = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    )

    expect(schemat).toBe('dark')
  })
}

/**
 * Paleta jasna została w arkuszu tokenów jako wariant dokumentu bez
 * przełącznika, choć nie pokazuje jej dziś żadna aplikacja. Póki tam stoi, ma
 * działać: wariant, który przestał malować, a nikt tego nie zauważył, jest
 * dokładnie tą cichą awarią, przed którą stoi cały ten plik. Tego, czy
 * przełącznik przemalowuje wyrenderowany dokument, nie orzeknie test
 * jednostkowy przy arkuszu — on czyta wartości, a nie stronę.
 */
test('dokument bez przełącznika bierze paletę jasną', async ({ page }) => {
  await page.goto(PANEL_URL)

  await page.evaluate(() => document.documentElement.removeAttribute('data-motyw'))

  expect(await zmiennaCss(page, TOKEN)).toBe(WYLACZONY_JASNY)
})
