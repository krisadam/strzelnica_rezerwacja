/**
 * Panel: co Użytkownik panelu widzi o Rezerwacjach swojej Strzelnicy i jak to
 * jest poukładane. Dwa spojrzenia na ten sam zbiór — kalendarz dnia z podziałem
 * na Osie i lista z filtrami — więc jeden kształt Rezerwacji i dwie czyste
 * funkcje, które go układają.
 *
 * Wielodostępności nie ma tu ani śladu i być nie może: do przeglądarki Panelu
 * przychodzą wyłącznie Rezerwacje jego Strzelnicy, bo odcina je widok
 * `panel_bookings` w bazie. Funkcja, która filtrowałaby po Strzelnicy tutaj,
 * byłaby drugą granicą — a druga granica to ta, o której się zapomina.
 */
import type { Occupancy } from './availability.ts'
import { addDays, dayIn, zonedMinuteToInstant } from './calendar.ts'
import type { CalendarDay } from './calendar.ts'
import type { LaneClosure } from './closure.ts'
import { closureOccupancy } from './closure.ts'
import type { Database } from './database.types.ts'
import type { BookingSummary } from './mail.ts'

type BookingStatus = Database['public']['Enums']['booking_status']

/**
 * Rezerwacja tak, jak widzi ją obsługa. Opis jest tym samym `BookingSummary`,
 * który jedzie w listach i pod linkiem klienta — jedna Rezerwacja, jeden
 * kształt. Panel dokłada do niego trzy rzeczy, których tamte spojrzenia nie
 * potrzebowały: identyfikator, Oś i to, czy Rezerwacja wciąż trzyma termin.
 */
export type PanelBooking = {
  id: string
  laneId: string
  status: BookingStatus
  /**
   * Czy Rezerwacja trzyma jeszcze termin na wyłączność. Liczy to baza tą samą
   * funkcją, co widoki zajętości (ADR 0006) — bo Rezerwacja oczekująca gaśnie
   * zegarem, a nie zapisem, i lista stanów przepisana tutaj rozjechałaby się
   * z kalendarzem Widgetu przy pierwszej z nich.
   */
  holdsTerm: boolean
  /**
   * Powód, dla którego Strzelnica odwołała tę Rezerwację; puste ma każda
   * nieodwołana. Jedzie razem ze stanem, bo stan bez powodu stałby na ekranie
   * bez wyjaśnienia — a wtedy obsługa dzwoniłaby po koleżankę, która
   * odwoływała, i po to samo dzwoniłby klient.
   */
  revocationReason: string | null
  booking: BookingSummary
}

/**
 * Co stoi na Osi w kalendarzu dnia. Rezerwacja i Blokada zajmują Oś na
 * wyłączność, więc stoją w jednym szeregu i w jednym porządku godzin — ale
 * znacznikiem odróżnialne, bo obsługa czyta z tego dwie różne rzeczy: przy
 * jednej ma kogo przyjąć, przy drugiej ma czego nie sprzedawać.
 *
 * To, co dla kalendarza wspólne — numer, Oś i zakres czasu — stoi **przy
 * wpisie**, a nie po znaczniku w każdym miejscu, które o to pyta: układanie
 * godzin, rozdzielanie po Osiach i klucz na ekranie potrzebują tego samego,
 * a rozgałęzienie powtórzone w każdym z nich byłoby tym samym pytaniem
 * zadanym trzy razy. Znacznik zostaje jednemu miejscu, które naprawdę robi coś
 * innego dla jednego i drugiego: rysowaniu.
 */
export type LaneEntry = {
  /** Numer Rezerwacji albo Blokady; na ekranie jest kluczem wpisu. */
  id: string
  laneId: string
  startsAt: Date
  endsAt: Date
} & (
  | { kind: 'rezerwacja'; booking: PanelBooking }
  | {
      kind: 'blokada'
      closure: LaneClosure
      /**
       * Czy Blokada wychodzi poza pokazany dzień — którymkolwiek końcem.
       * Blokada bierze dowolny zakres czasu, więc bywa dłuższa od doby, a sam
       * zakres godzin („18:00–12:00") kłamałby wtedy o jej długości.
       */
      beyondDay: boolean
    }
)

/** Co stoi na jednej Osi w jednym dniu, w porządku godzin. */
export type LaneAgenda<L> = {
  lane: L
  entries: LaneEntry[]
}

