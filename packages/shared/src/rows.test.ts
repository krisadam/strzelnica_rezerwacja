import { describe, expect, it } from 'vitest'
import type { Tables } from './index.ts'
import {
  asWeekday,
  blockScheduleFromRow,
  facilityFromRow,
  IncompleteOccupancyError,
  InvalidWeekdayError,
  laneFromRow,
  occupancyFromRow,
  openingHoursFromRow,
  rowsOrThrow,
} from './index.ts'

describe('dzień tygodnia z wiersza bazy', () => {
  it('przepuszcza wartości ISO', () => {
    expect(asWeekday(1)).toBe(1)
    expect(asWeekday(7)).toBe(7)
  })

  it('zatrzymuje wartość spoza zakresu', () => {
    expect(() => asWeekday(0)).toThrow(InvalidWeekdayError)
    expect(() => asWeekday(8)).toThrow(InvalidWeekdayError)
  })
})

describe('wiersze bazy jako pojęcia domeny', () => {
  it('pozycja rozkładu zachowuje Oś, dzień i czas', () => {
    const row: Tables<'block_schedules'> = {
      id: 'blok-1',
      facility_id: 'strzelnica-1',
      lane_id: 'os-1',
      weekday: 6,
      start_minute: 1380,
      duration_minutes: 120,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(blockScheduleFromRow(row)).toEqual({
      id: 'blok-1',
      laneId: 'os-1',
      weekday: 6,
      startMinute: 1380,
      durationMinutes: 120,
    })
  })

  it('godziny otwarcia gubią identyfikatory, bo dostępności nie interesują', () => {
    const row: Tables<'opening_hours'> = {
      id: 'godziny-1',
      facility_id: 'strzelnica-1',
      weekday: 1,
      opens_minute: 600,
      closes_minute: 1320,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(openingHoursFromRow(row)).toEqual({
      weekday: 1,
      opensMinute: 600,
      closesMinute: 1320,
    })
  })

  it('Strzelnica niesie strefę i komplet reguł czasowych', () => {
    const row: Tables<'facilities'> = {
      id: 'strzelnica-1',
      slug: 'strzelnica-demo',
      name: 'Strzelnica Demo',
      timezone: 'Europe/Warsaw',
      booking_horizon_days: 30,
      min_lead_minutes: 120,
      cancellation_window_hours: 24,
      allowed_origins: ['https://klient.example.pl'],
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(facilityFromRow(row)).toEqual({
      id: 'strzelnica-1',
      name: 'Strzelnica Demo',
      timeZone: 'Europe/Warsaw',
      timeRules: { horizonDays: 30, minLeadMinutes: 120, cancellationWindowHours: 24 },
    })
  })

  it('Oś zachowuje nazwę i pojemność', () => {
    const row: Tables<'lanes'> = {
      id: 'os-1',
      facility_id: 'strzelnica-1',
      name: 'Oś pistoletowa nr 1',
      capacity: 4,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(laneFromRow(row)).toEqual({
      id: 'os-1',
      name: 'Oś pistoletowa nr 1',
      capacity: 4,
    })
  })
})

describe('zajętość Osi z wiersza widoku', () => {
  const WIERSZ: Tables<'lane_occupancy'> = {
    facility_id: '00000000-0000-0000-0000-000000000001',
    lane_id: '00000000-0000-0000-0000-0000000000a1',
    starts_at: '2026-06-15T08:00:00+00:00',
    ends_at: '2026-06-15T10:00:00+00:00',
  }

  it('przenosi Oś i zakres czasu', () => {
    expect(occupancyFromRow(WIERSZ)).toEqual({
      laneId: '00000000-0000-0000-0000-0000000000a1',
      startsAt: new Date('2026-06-15T08:00:00Z'),
      endsAt: new Date('2026-06-15T10:00:00Z'),
    })
  })

  it.each(['lane_id', 'starts_at', 'ends_at'] as const)(
    'zatrzymuje wiersz bez kolumny %s',
    (kolumna) => {
      expect(() => occupancyFromRow({ ...WIERSZ, [kolumna]: null })).toThrow(
        IncompleteOccupancyError,
      )
    },
  )
})

describe('rozpakowanie odpowiedzi zapytania', () => {
  it('oddaje wiersze, gdy zapytanie się powiodło', () => {
    expect(rowsOrThrow({ data: [{ id: 'a' }], error: null })).toEqual([{ id: 'a' }])
  })

  it('oddaje pustą listę, bo brak wierszy nie jest błędem', () => {
    expect(rowsOrThrow({ data: [], error: null })).toEqual([])
  })

  it('rzuca komunikatem bazy, zamiast zwracać pustkę', () => {
    expect(() => rowsOrThrow({ data: null, error: { message: 'brak uprawnień' } })).toThrow(
      'brak uprawnień',
    )
  })
})
