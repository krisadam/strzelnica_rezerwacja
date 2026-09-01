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
import type { AmmunitionDemand, AmmunitionKind } from './ammunition.ts'
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
  /**
   * Zamawiana amunicja. Nie należy do `Intent`, bo nie rozstrzyga o niczym
   * poza sobą: Rodzaj amunicji nie ma puli (ADR 0004), więc zamówienie nie
   * odbiera żadnego terminu ani sobie, ani nikomu innemu. Pusta lista znaczy
   * Osobę rezerwującą z własną amunicją albo taką, która kupi ją na miejscu.
   */
  ammunition: readonly AmmunitionDemand[]
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
  | 'niepoprawne-zapotrzebowanie'
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

/**
 * Odpowiedź Edge Function w kształcie znanym obu stronom. Przyjęte zgłoszenie
 * wraca z Kwotą — tą zapisaną, w groszach, a nie policzoną jeszcze raz
 * u klienta: to ona jest odtąd Kwotą tej Rezerwacji, choćby cennik zmienił się
 * między wypełnieniem formularza a zapisem.
 */
export type BookingOutcome =
  | { ok: true; id: string; amount: number }
  | { ok: false; problem: BookingProblem }

export type BookingCheck = {
  draft: BookingDraft
  lane: Lane
  /** Wybrany Blok z grafiku dnia; `undefined`, gdy rozkład Osi go nie zna. */
  block: Block | undefined
  /**
   * Katalog Rodzajów amunicji Strzelnicy. Potrzebny tutaj, choć katalog Typów
   * broni nie jest: Typ spoza katalogu odsiewa dostępność Bloku, bo nie ma ani
   * jednej sztuki do wydania, a amunicja przez dostępność nie przechodzi wcale
   * (ADR 0004). Bez katalogu Rodzaj zmyślony przez klienta zatrzymałby się
   * dopiero na kluczu obcym — jako błąd serwera, a nie odpowiedź o zgłoszeniu.
   */
  ammunitionKinds: readonly AmmunitionKind[]
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
 * Pozycja Rezerwacji sprowadzona do tego, co w niej istotne: co i ile sztuk.
 * Wypożyczenie wskazuje Typ broni, Zapotrzebowanie — Rodzaj amunicji, ale
 * pytanie „czy tę pozycję da się w ogóle przyjąć" jest w obu to samo.
 */
type OrderedItem = { id: string; quantity: number }

/**
 * Czy zamówienie sztuk w ogóle da się przyjąć — niezależnie od tego, ile
 * sztuk Strzelnica ma. O pulach orzeka dostępność Bloku (i tylko przy broni,
 * bo amunicja puli nie ma); tutaj zatrzymuje się to, czego żadna pula by nie
 * naprawiła: pozycja na zero sztuk, ułamek sztuki, pozycja bez wskazania
 * i dwie pozycje tego samego.
 *
 * Jedna reguła dla obu rodzajów pozycji, bo druga jej kopia rozjechałaby się
 * przy pierwszej poprawce — a rozjazd znaczyłby, że amunicję wolno zamówić
 * w połówkach, skoro broni nie wolno.
 */
function malformedItems(items: readonly OrderedItem[]): boolean {
  const wskazane = new Set<string>()
  for (const pozycja of items) {
    if (empty(pozycja.id)) return true
    if (!Number.isInteger(pozycja.quantity) || pozycja.quantity < 1) return true
    if (wskazane.has(pozycja.id)) return true
    wskazane.add(pozycja.id)
  }
  return false
}

function asItems(rentals: readonly WeaponRental[]): OrderedItem[] {
  return rentals.map((pozycja) => ({ id: pozycja.weaponTypeId, quantity: pozycja.quantity }))
}

function demandsAsItems(ammunition: readonly AmmunitionDemand[]): OrderedItem[] {
  return ammunition.map((pozycja) => ({
    id: pozycja.ammunitionKindId,
    quantity: pozycja.quantity,
  }))
}

/**
 * Wszystkie zastrzeżenia naraz, w kolejności czytania formularza. Nie pierwsze
 * z brzegu: Osoba rezerwująca ma zobaczyć całą listę poprawek za jednym razem,
 * a nie odkrywać je pojedynczo przy każdym kliknięciu.
 */
export function bookingProblems({
  draft,
  lane,
  block,
  ammunitionKinds,
}: BookingCheck): BookingProblem[] {
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

  // Dwa zastrzeżenia zamiast jednego wspólnego: naprawia się je w dwóch
  // różnych miejscach formularza, a jedno kazałoby szukać pomyłki w obu naraz.
  if (malformedItems(asItems(draft.rentals))) problems.push('niepoprawne-wypozyczenie')
  const nieznanyRodzaj = draft.ammunition.some(
    (pozycja) => !ammunitionKinds.some((rodzaj) => rodzaj.id === pozycja.ammunitionKindId),
  )
  if (malformedItems(demandsAsItems(draft.ammunition)) || nieznanyRodzaj) {
    problems.push('niepoprawne-zapotrzebowanie')
  }

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
    return { weaponTypeId: identifier(wiersz, 'weaponTypeId'), quantity: orderedQuantity(wiersz) }
  })
}

/**
 * Liczba sztuk ze zgłoszenia. Zakres osądza `bookingProblems` — tutaj
 * zatrzymuje się tylko to, co liczbą w ogóle nie jest.
 */
function orderedQuantity(source: Record<string, unknown>): number {
  const quantity = source.quantity
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    throw new MalformedBookingRequestError('pole quantity nie jest liczbą')
  }
  return quantity
}

/**
 * Zapotrzebowanie ze zgłoszenia. Brak pola jest błędem kształtu, a nie pustą
 * listą — tak samo jak przy Wypożyczeniach i z tego samego powodu: zamówienie
 * zgubione po drodze nie ma zamieniać się w ciszę, na którą Strzelnica nie
 * przygotuje niczego.
 */
function readAmmunition(value: unknown): AmmunitionDemand[] {
  if (!Array.isArray(value)) {
    throw new MalformedBookingRequestError('pole ammunition nie jest listą')
  }

  return value.map((pozycja) => {
    const wiersz = record(pozycja, 'pozycja Zapotrzebowania')
    return {
      ammunitionKindId: identifier(wiersz, 'ammunitionKindId'),
      quantity: orderedQuantity(wiersz),
    }
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
  const ammunition = readAmmunition(source.ammunition)

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
    ammunition,
  }
}
