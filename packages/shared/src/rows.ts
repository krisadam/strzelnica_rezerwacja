/**
 * Przejście z wierszy bazy na pojęcia domeny. Kolumna `weekday: number` nie
 * mówi, że dopuszczalne są tylko wartości 1–7 — zakresu pilnuje `check`
 * w bazie, a tutaj typ. Wiersz, który mimo to wypada poza zakres, zatrzymuje
 * się na wejściu, zamiast wywracać kalendarz przy pierwszym renderze.
 */
import type { AmmunitionKind } from './ammunition.ts'
import type {
  BlockSchedule,
  Occupancy,
  OpeningHours,
  TimeRules,
  WeaponOccupancy,
  WeaponType,
} from './availability.ts'
import { dayIn } from './calendar.ts'
import type { CalendarDay, Weekday } from './calendar.ts'
import type { Tables } from './database.types.ts'
import type { BookingSummary, OrderedItem } from './mail.ts'

/**
 * Kształt odpowiedzi PostgREST-a: dane albo błąd, nigdy wyjątek. Widget, Panel
 * i Edge Functions rozpakowują ją tak samo, więc rozpakowuje ją jedna funkcja.
 */
export type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

/**
 * Wiersze zapytania albo wyjątek. PostgREST zwraca błąd wartością, a nie
 * rzutem — bez tego każde zapytanie musiałoby pamiętać o sprawdzeniu, a to,
 * o którym ktoś zapomni, po cichu zamieni pusty grafik w brak Bloków.
 */
export function rowsOrThrow<T>(result: QueryResult<T>): T {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('Zapytanie nie zwróciło danych.')
  return result.data
}

export class InvalidWeekdayError extends Error {
  constructor(value: number) {
    super(`Dzień tygodnia ma być liczbą 1–7 (ISO), a jest: ${value}`)
    this.name = 'InvalidWeekdayError'
  }
}

export function asWeekday(value: number): Weekday {
  if (!Number.isInteger(value) || value < 1 || value > 7) throw new InvalidWeekdayError(value)
  return value as Weekday
}

export function blockScheduleFromRow(row: Tables<'block_schedules'>): BlockSchedule {
  return {
    id: row.id,
    laneId: row.lane_id,
    weekday: asWeekday(row.weekday),
    startMinute: row.start_minute,
    durationMinutes: row.duration_minutes,
  }
}

export function openingHoursFromRow(row: Tables<'opening_hours'>): OpeningHours {
  return {
    weekday: asWeekday(row.weekday),
    opensMinute: row.opens_minute,
    closesMinute: row.closes_minute,
  }
}

export function closedDateFromRow(row: Tables<'calendar_exceptions'>): CalendarDay {
  return row.closed_on
}

/**
 * Strzelnica w kształcie, w jakim potrzebuje jej grafik. Slug i data założenia
 * zostają w bazie — kalendarza nie obchodzą.
 */
export type Facility = {
  id: string
  name: string
  timeZone: string
  timeRules: TimeRules
  /** Pula instruktorów: ilu Instruktorów Strzelnica zapewnia jednocześnie. */
  instructorPool: number
  /** Stawka za uczestnictwo w groszach; stawka za Blok należy do Osi. */
  participationRate: number
  /** Stawka za Instruktora w groszach. */
  instructorRate: number
}

/**
 * Kolumny, które Widget czyta kluczem anonimowym. Wypisane zamiast `select('*')`,
 * żeby kolejny ticket dokładający pole do `facilities` nie wystawiał go
 * publicznie przez samo dodanie migracji.
 */
export type FacilityRow = Pick<
  Tables<'facilities'>,
  | 'id'
  | 'name'
  | 'timezone'
  | 'booking_horizon_days'
  | 'min_lead_minutes'
  | 'cancellation_window_hours'
  | 'instructor_pool'
  | 'participation_rate_gr'
  | 'instructor_rate_gr'
>

