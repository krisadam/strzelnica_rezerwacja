/**
 * Zgłoszenie Rezerwacji: kształt żądania, jego odczyt z sieci i reguły, które
 * musi spełnić. Czyste funkcje — ta sama kopia orzeka w Widgecie, zanim
 * pokaże się przycisk, i w Edge Function, zanim cokolwiek trafi do bazy.
 * Rozjazd między tymi dwoma osądami byłby formularzem, który przechodzi
 * u klienta i pada na serwerze.
 *
 * Zapisu pilnuje Edge Function (ADR 0003), więc walidacja po stronie klienta
 * jest wygodą, a nie zabezpieczeniem — dlatego serwer liczy to samo od nowa,
 * a nie ufa temu, co przyszło.
 */
import type { Block, Intent, Unavailability, WeaponRental } from './availability.ts'
import type { CalendarDay } from './calendar.ts'
import type { Lane } from './rows.ts'

/** Kontakt do Osoby rezerwującej; systemu nie interesują Uczestnicy z imienia. */
export type BookingContact = {
  name: string
  email: string
  phone: string
}

/**
 * To, co Osoba rezerwująca wypełnia sama. Termin przychodzi osobno.
 *
 * Rozszerza `Intent`, więc zgłoszenie wolno podać wprost tam, gdzie pyta się
 * o dostępność. Deklaracja Pozwolenia i zamawiane Wypożyczenia nie są bowiem
 * zwykłymi polami formularza — rozstrzygają, które terminy Osoba rezerwująca
 * w ogóle widzi jako wolne.
 */
export type BookingDraft = Intent & {
  participants: number
  contact: BookingContact
  consent: boolean
}

/**
 * Żądanie zapisu. Termin wskazany dniem i minutą rozkładu, nie momentem
 * w czasie: przeliczenie na `timestamptz` należy do serwera, żeby klient nie
 * mógł wskazać terminu, którego rozkład Osi nie zna.
 */
export type BookingRequest = BookingDraft & {
  facilitySlug: string
  laneId: string
  day: CalendarDay
  startMinute: number
}

/** Zastrzeżenie do zgłoszenia. Jedno pole — jedna wartość. */
export type BookingProblem =
  | 'termin-niedostepny'
  | 'brak-instruktora'
  | 'brak-sztuk-broni'
  | 'liczba-uczestnikow-poza-zakresem'
  | 'ponad-pojemnosc-osi'
  | 'niepoprawne-wypozyczenie'
  | 'brak-imienia'
  | 'niepoprawny-email'
  | 'brak-telefonu'
  | 'brak-zgody'

/**
 * Jak nazwać odmowę wobec Osoby rezerwującej. Powody mówiące o samym Bloku
 * schodzą do jednego zdania — dla niej wszystkie znaczą „wybierz inny termin".
 * Powody mówiące o jej zamierzeniach zachowują nazwę, bo każdy z nich naprawia
 * się inaczej: jeden zmianą deklaracji, drugi mniejszym zamówieniem.
 */
const TERM_PROBLEMS: Record<Unavailability, BookingProblem> = {
  'poza-godzinami-otwarcia': 'termin-niedostepny',
  'poza-horyzontem': 'termin-niedostepny',
  przeszlosc: 'termin-niedostepny',
  'ponizej-wyprzedzenia': 'termin-niedostepny',
  'termin-zajety': 'termin-niedostepny',
  'brak-instruktora': 'brak-instruktora',
  'brak-sztuk-broni': 'brak-sztuk-broni',
}

/**
 * Czy zastrzeżenie mówi o samym terminie, a nie o wypełnieniu formularza.
 * Te dwa rodzaje pokazuje się w różnych chwilach: pustego pola nie wytyka się
 * Osobie rezerwującej, zanim go tknie, ale o terminie, który właśnie przestał
 * być wolny, mówi się od razu.
 *
 * Odpowiedź czyta się z `TERM_PROBLEMS`, a nie z osobnej listy nazw: powód
 * dopisany do dostępności trafia tu wtedy sam, zamiast czekać, aż ktoś sobie
 * o nim przypomni.
 */
