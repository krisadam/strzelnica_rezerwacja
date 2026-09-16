import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { GOSPODARZ_URL, WIDGET_URL } from '../playwright.config.js'
import {
  DRUGA_STRZELNICA,
  OBSLUGA_DRUGIEJ,
  otworzWidget,
  pierwszyWolnyBlok,
  wrocDoPanelu,
  zadeklarujPozwolenie,
  zalogujDoPanelu,
  ZIMNY_START_MS,
} from './pomocniki.js'
import { baza } from './srodowisko.js'

/**
 * Osadzenie Widgetu i dokumenty Strzelnicy — droga od ekranu w Panelu do
 * nagłówka, którym przeglądarka rozstrzyga o osadzeniu, i do regulaminu, który
 * klient czyta przy zgodzie.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że domena dopisana w Panelu
 * wchodzi do nagłówka bez żadnego wdrożenia, że skasowana znika z niego
 * natychmiast, i że przy zgodzie stoi regulamin **tej** Strzelnicy, a nie
 * zdanie ogólne. Samo budowanie nagłówka, znacznika i zastrzeżeń jest pokryte
 * w `packages/shared`; że przeglądarka naprawdę blokuje ramkę spoza listy —
 * w `osadzenie-w-ramce.spec.ts`.
 *
 * Wszystko na **drugiej** Strzelnicy, a nie demonstracyjnej, i jest to
 * konieczność, a nie ostrożność: listą domen demonstracyjnej stoi tamten test
 * osadzenia w ramce, więc skasowanie jej choćby na chwilę zabrałoby mu stronę
 * gospodarza w środku przebiegu. Osadzenie drugiej wraca po przebiegu do stanu
 * z seeda.
 */

/** Strzelnica, na której ten test pracuje — ta sama, co `DRUGA_STRZELNICA`. */
const STRZELNICA_ID = '00000000-0000-0000-0000-000000000002'
const OS_OBCA = 'Oś obcej Strzelnicy nr 2'

/**
 * Domena, której nie ma jak wpisać w zwykłej witrynie, a przeglądarka traktuje
 * ją jak każdą inną: adres IPv6. Stoi tu, bo `normalizeOrigin` ją przepuszcza —
 * więc musi ją przepuścić także `check` w bazie. Wpis odrzucony dopiero tam
 * wracałby awarią zapisu zamiast zastrzeżeniem, i zabierałby ze sobą regulamin,
 * bo zapis idzie w całości.
 */
const DOMENA_IPV6 = 'https://[::1]:8080'

/** Regulamin i polityka wpisywane w Panelu — po nich poznaje się je w Widgecie. */
const REGULAMIN = 'Na tej Osi obowiązuje regulamin obcej Strzelnicy, a nie ogólny.'
const POLITYKA = 'https://strzelnica-druga.example.pl/prywatnosc'

/** Wołanie Edge Function przechodzi przez jej zimny start, a tych jest tu kilka. */
test.slow()

/**
 * Osadzenie drugiej Strzelnicy z seeda: żadnej dozwolonej domeny i żadnych
 * dokumentów. Przywracane po przebiegu, bo dla testów izolacji ta Strzelnica
 * jest wierszem, który ma stać nietknięty.
 */
const OSADZENIE_SEEDA = { allowed_origins: [], terms_text: '', privacy_url: '' }

