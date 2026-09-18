import type { Locator } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  dzienRezerwacji,
  OBSLUGA_DEMO,
  OS_PISTOLETOWA,
  otworzWidget,
  pierwszyWolnyBlok,
  REZERWACJA_DEMO,
  zadeklarujPozwolenie,
  zalogujDoPanelu,
} from './pomocniki.js'

/**
 * Chwyt „duża liczba, drobna jednostka" — Kwota do zapłaty w Widgecie i sumy
 * dziennego Zestawienia w Panelu.
 *
 * Podział napisu ma pokrycie w `packages/shared` i nie jest tu sprawdzany po
 * raz drugi. Tutaj chodzi o dwie rzeczy, których czysta funkcja z definicji
 * nie zobaczy: czy liczba jest naprawdę **wybita** — bo nazwa klasy nie jest
 * wielkością, a arkusz może jej nie mieć — i czy napis czytany z elementu
 * został po rozbiciu na kawałki taki sam. To drugie jest jedynym ryzykiem tej
 * zmiany: rusza ona drzewo dokumentu pod tekstem, który czyta zarówno czytnik
 * ekranu, jak i testy Kwoty.
 */

/** Wielkość kroju elementu w pikselach — tym, czym mierzy ją przeglądarka. */
function wielkosc(element: Locator): Promise<number> {
  return element.evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize))
}

/**
 * Chwyt naprawdę wybija liczbę: cyfry są wyraźnie większe od jednostki przy
 * nich, a jednostka nie większa od tekstu, w którym stoi.
 */
async function wybija(chwyt: Locator): Promise<void> {
  const liczba = chwyt.locator('.duza-liczba')
  const jednostka = chwyt.locator('.duza-liczba__jednostka')

  await expect(liczba).toBeVisible()
  expect(await wielkosc(liczba)).toBeGreaterThan(1.5 * (await wielkosc(jednostka)))
  expect(await wielkosc(jednostka)).toBeLessThanOrEqual(await wielkosc(chwyt))
}

test('Kwota do zapłaty w Widgecie jest dużą liczbą z drobną walutą', async ({ page }) => {
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)
  await (await pierwszyWolnyBlok(page, OS_PISTOLETOWA)).click()

  const kwota = page.locator('.kwota__razem strong')
  await expect(kwota).toBeVisible()

  // Napis co do znaku taki, jaki pisze `formatAmount`: stawka za Blok Osi
  // pistoletowej z seeda, a przed walutą odstęp nierozdzielający — ten sam,
  // który stał tam, gdy Kwota była jednym elementem. Asercja wprost, bez
  // wzorca ze swobodnym odstępem, bo przedmiotem jest tu właśnie odstęp.
  expect(await kwota.textContent()).toBe('120,00\u00a0zł')
  await expect(kwota.locator('.duza-liczba')).toHaveText('120,00')

  await wybija(kwota)

  // Chwyt działa dlatego, że jest rzadki: Kwota jest w Widgecie jedyną liczbą,
  // po którą Osoba rezerwująca schodzi wzrokiem na dół formularza. Składniki
  // rachunku tuż nad nią mówią, z czego Kwota się wzięła, i wybite byłyby
  // czterema Kwotami zamiast jednej.
  await expect(page.locator('.duza-liczba')).toHaveCount(1)
})

test('sumy Zestawienia w Panelu podane są tym samym chwytem', async ({ page }) => {
  await zalogujDoPanelu(page, OBSLUGA_DEMO)
  await page.getByLabel('Dzień kalendarza').fill(await dzienRezerwacji(REZERWACJA_DEMO))

  const zestawienie = page.locator('.zestawienie')
  const pozycja = zestawienie.locator('.zestawienie__ile').filter({ hasText: 'CZ Shadow 2' })
  await expect(pozycja).toBeVisible()

  // Pozycja Zestawienia czyta się tak samo jak opis Rezerwacji, z którego się
  // wzięła — to jeden napis ze słownika Panelu, rozłożony na kawałki dopiero
  // przy rysowaniu. Sztuk nie wpisujemy: Osi są dwie, a testów rezerwujących
  // więcej, więc suma dnia bywa cudza.
  expect(await pozycja.textContent()).toMatch(/^CZ Shadow 2 — \d+ szt\.$/)
  await expect(pozycja.locator('.duza-liczba__jednostka')).toHaveText(' szt.')

  await wybija(pozycja)

  // Rzadkość jak w Widgecie: chwyt mają sumy Zestawienia i nic poza nimi. Pod
  // każdą sumą stoją Rezerwacje, z których wyszła, a nad nią kalendarz całego
  // dnia — liczb na tym ekranie jest dużo, a wybite są trzy sumy: broń,
  // amunicja i Instruktor. Tyle, ile grup, bo tego dnia każda ma czym stać;
  // liczba sztuk w nich bywa cudza, sam fakt sumy nie.
  await expect(zestawienie.locator('.duza-liczba')).toHaveCount(3)
  await expect(page.locator('.duza-liczba')).toHaveCount(3)
})
