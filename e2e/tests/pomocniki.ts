import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const STRZELNICA = 'strzelnica-demo'
export const OS_PISTOLETOWA = 'Oś pistoletowa nr 1'
export const OS_KARABINOWA = 'Oś karabinowa nr 2'

/**
 * Ile dni w przód wolno szukać wolnego terminu. Rozkład seeda ma Bloki
 * codziennie, więc kilka dni wystarcza z zapasem na dzień zamknięty, minimalne
 * wyprzedzenie i Bloki zajęte przez inne testy.
 */
const DNI_SZUKANIA = 8

/**
 * Ile czekać na pierwszą odpowiedź Edge Function. Domyślne pięć sekund nie
 * starcza na jej zimny start — środowisko brzegowe wstaje wtedy od zera
 * i ściąga zależności funkcji. Wydłużenie należy do tego jednego oczekiwania,
 * nie do całego przebiegu: globalne opóźniałoby każdą asercję, która pada.
 */
export const ZIMNY_START_MS = 20_000

export async function otworzWidget(page: Page): Promise<void> {
  await page.goto(`/?strzelnica=${STRZELNICA}`)
  await expect(page.getByRole('heading', { name: 'Rezerwacja osi' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Wybierz Oś' })).toBeVisible()
}

/**
 * Pierwszy wolny Blok wskazanej Osi, szukany dzień po dniu od dzisiaj. Testy
 * celują w terminy względne wobec „teraz" — zegara nikt tu nie zamraża, bo
 * zamrożenie w przeglądarce nie zamraża zegara bazy.
 *
 * Dwa konteksty przechodzące tę samą drogę trafiają na ten sam Blok — na tym
 * stoi test wyścigu.
 */
export async function pierwszyWolnyBlok(page: Page, os: string): Promise<Locator> {
  await page.getByRole('radio', { name: os }).check()

  for (let krok = 0; krok < DNI_SZUKANIA; krok += 1) {
    const wolne = page.getByRole('button', { name: 'wolny' })
    if ((await wolne.count()) > 0) return wolne.first()
    await page.getByRole('button', { name: 'Następny dzień' }).click()
  }

  throw new Error(`Osi „${os}" nie ma wolnego Bloku w najbliższych ${DNI_SZUKANIA} dniach.`)
}

/** Godzina Bloku, po której poznaje się go później w kalendarzu. */
export function czasBloku(blok: Locator): Promise<string> {
  return blok.locator('.blok__czas').innerText()
}

export async function wypelnijFormularz(
  page: Page,
  dane: { uczestnicy: number; imie: string; email: string; telefon: string },
): Promise<void> {
  await page.getByLabel('Liczba Uczestników').fill(String(dane.uczestnicy))
  await page.getByLabel('Imię i nazwisko').fill(dane.imie)
  await page.getByLabel('Adres e-mail').fill(dane.email)
  await page.getByLabel('Telefon').fill(dane.telefon)
  await page.getByLabel('Akceptuję regulamin').check()
  await page.getByRole('button', { name: 'Dalej' }).click()
  await expect(page.getByRole('heading', { name: 'Sprawdź, zanim wyślesz' })).toBeVisible()
}
