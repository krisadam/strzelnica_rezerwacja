/**
 * Pobranie wszystkiego, z czego składa się grafik Strzelnicy. Jedno zapytanie
 * na tabelę, bez filtrowania po czasie — rozkład jest tygodniowy i mieści się
 * w kilkudziesięciu wierszach. Wyliczaniem dostępności zajmuje się czysta
 * funkcja z `@strzelnica/shared`; tutaj tylko odczyt i przepisanie wierszy.
 */
import type {
  BlockSchedule,
  CalendarDay,
  DaySchedule,
  Facility,
  Intent,
  Lane,
  Occupancy,
  OpeningHours,
} from '@strzelnica/shared'
import {
  blockScheduleFromRow,
  closedDateFromRow,
  facilityFromRow,
  laneFromRow,
  occupancyFromRow,
  openingHoursFromRow,
  rowsOrThrow,
  scheduleForDay,
} from '@strzelnica/shared'
import type { StrzelnicaClient } from './supabase.js'

export type Grafik = {
  facility: Facility
  lanes: Lane[]
  schedules: BlockSchedule[]
  openingHours: OpeningHours[]
  closedDates: CalendarDay[]
}

/**
 * Grafik jednej Osi w jednym dniu, złożony z tego, co Widget ma pod ręką.
 * Wołają go dwa miejsca — kalendarz, który rysuje wszystkie Bloki dnia, i sam
 * przebieg rezerwacji, który po każdej zmianie deklaracji pyta o ten jeden
 * wybrany. Złożone osobno w każdym z nich byłyby dwiema listami wejść do
 * rozjechania się: kalendarz pokazywałby Blok wolny, a formularz zdejmowałby go
 * jako niedostępny.
 */
export function grafikDnia(
  grafik: Grafik,
  occupancies: readonly Occupancy[],
  intent: Intent,
  lane: Lane,
  day: CalendarDay,
  now: Date,
): DaySchedule {
  return scheduleForDay({
    day,
    laneId: lane.id,
    timeZone: grafik.facility.timeZone,
    timeRules: grafik.facility.timeRules,
    instructorPool: grafik.facility.instructorPool,
    intent,
    schedules: grafik.schedules,
    openingHours: grafik.openingHours,
    closedDates: grafik.closedDates,
    occupancies,
    now,
  })
}

export class UnknownFacilityError extends Error {
  constructor(slug: string) {
    super(`Nie ma Strzelnicy o identyfikatorze „${slug}".`)
    this.name = 'UnknownFacilityError'
  }
}

/**
 * Zajętość Osi Strzelnicy od wskazanego momentu w przód. Idzie z widoku
 * `lane_occupancy`, jedynego publicznego okna na Rezerwacje — bez kontaktu,
 * bez liczby Uczestników, bez stanu. Czytana osobno od reszty grafiku, bo
 * jako jedyna zmienia się w trakcie: po złożeniu Rezerwacji i po przegranym
 * wyścigu o Blok trzeba ją pobrać jeszcze raz.
 */
export async function loadZajetosc(
  client: StrzelnicaClient,
  facilityId: string,
  od: Date,
): Promise<Occupancy[]> {
  const wynik = await client
    .from('lane_occupancy')
    .select('*')
    .eq('facility_id', facilityId)
    .gt('ends_at', od.toISOString())

  return rowsOrThrow(wynik).map(occupancyFromRow)
}

export async function loadGrafik(client: StrzelnicaClient, slug: string): Promise<Grafik> {
  const { data: row, error } = await client
    .from('facilities')
    .select(
      'id, name, timezone, booking_horizon_days, min_lead_minutes, cancellation_window_hours, instructor_pool',
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!row) throw new UnknownFacilityError(slug)

  const facility = facilityFromRow(row)

  const [lanes, schedules, openingHours, exceptions] = await Promise.all([
    client.from('lanes').select('*').eq('facility_id', facility.id).order('name'),
    client.from('block_schedules').select('*').eq('facility_id', facility.id),
    client.from('opening_hours').select('*').eq('facility_id', facility.id),
    client.from('calendar_exceptions').select('*').eq('facility_id', facility.id),
  ])

  return {
    facility,
    lanes: rowsOrThrow(lanes).map(laneFromRow),
    schedules: rowsOrThrow(schedules).map(blockScheduleFromRow),
    openingHours: rowsOrThrow(openingHours).map(openingHoursFromRow),
    closedDates: rowsOrThrow(exceptions).map(closedDateFromRow),
  }
}
