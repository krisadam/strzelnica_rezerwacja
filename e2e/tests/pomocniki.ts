import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { PANEL_URL } from '../playwright.config.js'
import { baza } from './srodowisko.js'

export const STRZELNICA = 'strzelnica-demo'
export const OS_PISTOLETOWA = 'Oś pistoletowa nr 1'
export const OS_KARABINOWA = 'Oś karabinowa nr 2'

/** Konta Panelu z seeda — jedno na Strzelnicę, obydwa z tym samym hasłem. */
export const OBSLUGA_DEMO = 'obsluga@strzelnica-demo.example.pl'
export const OBSLUGA_DRUGIEJ = 'obsluga@strzelnica-druga.example.pl'
export const HASLO_PANELU = 'panel-demo-123'

/** Rezerwacja z seeda, po której poznaje się Strzelnicę demonstracyjną. */
export const KLIENT_DEMO = 'Jan Przykładowy'
export const REZERWACJA_DEMO = '00000000-0000-0000-0000-0000000000b1'

/** Strefa Strzelnicy demonstracyjnej — jej zegarem liczy się dzień Rezerwacji. */
const STREFA_DEMO = 'Europe/Warsaw'

/**
 * Dzień Rezerwacji w postaci, której oczekuje pole daty w Panelu — czytany
 * z bazy, a nie przeliczany w teście. Terminy są tu ruchome (seed celuje
 * w poniedziałek za dwa tygodnie, testy w kolejne dni horyzontu), a druga kopia
 * rachunku rozjechałaby się z pierwszą przy pierwszej zmianie danych.
 *
 * Dzień liczony w strefie Strzelnicy, tak samo jak liczy go Panel: Blok
 * zaczynający się o 10:00 czasu warszawskiego bywa poprzednim dniem w UTC.
 */
export async function dzienRezerwacji(bookingId: string): Promise<string> {
  const [wiersz] = await baza<{ starts_at: string }[]>(
    `bookings?id=eq.${bookingId}&select=starts_at`,
  )
  if (!wiersz) throw new Error(`Rezerwacji ${bookingId} nie ma w bazie.`)

  // `sv-SE` daje zapis `RRRR-MM-DD` — dokładnie ten, którego oczekuje pole daty.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: STREFA_DEMO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(wiersz.starts_at))
}

/**
 * Wejście do Panelu wskazanym kontem. Wspólne dla testów Panelu i testów
 * izolacji, bo obie grupy pytają o to samo z dwóch stron: jedna, co konto
 * widzi, druga — czego nie.
 */
export async function zalogujDoPanelu(page: Page, email: string): Promise<void> {
  await page.goto(PANEL_URL)
  await page.getByLabel('Adres e-mail').fill(email)
  await page.getByLabel('Hasło').fill(HASLO_PANELU)
  await page.getByRole('button', { name: 'Zaloguj' }).click()
  await expect(page.getByRole('button', { name: 'Wyloguj' })).toBeVisible()
}

/** Adres powiadomień Strzelnicy demonstracyjnej — jej pole konfiguracyjne z seeda. */
export const ADRES_POWIADOMIEN = 'recepcja@strzelnica-demo.example.pl'

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
export type PrzechwyconaWiadomosc = {
  /** Rezerwacja, której list dotyczy — stąd bierze się dostęp do jej wiersza. */
  bookingId: string
  temat: string
  tresc: string
}

/**
 * Listy, które poszły pod wskazany adres — od najnowszego. W środowisku bez
 * dostawcy poczty Edge Function zapisuje wiadomość do `mail_outbox` zamiast ją
 * wysyłać, i to jest jedyne miejsce, w którym test widzi, co komu wyszło.
 * Wiadomość powstaje jeszcze przed odpowiedzią dla Widgetu, więc gdy widać
 * skutek na ekranie, list już leży.
 */
export async function listyDo(email: string): Promise<PrzechwyconaWiadomosc[]> {
  const wiersze = await baza<{ booking_id: string; subject: string; body_text: string }[]>(
    `mail_outbox?recipient=eq.${encodeURIComponent(email)}` +
      '&select=booking_id,subject,body_text&order=created_at.desc',
  )

  return wiersze.map((wiersz) => ({
    bookingId: wiersz.booking_id,
    temat: wiersz.subject,
    tresc: wiersz.body_text,
  }))
}

/** Wiadomość wraz z linkiem wyjętym z jej treści — tak, jak wyjąłby go czytelnik. */
export type ListZLinkiem = PrzechwyconaWiadomosc & { link: string }

/**
 * Link w treści listu, rozpoznawany po nazwie parametru. Wzorce wpisane tu
 * wprost, a nie zbudowane ze stałych `CONFIRMATION_PARAM` i `MANAGEMENT_PARAM`
 * — test przeglądarkowy ogląda system z zewnątrz, jak czytelnik listu, i ma
 * zauważyć zmianę kształtu linku zamiast podążać za nią po cichu.
 */
const LINK_POTWIERDZAJACY = /https?:\/\/\S*potwierdzenie=[0-9a-f]+/

/** Link do zarządzania Rezerwacją; niesie go dopiero list z podsumowaniem. */
export const LINK_ZARZADZANIA = /https?:\/\/\S*rezerwacja=[0-9a-f]+/