export type DayAgendaInput<L> = {
  /** Osie Strzelnicy w porządku, w jakim mają stanąć na ekranie. */
  lanes: readonly L[]
  bookings: readonly PanelBooking[]
  /** Blokady Strzelnicy; dla kalendarza zajmują Oś tak samo jak Rezerwacje. */
  closures: readonly LaneClosure[]
  /** Dzień kalendarza Strzelnicy; Rezerwacja niesie swój w tej samej strefie. */
  day: CalendarDay
  /**
   * Strefa Strzelnicy. Rezerwacja niesie swój dzień policzony jej zegarem,
   * a Blokada nie ma jednego dnia: trwa dowolnie długo, więc o tym, czy stoi
   * na pokazanym dniu, rozstrzyga zachodzenie na dobę — a doba jest dobą
   * Strzelnicy.
   */
  timeZone: string
}

/**
 * Kalendarz dnia z podziałem na Osie. Oś, na której nic nie stoi, zostaje na
 * ekranie z pustą listą — zniknięcie wyglądałoby na Oś wycofaną z obiektu,
 * a nie na wolne popołudnie, a to właśnie wolne popołudnie obsługa tu szuka.
 *
 * Wchodzą wyłącznie Rezerwacje trzymające termin: kalendarz odpowiada na
 * pytanie „co dzieje się na Osi", a Rezerwacja anulowana, odwołana albo wygasła
 * nie dzieje się na niej wcale. Po tamte jest lista — tam stan jest kolumną,
 * a nie powodem zniknięcia.
 *
 * Blokady wchodzą wszystkie, bo Blokada stanów nie ma: jest albo jej nie ma.
 * Wchodzi też ta zaczęta wczoraj i ta kończąca się pojutrze — Oś wyłączona na
 * trzy dni serwisu jest wyłączona każdego z nich, a kalendarz filtrujący po
 * dniu **początku** pokazałby ją tylko pierwszego.
 *
 * Oś przychodzi w całości i w całości wraca, więc wołający sam decyduje, co
 * o niej pokazuje. Ta funkcja układa godziny, a nie opisuje Osie.
 */
export function dayAgenda<L extends { id: string }>({
  lanes,
  bookings,
  closures,
  day,
  timeZone,
}: DayAgendaInput<L>): LaneAgenda<L>[] {
  const rezerwacje: LaneEntry[] = bookings
    .filter((wpis) => wpis.holdsTerm && wpis.booking.day === day)
    .map((booking) => ({
      kind: 'rezerwacja',
      id: booking.id,
      laneId: booking.laneId,
      startsAt: booking.booking.startsAt,
      endsAt: booking.booking.endsAt,
      booking,
    }))

  // Doba Strzelnicy: od jej północy do północy następnej. Ta sama granica, co
  // przy oknie odczytu Panelu — dzień domyka minuta 1440, a nie 1439.
  const poczatekDnia = zonedMinuteToInstant(day, 0, timeZone)
  const koniecDnia = zonedMinuteToInstant(day, 1440, timeZone)
  const blokady: LaneEntry[] = closures
    // Zachodzenie liczone tą samą regułą, co kolizja: Blokada kończąca się
    // o północy należy do dnia, który się nią domyka, a nie do następnego.
    .filter((closure) => closure.startsAt < koniecDnia && closure.endsAt > poczatekDnia)
    .map((closure) => ({
      kind: 'blokada',
      id: closure.id,
      laneId: closure.laneId,
      startsAt: closure.startsAt,
      endsAt: closure.endsAt,
      closure,
      beyondDay: closure.startsAt < poczatekDnia || closure.endsAt > koniecDnia,
    }))

  const wpisy = [...rezerwacje, ...blokady]

  return lanes.map((lane) => ({
    lane,
    entries: wpisy
      .filter((wpis) => wpis.laneId === lane.id)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  }))
}

export type PanelOccupancyInput = {
  bookings: readonly PanelBooking[]
  closures: readonly LaneClosure[]
}

/**
 * Zajętość Osi złożona z tego, co Panel ma pod ręką — bo widoków zajętości
 * Widgetu nie czyta wcale i nie ma do nich prawa (ADR 0009): one wystawiają
 * zajętość **wszystkich** Strzelnic, a konto Panelu widzi jedną.
 *
 * Wychodzi z tego ta sama `Occupancy`, którą liczy dostępność w Widgecie, więc
 * formularz Blokady pyta o kolizję tę samą funkcję, co kalendarz klienta.
 * Wchodzą Rezerwacje trzymające termin — wygasła nie zajmuje już nic — i każda
 * Blokada.
 */