async function przywrocOsadzenie(): Promise<void> {
  await baza(`facilities?id=eq.${STRZELNICA_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(OSADZENIE_SEEDA),
  })
}

/** Nagłówek, którym serwer Widgetu odpowiada o osadzeniu tej Strzelnicy. */
async function naglowekOsadzenia(page: Page, slug: string): Promise<string | undefined> {
  const odpowiedz = await page.request.get(`${WIDGET_URL}/?strzelnica=${slug}`)
  return odpowiedz.headers()['content-security-policy']
}

// Przywracanie także **przed** przebiegiem: przebieg przerwany w połowie
// zostawia cudzą domenę na liście.
test.beforeEach(przywrocOsadzenie)
test.afterAll(przywrocOsadzenie)

test('domena z Panelu wpuszcza Widget na stronę, a skasowana zabiera go z niej', async ({
  page,
}) => {
  await zalogujDoPanelu(page, OBSLUGA_DRUGIEJ)
  const osadzenie = page.locator('.konfiguracja').filter({ hasText: 'Osadzenie i dokumenty' })

  // Znacznik jest gotowy do skopiowania od razu — składa się z adresu Widgetu
  // i identyfikatora Strzelnicy, więc nie ma na co czekać ani czego wypełniać.
  await expect(osadzenie.getByLabel('Znacznik osadzenia')).toHaveValue(
    `<script src="${WIDGET_URL}/embed.js" data-strzelnica="${DRUGA_STRZELNICA}"></script>`,
  )

  // Dopóki lista jest pusta, nie osadzi się nigdzie — i ekran mówi to wprost,
  // zamiast pokazywać pustkę do zinterpretowania.
  await expect(osadzenie.getByText('Żadna strona nie może osadzić')).toBeVisible()
  expect(await naglowekOsadzenia(page, DRUGA_STRZELNICA)).toBe("frame-ancestors 'none'")

  // Wpis, który domeną nie jest, zatrzymuje się na liście, a nie przy zapisie:
  // lista jest tym, co obsługa ogląda, więc ma na niej stać dokładnie to, co
  // pojedzie do nagłówka.
  await osadzenie.getByLabel('Domena', { exact: true }).fill('strzelnica-druga.example.pl')
  await osadzenie.getByRole('button', { name: 'Dodaj domenę' }).click()
  await expect(osadzenie.getByText('To nie jest domena')).toBeVisible()

  await osadzenie.getByLabel('Domena', { exact: true }).fill(`${GOSPODARZ_URL}/`)
  await osadzenie.getByRole('button', { name: 'Dodaj domenę' }).click()
  // Adres sprowadzony do samego źródła, bo tylko taki rozumie `frame-ancestors`.
  await expect(osadzenie.getByRole('listitem').filter({ hasText: GOSPODARZ_URL })).toBeVisible()

  await osadzenie.getByLabel('Domena', { exact: true }).fill(DOMENA_IPV6)
  await osadzenie.getByRole('button', { name: 'Dodaj domenę' }).click()

  await osadzenie.getByLabel('Treść regulaminu').fill(REGULAMIN)
  await osadzenie.getByLabel('Adres polityki prywatności').fill(POLITYKA)
  await osadzenie.getByRole('button', { name: 'Zapisz osadzenie i dokumenty' }).click()
  await expect(page.getByText('Osadzenie i dokumenty zapisane')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // I nagłówek mówi to samo, co lista — bez wdrożenia i bez czekania.
  expect(await naglowekOsadzenia(page, DRUGA_STRZELNICA)).toBe(
    `frame-ancestors ${GOSPODARZ_URL} ${DOMENA_IPV6}`,
  )

  // Klient czyta przy zgodzie dokumenty **tej** Strzelnicy, a nie zdanie
  // ogólne: regulamin stoi do rozwinięcia, polityka prowadzi pod jej adres.
  await otworzWidget(page, DRUGA_STRZELNICA)
  await zadeklarujPozwolenie(page)
  const blok = await pierwszyWolnyBlok(page, OS_OBCA)
  await blok.click()
  await page.getByText('Regulamin Strzelnicy').click()
  await expect(page.getByText(REGULAMIN)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Polityka prywatności Strzelnicy' })).toHaveAttribute(
    'href',
    POLITYKA,
  )

  // Skasowanie domeny zabiera Widget z tamtej strony natychmiast. Że blokuje
  // go potem sama przeglądarka, mówi `osadzenie-w-ramce.spec.ts`; tutaj chodzi
  // o to, że dostaje ona listę bez tej domeny od razu po zapisie.
  await wrocDoPanelu(page)
  await expect(osadzenie.getByLabel('Treść regulaminu')).toHaveValue(REGULAMIN)
  await osadzenie.getByRole('button', { name: `Usuń ${GOSPODARZ_URL}` }).click()
  await osadzenie.getByRole('button', { name: `Usuń ${DOMENA_IPV6}` }).click()
  await osadzenie.getByRole('button', { name: 'Zapisz osadzenie i dokumenty' }).click()
  await expect(page.getByText('Osadzenie i dokumenty zapisane')).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  expect(await naglowekOsadzenia(page, DRUGA_STRZELNICA)).toBe("frame-ancestors 'none'")

  // Dokumenty zostają: skasowana była domena, a nie regulamin — jeden przycisk
  // zapisuje wszystko naraz, więc to jest ta chwila, w której rozjazd by się
  // pokazał.
  const [wiersz] = await baza<{ terms_text: string; privacy_url: string }[]>(
    `facilities?id=eq.${STRZELNICA_ID}&select=terms_text,privacy_url`,
  )
  expect(wiersz).toEqual({ terms_text: REGULAMIN, privacy_url: POLITYKA })
})
