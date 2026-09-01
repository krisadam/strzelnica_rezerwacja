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
