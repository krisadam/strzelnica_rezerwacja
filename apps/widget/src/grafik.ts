/**
 * Pobranie wszystkiego, z czego składa się grafik Strzelnicy. Jedno zapytanie
 * na tabelę, bez filtrowania po czasie — rozkład jest tygodniowy i mieści się
 * w kilkudziesięciu wierszach. Wyliczaniem dostępności zajmuje się czysta
 * funkcja z `@strzelnica/shared`; tutaj tylko odczyt i przepisanie wierszy.
 */
import type { BlockSchedule, CalendarDay, Lane, OpeningHours } from '@strzelnica/shared'
import {
  blockScheduleFromRow,
  closedDateFromRow,
  laneFromRow,
  openingHoursFromRow,
} from '@strzelnica/shared'
import type { StrzelnicaClient } from './supabase.js'

export type Facility = {
  id: string
  name: string
  timezone: string
}

export type Grafik = {
  facility: Facility
  lanes: Lane[]
  schedules: BlockSchedule[]
  openingHours: OpeningHours[]
  closedDates: CalendarDay[]
}

export class UnknownFacilityError extends Error {
  constructor(slug: string) {
    super(`Nie ma Strzelnicy o identyfikatorze „${slug}".`)
    this.name = 'UnknownFacilityError'
  }
}

function orThrow<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('Zapytanie nie zwróciło danych.')
  return result.data
}

export async function loadGrafik(client: StrzelnicaClient, slug: string): Promise<Grafik> {
  const { data: facility, error } = await client
    .from('facilities')
    .select('id, name, timezone')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!facility) throw new UnknownFacilityError(slug)

  const [lanes, schedules, openingHours, exceptions] = await Promise.all([
    client.from('lanes').select('*').eq('facility_id', facility.id).order('name'),
    client.from('block_schedules').select('*').eq('facility_id', facility.id),
    client.from('opening_hours').select('*').eq('facility_id', facility.id),
    client.from('calendar_exceptions').select('*').eq('facility_id', facility.id),
  ])

  return {
    facility,
    lanes: orThrow(lanes).map(laneFromRow),
    schedules: orThrow(schedules).map(blockScheduleFromRow),
    openingHours: orThrow(openingHours).map(openingHoursFromRow),
    closedDates: orThrow(exceptions).map(closedDateFromRow),
  }
}
