/**
 * Pobranie wszystkiego, z czego składa się grafik Strzelnicy. Jedno zapytanie
 * na tabelę, bez filtrowania po czasie — rozkład jest tygodniowy i mieści się
 * w kilkudziesięciu wierszach. Wyliczaniem dostępności zajmuje się czysta
 * funkcja z `@strzelnica/shared`; tutaj tylko odczyt i przepisanie wierszy.
 */
import type {
  AmmunitionKind,
  BlockSchedule,
  CalendarDay,
  DaySchedule,
  Facility,
  Intent,
  Lane,
  Occupancy,
  OpeningHours,
  WeaponOccupancy,
  WeaponType,
} from '@strzelnica/shared'
import {
  ammunitionKindFromRow,
  blockScheduleFromRow,
  closedDateFromRow,
  facilityFromRow,
  laneFromRow,
  occupancyFromRow,
  openingHoursFromRow,
  rowsOrThrow,
  scheduleForDay,
  weaponOccupancyFromRow,
  weaponTypeFromRow,
} from '@strzelnica/shared'
import type { StrzelnicaClient } from './supabase.js'

export type Grafik = {
  facility: Facility
  lanes: Lane[]
  schedules: BlockSchedule[]
  openingHours: OpeningHours[]
  closedDates: CalendarDay[]
  weaponTypes: WeaponType[]
  /**
   * Katalog Rodzajów amunicji. Nie ma go w `Zajetosc` obok Typów broni, bo
   * nie ma czego odświeżać: cudze zamówienia amunicji nie odbierają nikomu
   * ani jednej sztuki (ADR 0004), więc katalog czyta się raz, z resztą grafiku.
   */
  ammunitionKinds: AmmunitionKind[]
}

/**
 * To, co w grafiku zmienia się w trakcie: zajętość Osi i sztuki broni trzymane
 * przez cudze Rezerwacje. Jedno pojęcie, bo bierze się z jednego zdarzenia —
 * czyjejś Rezerwacji — i odświeża się razem, jednym pobraniem. Rozdzielone
 * dałyby się odświeżyć osobno, a kalendarz pokazałby wtedy wolną Oś z bronią,
 * której już nie ma.
 */
export type Zajetosc = {
  lanes: readonly Occupancy[]
  weapons: readonly WeaponOccupancy[]
}

export const PUSTA_ZAJETOSC: Zajetosc = { lanes: [], weapons: [] }

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
  zajetosc: Zajetosc,
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
    weaponTypes: grafik.weaponTypes,
    occupancies: zajetosc.lanes,
    weaponOccupancies: zajetosc.weapons,
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
 * Zajętość Strzelnicy od wskazanego momentu w przód: Osie z widoku
 * `lane_occupancy` i sztuki broni z `weapon_occupancy` — jedynych publicznych
 * okien na Rezerwacje, bez kontaktu, bez liczby Uczestników, bez stanu.
 *
 * Czytana osobno od reszty grafiku, bo jako jedyna zmienia się w trakcie: po
 * złożeniu Rezerwacji i po przegranym wyścigu o Blok trzeba ją pobrać jeszcze raz.
 */
export async function loadZajetosc(
  client: StrzelnicaClient,
  facilityId: string,
  od: Date,
): Promise<Zajetosc> {
  const [osie, bron] = await Promise.all([
    client
      .from('lane_occupancy')
      .select('*')
      .eq('facility_id', facilityId)
      .gt('ends_at', od.toISOString()),
    client
      .from('weapon_occupancy')
      .select('*')
      .eq('facility_id', facilityId)
      .gt('ends_at', od.toISOString()),
  ])

  return {
    lanes: rowsOrThrow(osie).map(occupancyFromRow),
    weapons: rowsOrThrow(bron).map(weaponOccupancyFromRow),
  }
}

export async function loadGrafik(client: StrzelnicaClient, slug: string): Promise<Grafik> {
  const { data: row, error } = await client
    .from('facilities')
    .select(
      'id, name, timezone, booking_horizon_days, min_lead_minutes, cancellation_window_hours, instructor_pool, participation_rate_gr, instructor_rate_gr',
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!row) throw new UnknownFacilityError(slug)

  const facility = facilityFromRow(row)

  const [lanes, schedules, openingHours, exceptions, weaponTypes, ammunitionKinds] =
    await Promise.all([
      client.from('lanes').select('*').eq('facility_id', facility.id).order('name'),
      client.from('block_schedules').select('*').eq('facility_id', facility.id),
      client.from('opening_hours').select('*').eq('facility_id', facility.id),
      client.from('calendar_exceptions').select('*').eq('facility_id', facility.id),
      client.from('weapon_types').select('*').eq('facility_id', facility.id).order('name'),
      client.from('ammunition_kinds').select('*').eq('facility_id', facility.id).order('name'),
    ])

  return {
    facility,
    lanes: rowsOrThrow(lanes).map(laneFromRow),
    schedules: rowsOrThrow(schedules).map(blockScheduleFromRow),
    openingHours: rowsOrThrow(openingHours).map(openingHoursFromRow),
    closedDates: rowsOrThrow(exceptions).map(closedDateFromRow),
    weaponTypes: rowsOrThrow(weaponTypes).map(weaponTypeFromRow),
    ammunitionKinds: rowsOrThrow(ammunitionKinds).map(ammunitionKindFromRow),
  }
}