/** Najnowszy list na wskazany adres wraz z wyjętym z niego linkiem potwierdzającym. */
export async function przechwyconyList(email: string): Promise<ListZLinkiem> {
  const list = (await listyDo(email))[0]
  if (!list) throw new Error(`Na adres ${email} nie poszedł żaden list.`)

  const link = LINK_POTWIERDZAJACY.exec(list.tresc)?.[0]
  if (!link) throw new Error(`List na adres ${email} nie niesie linku potwierdzającego.`)

  return { ...list, link }
}

/**
 * Termin Rezerwacji zapamiętany tak, żeby dało się do niego wrócić po
 * przeładowaniu strony: sama godzina nie wystarczy, bo kalendarz wstaje na
 * dzisiaj, a wolny Blok bywa za kilka dni.
 */
export type Termin = { czas: string; dni: number }

/**
 * Sprzęt zamawiany tam, gdzie test ogląda opis Rezerwacji. Nie po to, żeby
 * sprawdzić wyliczenie — to należy do szwu czystych funkcji — a po to, żeby
 * przejść odczyt katalogów, z których opis bierze nazwy pozycji.
 */
export type Sprzet = {
  bron: { typ: string; sztuki: number }
  amunicja: { rodzaj: string; sztuki: number }
}

/** Ile dni od wskazanego początku test przegląda w poszukiwaniu wolnego Bloku. */
const DNI_OD_POCZATKU = 5

/**
 * Złożenie Rezerwacji na pierwszym wolnym Bloku wskazanej Osi od wskazanego
 * dnia. Zatrzymuje się na ekranie „Sprawdź skrzynkę" — dalej idzie się już
 * linkiem z listu.
 *
 * Dzień początkowy podaje wołający, bo Osi są dwie, a testów rezerwujących
 * więcej: wyścigi biorą terminy najbliższe, bo obie ich strony muszą trafić na
 * ten sam Blok, więc reszta odsuwa się w głąb horyzontu, każdy na własną
 * wysokość. Bez tego zabralibyśmy wyścigowi Blok sprzed nosa i to on by padał.
 */
export async function zlozRezerwacje(
  page: Page,
  dane: { os: string; email: string; odDnia: number; sprzet?: Sprzet },
): Promise<Termin> {
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)

  // Pierwszy dzień z wolnym Blokiem, liczony w krokach od dzisiaj — bo do tego
  // samego dnia trzeba będzie potem wrócić po przeładowaniu strony.
  let dni = dane.odDnia
  let blok = await wolnyBlokPoDniach(page, dane.os, dane.odDnia)
  while (!blok && dni < dane.odDnia + DNI_OD_POCZATKU) {
    dni += 1
    blok = await wolnyBlokPoDniach(page, dane.os, 1)
  }
  if (!blok) throw new Error(`Oś „${dane.os}" nie ma wolnego Bloku w oknie szukania.`)

  const czas = await czasBloku(blok)
  await blok.click()

  await wypelnijFormularz(page, {
    uczestnicy: 1,
    imie: 'Celina Nowak',
    email: dane.email,
    telefon: '600300400',
    ...dane.sprzet,
  })
  await page.getByRole('button', { name: 'Rezerwuję' }).click()

  await expect(page.getByRole('heading', { name: 'Sprawdź skrzynkę' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  return { czas, dni }
}

/**
 * Przejście całej drogi potwierdzenia: złożenie Rezerwacji i wejście w link
 * z listu. Zwraca termin oraz link do zarządzania — czyli to, po co testy
 * anulowania w ogóle rezerwują.
 */
export async function zlozIPotwierdz(
  page: Page,
  dane: { os: string; email: string; odDnia: number; sprzet?: Sprzet },
): Promise<{ termin: Termin; bookingId: string; linkZarzadzania: string }> {
  const termin = await zlozRezerwacje(page, dane)
  const list = await przechwyconyList(dane.email)

  await page.goto(list.link)
  await expect(page.getByRole('heading', { name: 'Termin jest Twój' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  const podsumowanie = (await listyDo(dane.email)).find((wiadomosc) =>
    wiadomosc.temat.includes('Rezerwacja potwierdzona'),
  )
  const link = podsumowanie && LINK_ZARZADZANIA.exec(podsumowanie.tresc)?.[0]
  if (!link) throw new Error(`List z podsumowaniem na ${dane.email} nie niesie linku.`)

  return { termin, bookingId: list.bookingId, linkZarzadzania: link }
}

/**
 * Przesunięcie terminu Rezerwacji tak, żeby Okno anulowania było już
 * domknięte. Czekania do dnia przed terminem nie da się w teście odbyć,
 * a zegara nie zamrażamy — zamrożenie w przeglądarce nie zamraża zegara bazy,
 * a to on rozstrzyga o granicy okna.
 *
 * Godzina wybrana z rozmysłem: minimalne wyprzedzenie Strzelnicy z seeda to
 * dwie godziny, więc w najbliższej godzinie nikt inny nie mógł nic
 * zarezerwować i przesunięcie nie ma jak wpaść na cudzą Rezerwację.
 *
 * Minuta losowa i przedział krótki, bo wyłączności Osi pilnuje ograniczenie
 * w schemacie: dwa przesunięcia w tym samym przebiegu — choćby ponowieniem po
 * niepowodzeniu — trafiłyby na siebie, gdyby obydwa celowały w tę samą godzinę.
 */
export async function juzZaPozno(bookingId: string): Promise<void> {
  const minuta = 60 + Math.floor(Math.random() * 60)
  const start = new Date(Date.now() + minuta * 60_000)
  await baza(`bookings?id=eq.${bookingId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 60_000).toISOString(),
    }),
  })
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
