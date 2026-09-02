import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { baza } from './srodowisko.js'

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
 * Deklaracja Pozwolenia na broń, składana przed szukaniem terminu — bo to ona
 * rozstrzyga, które terminy są wolne.
 *
 * Testy rezerwujące składają ją po to, żeby nie zajmować miejsca w Puli
 * instruktorów: jadą równolegle i odbierałyby je sobie nawzajem. To ustawienie
 * środowiska, nie przedmiot testu — sama Pula rozstrzyga się na szwie czystych
 * funkcji, gdzie jest opisana co do ostatniego wolnego miejsca.
 */
export async function zadeklarujPozwolenie(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: 'Mam pozwolenie na broń' }).check()
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

/**
 * Pierwszy wolny Blok wskazanej Osi po przejściu o `oIleDni` naprzód od dnia,
 * na którym stoi kalendarz. Inaczej niż `pierwszyWolnyBlok`, nie szuka dalej:
 * wołający sam prowadzi kalendarz, bo chce tego samego dnia na dwóch stronach
 * naraz — dopiero wtedy Bloki obu stron nachodzą na siebie w czasie.
 */
export async function wolnyBlokPoDniach(
  page: Page,
  os: string,
  oIleDni: number,
): Promise<Locator | null> {
  await page.getByRole('radio', { name: os }).check()
  for (let krok = 0; krok < oIleDni; krok += 1) {
    await page.getByRole('button', { name: 'Następny dzień' }).click()
  }

  const wolne = page.getByRole('button', { name: 'wolny' })
  return (await wolne.count()) > 0 ? wolne.first() : null
}

/** Godzina Bloku, po której poznaje się go później w kalendarzu. */
export function czasBloku(blok: Locator): Promise<string> {
  return blok.locator('.blok__czas').innerText()
}

export async function wypelnijFormularz(
  page: Page,
  dane: {
    uczestnicy: number
    imie: string
    email: string
    telefon: string
    /** Typ broni i liczba sztuk do wypożyczenia; brak znaczy własną broń. */
    bron?: { typ: string; sztuki: number }
    /** Rodzaj amunicji i liczba sztuk; brak znaczy własną albo kupioną na miejscu. */
    amunicja?: { rodzaj: string; sztuki: number }
  },
): Promise<void> {
  await page.getByLabel('Liczba Uczestników').fill(String(dane.uczestnicy))
  if (dane.bron) await page.getByLabel(dane.bron.typ).fill(String(dane.bron.sztuki))
  if (dane.amunicja) {
    await page.getByLabel(dane.amunicja.rodzaj).fill(String(dane.amunicja.sztuki))
  }
  await page.getByLabel('Imię i nazwisko').fill(dane.imie)
  await page.getByLabel('Adres e-mail').fill(dane.email)
  await page.getByLabel('Telefon').fill(dane.telefon)
  await page.getByLabel('Akceptuję regulamin').check()
  await page.getByRole('button', { name: 'Dalej' }).click()
  await expect(page.getByRole('heading', { name: 'Sprawdź, zanim wyślesz' })).toBeVisible()
}

/** Wiadomość przechwycona zamiast wysłanej, sprowadzona do tego, co w niej ważne. */
export type PrzechwyconyList = {
  /** Rezerwacja, której list dotyczy — stąd bierze się dostęp do jej wiersza. */
  bookingId: string
  /** Link potwierdzający, wyjęty z treści tak, jak wyjąłby go czytelnik. */
  link: string
}

/**
 * Link w treści listu, rozpoznawany po nazwie parametru. Wzorzec wpisany tu
 * wprost, a nie zbudowany ze stałej `CONFIRMATION_PARAM` — test przeglądarkowy
 * ogląda system z zewnątrz, jak czytelnik listu, i ma zauważyć zmianę kształtu
 * linku zamiast podążać za nią po cichu.
 */
const LINK_W_TRESCI = /https?:\/\/\S*potwierdzenie=[0-9a-f]+/

/**
 * List, który poszedł na wskazany adres. W środowisku bez dostawcy poczty
 * Edge Function zapisuje wiadomość do `mail_outbox` zamiast ją wysyłać — i to
 * jest jedyne miejsce, w którym test może zobaczyć link. Wiadomość powstaje
 * jeszcze przed odpowiedzią dla Widgetu, więc gdy widać potwierdzenie na
 * ekranie, list już leży.
 */
export async function przechwyconyList(email: string): Promise<PrzechwyconyList> {
  const wiersze = await baza<{ booking_id: string; body_text: string }[]>(
    `mail_outbox?recipient=eq.${encodeURIComponent(email)}` +
      '&select=booking_id,body_text&order=created_at.desc&limit=1',
  )

  const list = wiersze[0]
  if (!list) throw new Error(`Na adres ${email} nie poszedł żaden list.`)

  const link = LINK_W_TRESCI.exec(list.body_text)?.[0]
  if (!link) throw new Error(`List na adres ${email} nie niesie linku potwierdzającego.`)

  return { bookingId: list.booking_id, link }
}

/**
 * Przesunięcie terminu wygaśnięcia w przeszłość — jedyny sposób, żeby test
 * zobaczył wygaśnięcie. Czekania trzydziestu minut nie da się odbyć, a zegara
 * nie zamrażamy: zamrożenie w przeglądarce nie zamraża zegara bazy, a to on
 * rozstrzyga o wygaśnięciu. Skoro nie da się przesunąć „teraz", przesuwa się
 * termin — skutek jest ten sam, a mierzy go ten sam zegar, co na produkcji.
 */
export async function juzWygasla(bookingId: string): Promise<void> {
  await baza(`bookings?id=eq.${bookingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ expires_at: new Date(Date.now() - 5 * 60_000).toISOString() }),
  })
}
