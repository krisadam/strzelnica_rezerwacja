import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { GOSPODARZ_URL, OBCY_GOSPODARZ_URL, WIDGET_URL } from '../playwright.config.js'

// Osadzenie na obcej stronie — własność, której czysta funkcja nie widzi:
// dwa dokumenty, dwie domeny i przeglądarka rozstrzygająca między nimi.
// Reguły budowania nagłówka i protokół komunikatów są przetestowane
// w `packages/shared`; tutaj sprawdzamy, że wszystko jest połączone.

/**
 * Wysokość, przy której ramka zostaje, dopóki Widget nie poda swojej. Wartość
 * jest ustalona w skrypcie osadzającym; rozjazd zatrzyma się na tym teście.
 */
const WYSOKOSC_BEZ_WIDGETU = 600

function wysokoscRamki(page: Page): Promise<number> {
  return page.locator('iframe').evaluate((ramka) => ramka.getBoundingClientRect().height)
}

function goraRamki(page: Page): Promise<number> {
  return page.locator('iframe').evaluate((ramka) => ramka.getBoundingClientRect().top)
}

async function poczekajNaWidget(page: Page) {
  const widget = page.frameLocator('iframe')
  await expect(widget.getByRole('heading', { name: 'Rezerwacja osi' })).toBeVisible()
  // Grafik naprawdę się wczytał, a nie tylko szkielet strony.
  await expect(widget.getByRole('group', { name: 'Wybierz Oś' })).toBeVisible()
  return widget
}

test('Widget działa w ramce na stronie gospodarza i dopasowuje jej wysokość', async ({ page }) => {
  await page.goto(GOSPODARZ_URL)
  const widget = await poczekajNaWidget(page)

  const wysokoscTresci = () =>
    widget.locator('body').evaluate((body) => body.getBoundingClientRect().height)

  await expect
    .poll(async () => {
      const ramka = await wysokoscRamki(page)
      const tresc = await wysokoscTresci()
      // Ramka bierze wysokość z komunikatu Widgetu, zaokrągloną w górę.
      return ramka >= tresc && ramka - tresc < 2
    })
    .toBe(true)
})

test('zmiana dnia przewija stronę gospodarza do góry ramki', async ({ page }) => {
  // Niskie okno, żeby ramka w ogóle dała się wypchnąć ponad ekran — dokładnie
  // sytuacja, w której przewinięcie jest potrzebne.
  await page.setViewportSize({ width: 800, height: 480 })
  await page.goto(GOSPODARZ_URL)
  const widget = await poczekajNaWidget(page)
  await expect.poll(() => wysokoscRamki(page)).not.toBe(WYSOKOSC_BEZ_WIDGETU)

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  expect(await goraRamki(page)).toBeLessThan(0)

  await widget.getByRole('button', { name: 'Następny dzień' }).click()

  await expect.poll(() => goraRamki(page)).toBeGreaterThanOrEqual(-1)
})

test('osadzenie na domenie spoza listy blokuje przeglądarka', async ({ page }) => {
  // Nie reguła budowania nagłówka — ta jest sprawdzona w `packages/shared` —
  // tylko to, że wartość naprawdę pochodzi z listy domen tej Strzelnicy.
  const odpowiedz = await page.request.get(`${WIDGET_URL}/?strzelnica=strzelnica-demo`)
  expect(odpowiedz.headers()['content-security-policy']).toBe(
    `frame-ancestors ${GOSPODARZ_URL}`,
  )

  // Dokument Widgetu wraca także spod adresu, którego serwer nie zna. Gdyby
  // nagłówek wisiał tylko na `/`, taki adres byłby obejściem blokady.
  const zmyslonaSciezka = await page.request.get(
    `${WIDGET_URL}/cokolwiek?strzelnica=strzelnica-demo`,
  )
  expect(zmyslonaSciezka.headers()['content-security-policy']).toBe(
    `frame-ancestors ${GOSPODARZ_URL}`,
  )

  await page.goto(OBCY_GOSPODARZ_URL)

  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Rezerwacja osi' }),
  ).toBeHidden()
  // Bez wczytanego Widgetu nie przychodzi komunikat o wysokości, więc ramka
  // zostaje przy wysokości początkowej.
  expect(await wysokoscRamki(page)).toBe(WYSOKOSC_BEZ_WIDGETU)
})

/**
 * Kształt, jaki skrypt osadzający nadaje ramce (ADR 0014). Wartości stoją tu
 * drugą kopią z tego samego powodu, co wysokość początkowa wyżej: są ustalone
 * w skrypcie osadzającym i rozjazd ma się zatrzymać na tym teście. Promień
 * rzędu jednego piksela albo margines rzędu dwustu byłby tą samą awarią co
 * brak jednego i drugiego.
 */
const PROMIEN_RAMKI = 8
const MARGINES_POZIOMY = 16

/**
 * Ciemny Widget na jasnej stronie gospodarza ma się czytać jako celowa ciemna
 * karta, a nie jak dziura w layoucie (ADR 0014). Kształt nadaje ramce skrypt
 * osadzający, bo stylów gospodarza nie znamy i nic z nich do ramki nie wchodzi.
 */
test('ramka stoi na stronie gospodarza jako karta odsunięta po bokach', async ({ page }) => {
  await page.goto(GOSPODARZ_URL)
  await poczekajNaWidget(page)

  const ksztalt = await page.locator('iframe').evaluate((ramka) => {
    const styl = getComputedStyle(ramka)
    const polozenie = ramka.getBoundingClientRect()
    const gospodarz = ramka.parentElement!.getBoundingClientRect()
    return {
      promien: parseFloat(styl.borderTopLeftRadius),
      lewy: parseFloat(styl.marginLeft),
      prawy: parseFloat(styl.marginRight),
      gora: parseFloat(styl.marginTop),
      dol: parseFloat(styl.marginBottom),
      miesciSie: polozenie.left >= gospodarz.left && polozenie.right <= gospodarz.right,
    }
  })

  expect(ksztalt.promien).toBe(PROMIEN_RAMKI)
  expect(ksztalt.lewy).toBe(MARGINES_POZIOMY)
  expect(ksztalt.prawy).toBe(MARGINES_POZIOMY)
  // Odstęp w pionie wchodziłby w ten sam wymiar, którym rządzi protokół
  // wysokości — stąd go nie ma.
  expect(ksztalt.gora).toBe(0)
  expect(ksztalt.dol).toBe(0)
  // Margines dokłada się do szerokości, więc ramka rozciągnięta na sto procent
  // wystawałaby o niego poza pudełko, w którym postawił ją gospodarz.
  expect(ksztalt.miesciSie).toBe(true)
})

/**
 * Węższa ramka łamie treść Widgetu inaczej, więc zmiana szerokości okna jest
 * zmianą wysokości dokumentu. Protokół obsługuje to tak samo jak zmianę kroku
 * formularza, ale mierzy to dopiero ten test: pozostałe ustawiają okno przed
 * wczytaniem strony.
 */
test('zwężenie okna przestawia wysokość ramki', async ({ page }) => {
  await page.goto(GOSPODARZ_URL)
  const widget = await poczekajNaWidget(page)

  const dopasowana = async () => {
    const ramka = await wysokoscRamki(page)
    const tresc = await widget
      .locator('body')
      .evaluate((body) => body.getBoundingClientRect().height)
    return ramka >= tresc && ramka - tresc < 2
  }

  await expect.poll(dopasowana).toBe(true)

  await page.setViewportSize({ width: 420, height: 900 })

  await expect.poll(dopasowana).toBe(true)
})
