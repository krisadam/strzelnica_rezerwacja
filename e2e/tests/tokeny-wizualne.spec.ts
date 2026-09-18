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
 * Test ma zauważyć, że token zgubił wartość, którą miał przed przeniesieniem,
 * więc ticket przemalowujący moduł poprawia ją tutaj razem z paletą.
 */
const TOKEN = '--wylaczony'
const WARTOSC = '#6b4ea8'

const APLIKACJE = [
  { nazwa: 'Widget', adres: `${WIDGET_URL}/?strzelnica=${STRZELNICA}` },
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

    expect(await zmiennaCss(page, TOKEN)).toBe(WARTOSC)
  })
}