export function concernsTheTerm(problem: BookingProblem): boolean {
  return Object.values(TERM_PROBLEMS).includes(problem)
}

/** Odpowiedź Edge Function w kształcie znanym obu stronom. */
export type BookingOutcome =
  | { ok: true; id: string }
  | { ok: false; problem: BookingProblem }

export type BookingCheck = {
  draft: BookingDraft
  lane: Lane
  /** Wybrany Blok z grafiku dnia; `undefined`, gdy rozkład Osi go nie zna. */
  block: Block | undefined
}

/** Same spacje nie są treścią — ani w formularzu, ani w bazie. */
function empty(value: string): boolean {
  return value.trim() === ''
}

/**
 * Adres e-mail sprawdzany zgrubnie: coś, małpa, coś z kropką. Ostrzejszy
 * wzorzec odrzucałby adresy, które istnieją, a i tak nie dowiódłby, że adresat
 * odbiera — to rozstrzyga dopiero potwierdzenie adresu (ticket #10).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Czy zamówienie sztuk w ogóle da się przyjąć — niezależnie od tego, ile sztuk
 * Strzelnica ma. O pulach orzeka dostępność Bloku; tutaj zatrzymuje się to,
 * czego żadna Pula by nie naprawiła: pozycja na zero sztuk, ułamek sztuki,
 * pozycja bez Typu i dwie pozycje tego samego Typu.
 */
function malformedRentals(rentals: readonly WeaponRental[]): boolean {
  const typy = new Set<string>()
  for (const pozycja of rentals) {
    if (empty(pozycja.weaponTypeId)) return true
    if (!Number.isInteger(pozycja.quantity) || pozycja.quantity < 1) return true
    if (typy.has(pozycja.weaponTypeId)) return true
    typy.add(pozycja.weaponTypeId)
  }
  return false
}

/**
 * Wszystkie zastrzeżenia naraz, w kolejności czytania formularza. Nie pierwsze
 * z brzegu: Osoba rezerwująca ma zobaczyć całą listę poprawek za jednym razem,
 * a nie odkrywać je pojedynczo przy każdym kliknięciu.
 */
export function bookingProblems({ draft, lane, block }: BookingCheck): BookingProblem[] {
  const problems: BookingProblem[] = []

  // Odmowy z powodu pul dostają własne nazwy: są jedynymi, które Osoba
  // rezerwująca naprawia zmianą zamierzeń, a nie zmianą terminu.
  // Blok bez powodu niedostępności to Blok, którego rozkład Osi nie zna —
  // termin nigdy niewystawiony, a więc nie „zajęty" ani żaden inny z powodów.
  if (!block?.available) {
    problems.push(
      block?.unavailableBecause ? TERM_PROBLEMS[block.unavailableBecause] : 'termin-niedostepny',
    )
  }

  if (!Number.isInteger(draft.participants) || draft.participants < 1) {
    problems.push('liczba-uczestnikow-poza-zakresem')
  } else if (draft.participants > lane.capacity) {
    problems.push('ponad-pojemnosc-osi')
  }

  if (malformedRentals(draft.rentals)) problems.push('niepoprawne-wypozyczenie')

  if (empty(draft.contact.name)) problems.push('brak-imienia')
  if (!EMAIL_PATTERN.test(draft.contact.email.trim())) problems.push('niepoprawny-email')
  if (empty(draft.contact.phone)) problems.push('brak-telefonu')
  if (!draft.consent) problems.push('brak-zgody')

  return problems
}

export class MalformedBookingRequestError extends Error {
  constructor(what: string) {
    super(`Żądanie Rezerwacji jest niepoprawne: ${what}`)
    this.name = 'MalformedBookingRequestError'
  }
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedBookingRequestError(`${what} nie jest obiektem`)
  }
  return value as Record<string, unknown>
}

/**
 * Pole adresujące żądanie: bez niego nie ma czego szukać w bazie, a `bookingProblems`
 * nie ma dla niego zastrzeżenia, którym mógłby odpowiedzieć klientowi.
 */