export function panelOccupancy({ bookings, closures }: PanelOccupancyInput): Occupancy[] {
  return [
    ...bookings.filter((wpis) => wpis.holdsTerm).map(bookingOccupancy),
    ...closures.map(closureOccupancy),
  ]
}

/**
 * Rezerwacja Panelu w kształcie Zajętości — siostrzana wobec
 * `closureOccupancy` i stojąca tutaj, bo `PanelBooking` mieszka tutaj.
 * Instruktora niesie ze sobą: Rezerwacja zajmuje miejsce w Puli, Blokada nigdy.
 */
function bookingOccupancy(wpis: PanelBooking): Occupancy {
  return {
    laneId: wpis.laneId,
    startsAt: wpis.booking.startsAt,
    endsAt: wpis.booking.endsAt,
    withInstructor: wpis.booking.withInstructor,
  }
}

/**
 * Czym obsługa zawęża listę. Puste znaczy „bez zawężenia" — nie „dzisiaj"
 * i nie „pierwsza Oś": lista, która sama wybiera dzień, przemilcza to, że
 * gdzieś obok stoi Rezerwacja, której nie widać.
 */
export type BookingFilter = {
  day?: CalendarDay | null
  laneId?: string | null
}

/** Rezerwacje w porządku, w jakim czyta je człowiek: od najwcześniejszej. */
function poCzasie(bookings: readonly PanelBooking[]): PanelBooking[] {
  return [...bookings].sort(
    (a, b) => a.booking.startsAt.getTime() - b.booking.startsAt.getTime(),
  )
}

/**
 * Lista Rezerwacji zawężona filtrami, od najwcześniejszej. Inaczej niż
 * kalendarz, przepuszcza każdy stan: obsługa szuka tu konkretnego zgłoszenia,
 * a anulowane bywa właśnie tym, o które ktoś dzwoni.
 *
 * Blokad tu nie ma i nie ma ich czym szukać: kolumny tej listy to Osoba
 * rezerwująca, Uczestnicy i Kwota, a Blokada nie ma ani jednej z tych rzeczy.
 * Widać ją w kalendarzu, tam gdzie zajmuje Oś.
 */
export function filterBookings(
  bookings: readonly PanelBooking[],
  { day, laneId }: BookingFilter,
): PanelBooking[] {
  return poCzasie(
    bookings.filter(
      (wpis) =>
        (!day || wpis.booking.day === day) && (!laneId || wpis.laneId === laneId),
    ),
  )
}

/**
 * Ile dni wstecz Panel wczytuje Rezerwacje. Obsługa zagląda w to, co było
 * wczoraj i przedwczoraj — kto przyjechał, kto nie — a nie w zeszły kwartał;
 * po archiwum przyjdzie ekran, który je umie stronicować.
 */
export const PANEL_DAYS_BACK = 7

/** Zakres dni, z którego Panel czyta Rezerwacje. Oba końce włącznie. */
export type PanelWindow = {
  from: CalendarDay
  to: CalendarDay
}

export type PanelWindowInput = {
  /** Strefa Strzelnicy: dzień liczy się jej zegarem, nie zegarem obsługi. */
  timeZone: string
  /** Horyzont rezerwacji Strzelnicy — dalej nie ma czego wczytywać. */
  horizonDays: number
  now: Date
}

/**
 * Okno, poza które Panel nie sięga. Jest tu, bo odczyt bez granicy jest
 * odczytem, który kiedyś urwie się w połowie: PostgREST oddaje najwyżej
 * `max_rows` wierszy i nie mówi o tym ani słowem, a przy porządku rosnącym
 * urwałby **przyszłość** — czyli dokładnie to, po co obsługa tu zagląda.
 *
 * Okno jest ruchome i liczone od dzisiaj, więc nie rośnie z historią: Rezerwacji
 * w nim jest tyle, ile Osi razy Bloków razy dni, a nie tyle, ile Strzelnica
 * kiedykolwiek przyjęła.
 *
 * Ta sama granica ogranicza pola wyboru daty na ekranie: filtr, którym da się
 * wskazać dzień spoza okna, odpowiadałby „brak Rezerwacji" na dzień, o który
 * nikt nie zapytał bazy.
 */
export function panelWindow({ timeZone, horizonDays, now }: PanelWindowInput): PanelWindow {
  const today = dayIn(timeZone, now)
  return {
    from: addDays(today, -PANEL_DAYS_BACK),
    // Horyzont zerowy znaczy „wyłącznie dzisiaj", więc dzień horyzontu należy
    // do okna — tak samo jak w `bookingHorizon`.
    to: addDays(today, horizonDays),
  }
}
