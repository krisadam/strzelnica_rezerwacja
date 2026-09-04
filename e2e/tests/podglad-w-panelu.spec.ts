import { expect, test } from '@playwright/test'
import { PANEL_URL } from '../playwright.config.js'
import {
  HASLO_PANELU,
  KLIENT_DEMO,
  OBSLUGA_DEMO,
  OS_KARABINOWA,
  OS_PISTOLETOWA,
  REZERWACJA_DEMO,
  zalogujDoPanelu,
} from './pomocniki.js'
import { baza, bazaAnonimowo, bazaJakoUzytkownikPanelu } from './srodowisko.js'

/**
 * Panel: logowanie i podgląd Rezerwacji.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że konto naprawdę otwiera dane
 * swojej Strzelnicy i że bez konta nie widać ich wcale. To są własności RLS
 * i widoku `panel_bookings`, nie logiki.
 *
 * Druga strona tego samego — że konto nie otwiera **niczego** obcego — ma
 * własny plik, `izolacja-strzelnic.spec.ts`: tam pytania idą obok interfejsu,
 * bo tylko tak widać, czy odcina je baza, czy ekran.
 *
 * Układanie Rezerwacji w kalendarz i zawężanie listy filtrami mają własne
 * pokrycie w `packages/shared`, więc tutaj nie ma ich po raz drugi. Tu chodzi
 * o to, czy te ekrany dostają cokolwiek do ułożenia.
 */

const OS_PISTOLETOWA_ID = '00000000-0000-0000-0000-0000000000a1'

/**
 * Dzień, na który seed wystawił swoją Rezerwację — czytany z bazy, a nie
 * przeliczany tutaj z reguły seeda. Termin jest ruchomy (pierwszy poniedziałek
 * oddalony o co najmniej dwa tygodnie), a druga kopia rachunku rozjechałaby się
 * z pierwszą przy pierwszej zmianie danych demo.
 *
 * Dzień liczony w strefie Strzelnicy, tak samo jak liczy go Panel: Blok
 * zaczynający się o 10:00 czasu warszawskiego bywa poprzednim dniem w UTC.
 */
async function dzienRezerwacjiDemo(): Promise<string> {
  const [wiersz] = await baza<{ starts_at: string }[]>(
    `bookings?id=eq.${REZERWACJA_DEMO}&select=starts_at`,
  )
  if (!wiersz) throw new Error('Seed nie wstawił Rezerwacji demonstracyjnej.')

  // `sv-SE` daje zapis `RRRR-MM-DD` — dokładnie ten, którego oczekuje pole daty.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(wiersz.starts_at))
}

test('bez zalogowania Panel nie pokazuje żadnych danych Strzelnicy', async ({ page }) => {
  await page.goto(PANEL_URL)

  await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kalendarz dnia' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Lista Rezerwacji' })).toBeHidden()
  await expect(page.getByText(KLIENT_DEMO)).toBeHidden()
})

/**
 * Widok jest oknem, a okno się nie otwiera. Prosty widok nad jedną tabelą jest
 * w Postgresie zapisywalny sam z siebie, a Supabase nadaje domyślnie komplet
 * praw każdej nowej relacji — więc bez świadomego odebrania ich klucz anonimowy
 * kasuje Rezerwacje przez `lane_occupancy`, a Panel pisze do `bookings` przez
 * `panel_bookings`, omijając Edge Functions razem z całą walidacją (ADR 0003).
 *
 * Czysta funkcja tego nie zobaczy: to własność uprawnień, nie logiki.
 */
test('widoki zajętości i Panelu są oknami wyłącznie do odczytu', async () => {
  const anonimowe = await bazaAnonimowo(
    `lane_occupancy?lane_id=eq.${OS_PISTOLETOWA_ID}`,
    { method: 'DELETE' },
  )
  expect(anonimowe.ok).toBe(false)

  const panelu = await bazaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    `panel_bookings?id=eq.${REZERWACJA_DEMO}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participants: 9 }),
    },
  )
  expect(panelu.ok).toBe(false)

  // Rezerwacja z seeda stoi nietknięta — obie odmowy były odmowami, a nie
  // cichym niepowodzeniem zapisu, który i tak by przeszedł.
  const [wiersz] = await baza<{ participants: number }[]>(
    `bookings?id=eq.${REZERWACJA_DEMO}&select=participants`,
  )
  expect(wiersz?.participants).toBe(2)
})

test('Użytkownik panelu widzi Rezerwację w kalendarzu, na liście i w szczegółach', async ({
  page,
}) => {
  await zalogujDoPanelu(page, OBSLUGA_DEMO)
  await expect(page.getByText('Strzelnica Demo')).toBeVisible()

  // Kalendarz staje na dniu Rezerwacji z seeda i pokazuje ją pod jej Osią.
  await page.getByLabel('Dzień kalendarza').fill(await dzienRezerwacjiDemo())

  const pistoletowa = page.getByRole('region').filter({ has: page.getByRole('heading', { name: OS_PISTOLETOWA }) })
  await expect(pistoletowa.getByText(KLIENT_DEMO)).toBeVisible()

  // Oś jest wyłączna, więc ta sama Rezerwacja nie może stać pod drugą.
  const karabinowa = page.getByRole('region').filter({ has: page.getByRole('heading', { name: OS_KARABINOWA }) })
  await expect(karabinowa.getByText(KLIENT_DEMO)).toBeHidden()

  // Filtr Osi jest podpięty do listy, a nie tylko stoi na ekranie. Jedno
  // przełączenie, bo samo zawężanie ma pokrycie w `packages/shared` — tutaj
  // sprawdzamy połączenie kontrolki z regułą, a nie regułę.
  await page.getByLabel('Oś', { exact: true }).selectOption({ label: OS_KARABINOWA })
  await expect(page.getByRole('table').getByText(KLIENT_DEMO)).toBeHidden()

  await page.getByLabel('Oś', { exact: true }).selectOption({ label: OS_PISTOLETOWA })
  const wiersz = page.getByRole('row').filter({ hasText: KLIENT_DEMO })
  await expect(wiersz).toBeVisible()

  // Szczegóły: wszystko, z czego obsługa przygotowuje stanowisko.
  await wiersz.getByRole('button').click()
  await expect(page.getByRole('heading', { name: 'Szczegóły Rezerwacji' })).toBeVisible()

  const opis = page.locator('.opis')
  await expect(opis).toContainText(KLIENT_DEMO)
  await expect(opis).toContainText('jan@example.pl')
  await expect(opis).toContainText('600100200')
  await expect(opis).toContainText('2 os.')
  await expect(opis).toContainText('brak — Instruktor wymagany')
  await expect(opis).toContainText('obecny — wymagany brakiem Pozwolenia')
  await expect(opis).toContainText('CZ Shadow 2 — 1 szt.')
  await expect(opis).toContainText('.22 Long Rifle — 200 szt.')
  await expect(opis).toContainText('370,00 zł')
})