export function facilityFromRow(row: FacilityRow): Facility {
  return {
    id: row.id,
    name: row.name,
    timeZone: row.timezone,
    timeRules: {
      horizonDays: row.booking_horizon_days,
      minLeadMinutes: row.min_lead_minutes,
      cancellationWindowHours: row.cancellation_window_hours,
    },
    instructorPool: row.instructor_pool,
    participationRate: row.participation_rate_gr,
    instructorRate: row.instructor_rate_gr,
  }
}

/** Oś w kształcie, w jakim potrzebuje jej kalendarz. */
export type Lane = {
  id: string
  name: string
  capacity: number
  /** Stawka za Blok na tej Osi w groszach; obejmuje pierwszego Uczestnika. */
  blockRate: number
}

export function laneFromRow(row: Tables<'lanes'>): Lane {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    blockRate: row.block_rate_gr,
  }
}

export class IncompleteOccupancyError extends Error {
  constructor(column: string) {
    super(`Wiersz zajętości nie ma kolumny ${column}.`)
    this.name = 'IncompleteOccupancyError'
  }
}

/**
 * Zajętość Osi z widoku `lane_occupancy`. Kolumny widoku są w wygenerowanych
 * typach dopuszczalnie puste — Postgres nie umie o widoku powiedzieć więcej —
 * więc brak wartości zatrzymuje się tutaj, zamiast zamieniać się w Datę
 * z `null` i cicho zwalniać zajęty termin.
 */
export function occupancyFromRow(row: Tables<'lane_occupancy'>): Occupancy {
  if (!row.lane_id) throw new IncompleteOccupancyError('lane_id')
  if (!row.starts_at) throw new IncompleteOccupancyError('starts_at')
  if (!row.ends_at) throw new IncompleteOccupancyError('ends_at')
  // Sprawdzane wprost, bo `false` jest tu wartością, a nie brakiem: Rezerwacja
  // bez Instruktora ma przejść, a nie zatrzymać się jak wiersz niepełny.
  if (row.with_instructor === null || row.with_instructor === undefined) {
    throw new IncompleteOccupancyError('with_instructor')
  }

  return {
    laneId: row.lane_id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    withInstructor: row.with_instructor,
  }
}

/** Pozycja katalogu w kształcie, w jakim potrzebuje jej formularz i dostępność. */
export function weaponTypeFromRow(row: Tables<'weapon_types'>): WeaponType {
  return { id: row.id, name: row.name, pool: row.pool, unitPrice: row.unit_price_gr }
}

/**
 * Pozycja katalogu amunicji w kształcie, w jakim potrzebuje jej formularz.
 * Bez siostry po stronie zajętości: Rodzaj amunicji nie ma puli (ADR 0004),
 * więc nie ma widoku, z którego trzeba by liczyć, ile zostało.
 */
export function ammunitionKindFromRow(row: Tables<'ammunition_kinds'>): AmmunitionKind {
  return { id: row.id, name: row.name, unitPrice: row.unit_price_gr }
}

/**
 * Zajętość sztuk z widoku `weapon_occupancy`, siostrzana wobec `occupancyFromRow`
 * i z tego samego powodu ostrożna: kolumny widoku są w wygenerowanych typach
 * dopuszczalnie puste, a wiersz przepuszczony z brakiem policzyłby się jako
 * zero sztuk i po cichu zwolnił broń, której nie ma.
 */
export function weaponOccupancyFromRow(row: Tables<'weapon_occupancy'>): WeaponOccupancy {
  if (!row.weapon_type_id) throw new IncompleteOccupancyError('weapon_type_id')
  if (row.quantity === null || row.quantity === undefined) {
    throw new IncompleteOccupancyError('quantity')
  }
  if (!row.starts_at) throw new IncompleteOccupancyError('starts_at')
  if (!row.ends_at) throw new IncompleteOccupancyError('ends_at')

  return {
    weaponTypeId: row.weapon_type_id,
    quantity: row.quantity,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
  }
}

export class UnknownCatalogItemError extends Error {
  constructor(id: string) {
    super(`Pozycja ${id} nie ma odpowiednika w katalogu Strzelnicy.`)
    this.name = 'UnknownCatalogItemError'
  }
}