function identifier(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || empty(value)) {
    throw new MalformedBookingRequestError(`pole ${key} nie jest wypełnionym napisem`)
  }
  return value.trim()
}

/**
 * Pole formularza: musi być napisem, ale wolno mu być pustym. O tym, czy puste
 * pole wolno przyjąć, orzeka `bookingProblems` — ta sama funkcja, co u klienta.
 * Odsianie pustych już tutaj czyniłoby `brak-imienia` i `brak-telefonu`
 * odpowiedziami, których serwer nigdy nie udziela.
 */
function formText(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string') {
    throw new MalformedBookingRequestError(`pole ${key} nie jest napisem`)
  }
  return value.trim()
}

/** Pole zaznaczane w formularzu; brak wartości nie jest tym samym, co „nie". */
function flag(source: Record<string, unknown>, key: string): boolean {
  const value = source[key]
  if (typeof value !== 'boolean') {
    throw new MalformedBookingRequestError(`pole ${key} nie jest wartością logiczną`)
  }
  return value
}

/**
 * Wypożyczenia ze zgłoszenia. Brak pola jest błędem kształtu, a nie pustą
 * listą: Rezerwacja z własną bronią mówi o tym wprost pustą tablicą, żeby
 * zgubione po drodze zamówienie nie zamieniło się w ciszę.
 *
 * Liczba sztuk poza zakresem przechodzi tędy i zatrzymuje się dopiero na
 * `bookingProblems` — tak samo jak liczba Uczestników.
 */
function readRentals(value: unknown): WeaponRental[] {
  if (!Array.isArray(value)) {
    throw new MalformedBookingRequestError('pole rentals nie jest listą')
  }

  return value.map((pozycja) => {
    const wiersz = record(pozycja, 'pozycja Wypożyczenia')
    const quantity = wiersz.quantity
    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
      throw new MalformedBookingRequestError('pole quantity nie jest liczbą')
    }
    return { weaponTypeId: identifier(wiersz, 'weaponTypeId'), quantity }
  })
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Żądanie odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie kształt —
 * czy da się z tego zbudować `BookingRequest`. O tym, czy wolno je przyjąć,
 * orzeka `bookingProblems` na danych Strzelnicy, których ten odczyt nie zna.
 */
export function readBookingRequest(value: unknown): BookingRequest {
  const source = record(value, 'treść żądania')
  const contact = record(source.contact, 'pole contact')

  // Minuta wskazuje Blok w rozkładzie Osi. Sprawdzamy, że jest minutą doby —
  // nie, że leży na siatce Slotów: o tym, które minuty istnieją, rozstrzyga
  // rozkład, a minuta, której w nim nie ma, wraca jako termin niedostępny.
  const startMinute = source.startMinute
  if (typeof startMinute !== 'number' || !Number.isInteger(startMinute) || startMinute < 0) {
    throw new MalformedBookingRequestError('pole startMinute nie jest minutą doby')
  }

  // Liczbę Uczestników poza zakresem osądza `bookingProblems`, tak jak puste
  // pole kontaktu. Tutaj zatrzymuje się tylko to, co liczbą w ogóle nie jest.
  const participants = source.participants
  if (typeof participants !== 'number' || !Number.isFinite(participants)) {
    throw new MalformedBookingRequestError('pole participants nie jest liczbą')
  }

  const rentals = readRentals(source.rentals)

  const consent = flag(source, 'consent')
  const hasPermit = flag(source, 'hasPermit')
  const wantsInstructor = flag(source, 'wantsInstructor')

  const day = identifier(source, 'day')
  if (!DAY_PATTERN.test(day)) {
    throw new MalformedBookingRequestError('pole day nie ma postaci RRRR-MM-DD')
  }

  return {
    facilitySlug: identifier(source, 'facilitySlug'),
    laneId: identifier(source, 'laneId'),
    day,
    startMinute,
    participants,
    contact: {
      name: formText(contact, 'name'),
      email: formText(contact, 'email'),
      phone: formText(contact, 'phone'),
    },
    consent,
    hasPermit,
    wantsInstructor,
    rentals,
  }
}
