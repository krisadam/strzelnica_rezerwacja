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
import { addDays, dayIn } from './calendar.ts'
import type { CalendarDay } from './calendar.ts'
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

/** Rezerwacje w porządku, w jakim czyta je człowiek: od najwcześniejszej. */
function poCzasie(bookings: readonly PanelBooking[]): PanelBooking[] {
  return [...bookings].sort(
    (a, b) => a.booking.startsAt.getTime() - b.booking.startsAt.getTime(),
  )
}

/** Rezerwacje jednej Osi w jednym dniu, w porządku godzin. */
export type LaneAgenda<L> = {
  lane: L
  bookings: PanelBooking[]
}

export type DayAgendaInput<L> = {
  /** Osie Strzelnicy w porządku, w jakim mają stanąć na ekranie. */
  lanes: readonly L[]
  bookings: readonly PanelBooking[]
  /** Dzień kalendarza Strzelnicy; Rezerwacja niesie swój w tej samej strefie. */
  day: CalendarDay
}

/**
 * Kalendarz dnia z podziałem na Osie. Oś bez Rezerwacji zostaje na ekranie
 * z pustą listą — zniknięcie wyglądałoby na Oś wycofaną z obiektu, a nie na
 * wolne popołudnie, a to właśnie wolne popołudnie obsługa tu szuka.
 *
 * Wchodzą wyłącznie Rezerwacje trzymające termin: kalendarz odpowiada na
 * pytanie „co dzieje się na Osi", a Rezerwacja anulowana, odwołana albo wygasła
 * nie dzieje się na niej wcale. Po tamte jest lista — tam stan jest kolumną,
 * a nie powodem zniknięcia.
 *
 * Oś przychodzi w całości i w całości wraca, więc wołający sam decyduje, co
 * o niej pokazuje. Ta funkcja układa godziny, a nie opisuje Osie.
 */
export function dayAgenda<L extends { id: string }>({
  lanes,
  bookings,
  day,
}: DayAgendaInput<L>): LaneAgenda<L>[] {
  const dnia = bookings.filter((wpis) => wpis.holdsTerm && wpis.booking.day === day)

  return lanes.map((lane) => ({
    lane,
    bookings: poCzasie(dnia.filter((wpis) => wpis.laneId === lane.id)),
  }))
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

/**
 * Lista Rezerwacji zawężona filtrami, od najwcześniejszej. Inaczej niż
 * kalendarz, przepuszcza każdy stan: obsługa szuka tu konkretnego zgłoszenia,
 * a anulowane bywa właśnie tym, o które ktoś dzwoni.
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
