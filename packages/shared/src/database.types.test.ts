import { describe, expect, it } from 'vitest'
import type { Tables, TablesInsert } from './index.js'

// Typy pochodzą z `pnpm db:types`. Ten test nie sprawdza logiki — pilnuje,
// że eksportowany kształt daje się użyć i nadąża za migracjami. Gdy kolumna
// zniknie ze schematu, kontrola typów padnie tutaj, a nie u konsumenta.
describe('typy ze schematu bazy', () => {
  it('Strzelnica ma identyfikator, slug, nazwę, strefę i reguły czasowe', () => {
    const strzelnica: Tables<'facilities'> = {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'strzelnica-demo',
      name: 'Strzelnica Demo',
      timezone: 'Europe/Warsaw',
      booking_horizon_days: 30,
      min_lead_minutes: 120,
      cancellation_window_hours: 24,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(strzelnica.timezone).toBe('Europe/Warsaw')
  })

  it('zapis Strzelnicy wymaga tylko slug i nazwy — resztę uzupełnia baza', () => {
    const nowa: TablesInsert<'facilities'> = {
      slug: 'strzelnica-druga',
      name: 'Strzelnica Druga',
    }

    expect(nowa.timezone).toBeUndefined()
    // Reguły czasowe mają wartości domyślne, więc nowa Strzelnica ma je
    // sensowne, zanim ktokolwiek wejdzie do Panelu.
    expect(nowa.booking_horizon_days).toBeUndefined()
    expect(nowa.min_lead_minutes).toBeUndefined()
    expect(nowa.cancellation_window_hours).toBeUndefined()
  })

  it('Oś niesie identyfikator Strzelnicy i pojemność', () => {
    const os: Tables<'lanes'> = {
      id: '00000000-0000-0000-0000-0000000000a1',
      facility_id: '00000000-0000-0000-0000-000000000001',
      name: 'Oś pistoletowa nr 1',
      capacity: 4,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(os.capacity).toBe(4)
  })

  it('pozycja rozkładu wiąże Oś z dniem tygodnia i minutą początku', () => {
    const pozycja: TablesInsert<'block_schedules'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      lane_id: '00000000-0000-0000-0000-0000000000a1',
      weekday: 1,
      start_minute: 600,
      duration_minutes: 120,
    }

    expect(pozycja.duration_minutes % 30).toBe(0)
  })

  it('wyjątek kalendarzowy niesie datę, a powód jest opcjonalny', () => {
    const wyjatek: Tables<'calendar_exceptions'> = {
      id: '00000000-0000-0000-0000-0000000000b1',
      facility_id: '00000000-0000-0000-0000-000000000001',
      closed_on: '2026-06-20',
      reason: null,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(wyjatek.reason).toBeNull()
  })

  it('godziny otwarcia dopuszczają domknięcie po północy', () => {
    const godziny: TablesInsert<'opening_hours'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      weekday: 6,
      opens_minute: 540,
      closes_minute: 1500,
    }

    expect(godziny.closes_minute).toBeGreaterThan(1440)
  })
})