/** Pozycja Rezerwacji tak, jak leży w bazie: identyfikator katalogu i liczba sztuk. */
type CatalogQuantityRow = {
  id: string
  quantity: number
}

/** Pozycja katalogu sprowadzona do tego, czego potrzebuje opis Rezerwacji. */
type NamedCatalogRow = {
  id: string
  name: string
}

/**
 * Pozycje Rezerwacji z nazwami z katalogu. Wypożyczenia i Zapotrzebowanie
 * przechodzą tą samą drogą, bo w opisie różnią się tylko nagłówkiem listy.
 *
 * Pozycji spoza katalogu nie ma i być nie może — pilnuje tego klucz obcy przy
 * zapisie. Gdyby jednak trafiła się tutaj, opis nie powstaje wcale: lista
 * z pozycją bez nazwy kazałaby obsłudze zgadywać, co przygotować.
 */
function namedItems(
  items: readonly CatalogQuantityRow[],
  catalog: readonly NamedCatalogRow[],
): OrderedItem[] {
  const names = new Map(catalog.map((entry) => [entry.id, entry.name]))
  return items.map((item) => {
    const name = names.get(item.id)
    if (!name) throw new UnknownCatalogItemError(item.id)
    return { name, quantity: item.quantity }
  })
}

/**
 * Wiersze, z których składa się opis Rezerwacji na piśmie. Katalogi przychodzą
 * osobno i całe, bo schemat wiąże z nimi pozycje kluczem złożonym (pozycja,
 * Strzelnica), a stąd potrzebna jest z nich tylko nazwa.
 */
export type BookingSummaryRows = {
  booking: Pick<
    Tables<'bookings'>,
    | 'starts_at'
    | 'ends_at'
    | 'participants'
    | 'has_permit'
    | 'with_instructor'
    | 'amount_gr'
    | 'contact_name'
    | 'contact_email'
    | 'contact_phone'
  >
  facility: Pick<Tables<'facilities'>, 'name' | 'timezone'>
  lane: Pick<Tables<'lanes'>, 'name'>
  rentals: readonly Pick<Tables<'weapon_rentals'>, 'weapon_type_id' | 'quantity'>[]
  ammunition: readonly Pick<Tables<'ammunition_demands'>, 'ammunition_kind_id' | 'quantity'>[]
  weaponTypes: readonly NamedCatalogRow[]
  ammunitionKinds: readonly NamedCatalogRow[]
}

/**
 * Rezerwacja w kształcie, w jakim opisuje się ją w liście. Przejście z wierszy
 * na pojęcia domeny należy tutaj, a nie do Edge Function: „Glock 17" w miejsce
 * identyfikatora katalogu i dzień w strefie Strzelnicy w miejsce momentu w UTC
 * to reguły, które dają się wyrazić czystą funkcją — i są nią wyrażone.
 */
export function bookingSummaryFromRows({
  booking,
  facility,
  lane,
  rentals,
  ammunition,
  weaponTypes,
  ammunitionKinds,
}: BookingSummaryRows): BookingSummary {
  const startsAt = new Date(booking.starts_at)

  return {
    facilityName: facility.name,
    laneName: lane.name,
    // Dzień liczony w strefie Strzelnicy, a nie w UTC: Blok kończący się po
    // północy czasu uniwersalnego wciąż należy do soboty, na którą go sprzedano.
    day: dayIn(facility.timezone, startsAt),
    startsAt,
    endsAt: new Date(booking.ends_at),
    timeZone: facility.timezone,
    participants: booking.participants,
    hasPermit: booking.has_permit,
    withInstructor: booking.with_instructor,
    rentals: namedItems(
      rentals.map((row) => ({ id: row.weapon_type_id, quantity: row.quantity })),
      weaponTypes,
    ),
    ammunition: namedItems(
      ammunition.map((row) => ({ id: row.ammunition_kind_id, quantity: row.quantity })),
      ammunitionKinds,
    ),
    amount: booking.amount_gr,
    contact: {
      name: booking.contact_name,
      email: booking.contact_email,
      phone: booking.contact_phone,
    },
  }
}
