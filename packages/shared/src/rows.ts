/**
 * Przejście z wierszy bazy na pojęcia domeny. Kolumna `weekday: number` nie
 * mówi, że dopuszczalne są tylko wartości 1–7 — zakresu pilnuje `check`
 * w bazie, a tutaj typ. Wiersz, który mimo to wypada poza zakres, zatrzymuje
 * się na wejściu, zamiast wywracać kalendarz przy pierwszym renderze.
 */
import type { BlockSchedule, OpeningHours, TimeRules } from './availability.js'
import type { CalendarDay, Weekday } from './calendar.js'
import type { Tables } from './database.types.js'

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
  }
}

/** Oś w kształcie, w jakim potrzebuje jej kalendarz. */
export type Lane = {
  id: string
  name: string
  capacity: number
}

export function laneFromRow(row: Tables<'lanes'>): Lane {
  return { id: row.id, name: row.name, capacity: row.capacity }
}
