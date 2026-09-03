import { describe, expect, it } from 'vitest'
import type { BookingSummaryRows, Tables } from './index.ts'
import {
  ammunitionKindFromRow,
  asWeekday,
  blockScheduleFromRow,
  bookingSummaryFromRows,
  facilityContactFromRow,
  facilityFromRow,
  IncompleteOccupancyError,
  InvalidWeekdayError,
  laneFromRow,
  occupancyFromRow,
  openingHoursFromRow,
  rowsOrThrow,
  UnknownCatalogItemError,
  weaponOccupancyFromRow,
  weaponTypeFromRow,
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

  it('Strzelnica niesie strefę, reguły czasowe i swoje stawki', () => {
    const row: Tables<'facilities'> = {
      id: 'strzelnica-1',
      slug: 'strzelnica-demo',
      name: 'Strzelnica Demo',
      timezone: 'Europe/Warsaw',
      booking_horizon_days: 30,
      min_lead_minutes: 120,
      cancellation_window_hours: 24,
      allowed_origins: ['https://klient.example.pl'],
      instructor_pool: 2,
      participation_rate_gr: 3000,
      instructor_rate_gr: 8000,
      // Adres powiadomień Strzelnicy nie przechodzi do domeny: nie ma go
      // w `FacilityRow`, bo klucz anonimowy nie ma po co go czytać.
      notification_email: 'recepcja@example.pl',
      // Kontakt dla klientów tak samo: czyta go Edge Function i podaje razem
      // z Rezerwacją, której dotyczy.
      contact_email: 'kontakt@example.pl',
      contact_phone: '+48 123 456 789',
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(facilityFromRow(row)).toEqual({
      id: 'strzelnica-1',
      name: 'Strzelnica Demo',
      timeZone: 'Europe/Warsaw',
      timeRules: { horizonDays: 30, minLeadMinutes: 120, cancellationWindowHours: 24 },
      instructorPool: 2,
      participationRate: 3000,
      instructorRate: 8000,
    })
  })

  // Kontakt do Strzelnicy pokazywany klientowi, gdy okno anulowania się
  // domknęło. Brak jest tu odpowiedzią, a nie wierszem niepełnym: Strzelnica
  // bez wpisanego kontaktu ma zostawić ekran bez telefonu, a nie zatrzymać go
  // wyjątkiem.
  it('kontakt do Strzelnicy przechodzi razem z brakami', () => {
    expect(
      facilityContactFromRow({ contact_email: 'kontakt@example.pl', contact_phone: null }),
    ).toEqual({ email: 'kontakt@example.pl', phone: null })
  })

  it('Oś zachowuje nazwę, pojemność i stawkę za Blok', () => {
    const row: Tables<'lanes'> = {
      id: 'os-1',
      facility_id: 'strzelnica-1',
      name: 'Oś pistoletowa nr 1',
      capacity: 4,
      block_rate_gr: 12000,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(laneFromRow(row)).toEqual({
      id: 'os-1',
      name: 'Oś pistoletowa nr 1',
      capacity: 4,
      blockRate: 12000,
    })
  })
})

describe('zajętość Osi z wiersza widoku', () => {
  const WIERSZ: Tables<'lane_occupancy'> = {
    facility_id: '00000000-0000-0000-0000-000000000001',
    lane_id: '00000000-0000-0000-0000-0000000000a1',
    starts_at: '2026-06-15T08:00:00+00:00',
    ends_at: '2026-06-15T10:00:00+00:00',
    with_instructor: true,
  }

  it('przenosi Oś, zakres czasu i zajęcie Instruktora', () => {
    expect(occupancyFromRow(WIERSZ)).toEqual({
      laneId: '00000000-0000-0000-0000-0000000000a1',
      startsAt: new Date('2026-06-15T08:00:00Z'),
      endsAt: new Date('2026-06-15T10:00:00Z'),
      withInstructor: true,
    })
  })

  // Rezerwacja bez Instruktora nie zajmuje miejsca w Puli — i to `false` ma
  // przejść, a nie zostać wzięte za brak wartości.
  it('przenosi Rezerwację bez Instruktora, zamiast brać ją za wiersz niepełny', () => {
    expect(occupancyFromRow({ ...WIERSZ, with_instructor: false }).withInstructor).toBe(false)
  })

  it.each(['lane_id', 'starts_at', 'ends_at', 'with_instructor'] as const)(
    'zatrzymuje wiersz bez kolumny %s',
    (kolumna) => {
      expect(() => occupancyFromRow({ ...WIERSZ, [kolumna]: null })).toThrow(
        IncompleteOccupancyError,
      )
    },
  )
})

describe('Typ broni z wiersza katalogu', () => {
  it('bierze z wiersza nazwę, pulę sztuk i cenę', () => {
    expect(
      weaponTypeFromRow({
        id: '00000000-0000-0000-0000-0000000000c1',
        facility_id: '00000000-0000-0000-0000-000000000001',
        name: 'Glock 17',
        pool: 3,
        unit_price_gr: 5000,
        created_at: '2026-01-01T00:00:00Z',
      }),
    ).toEqual({
      id: '00000000-0000-0000-0000-0000000000c1',
      name: 'Glock 17',
      pool: 3,
      unitPrice: 5000,
    })
  })
})

describe('Rodzaj amunicji z wiersza katalogu', () => {
  // Bez puli, inaczej niż Typ broni: amunicji system nie zlicza (ADR 0004).
  // Kolumny, której nie ma w schemacie, nie da się tu przepisać — i o to chodzi.
  it('przepisuje wiersz na pozycję katalogu', () => {
    expect(
      ammunitionKindFromRow({
        id: '00000000-0000-0000-0000-0000000000e1',
        facility_id: '00000000-0000-0000-0000-000000000001',
        name: '9 × 19 mm Parabellum',
        unit_price_gr: 150,
        created_at: '2026-01-01T00:00:00Z',
      }),
    ).toEqual({
      id: '00000000-0000-0000-0000-0000000000e1',
      name: '9 × 19 mm Parabellum',
      unitPrice: 150,
    })
  })
})

describe('zajętość sztuk broni z wiersza widoku', () => {
  const WIERSZ = {
    facility_id: '00000000-0000-0000-0000-000000000001',
    weapon_type_id: '00000000-0000-0000-0000-0000000000c1',
    quantity: 2,
    starts_at: '2026-06-15T08:00:00Z',
    ends_at: '2026-06-15T10:00:00Z',
  }

  it('przepisuje momenty na daty', () => {
    const zajetosc = weaponOccupancyFromRow(WIERSZ)

    expect(zajetosc.weaponTypeId).toBe('00000000-0000-0000-0000-0000000000c1')
    expect(zajetosc.quantity).toBe(2)
    expect(zajetosc.startsAt.toISOString()).toBe('2026-06-15T08:00:00.000Z')
  })

  // Kolumny widoku są w wygenerowanych typach dopuszczalnie puste. Wiersz
  // niepełny zatrzymuje się tutaj — zliczony jako zero sztuk zwolniłby broń,
  // której nie ma.
  it.each(['weapon_type_id', 'quantity', 'starts_at', 'ends_at'] as const)(
    'zatrzymuje wiersz bez kolumny %s',
    (kolumna) => {
      expect(() => weaponOccupancyFromRow({ ...WIERSZ, [kolumna]: null })).toThrow(
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

describe('opis Rezerwacji na piśmie', () => {
  const WIERSZE: BookingSummaryRows = {
    booking: {
      starts_at: '2026-06-15T08:00:00Z',
      ends_at: '2026-06-15T10:00:00Z',
      participants: 3,
      has_permit: false,
      with_instructor: true,
      amount_gr: 37000,
      contact_name: 'Anna Kowalska',
      contact_email: 'anna@example.pl',
      contact_phone: '600100200',
    },
    facility: { name: 'Strzelnica Demo', timezone: 'Europe/Warsaw' },
    lane: { name: 'Oś pistoletowa nr 1' },
    rentals: [{ weapon_type_id: 'typ-1', quantity: 2 }],
    ammunition: [{ ammunition_kind_id: 'rodzaj-1', quantity: 100 }],
    weaponTypes: [{ id: 'typ-1', name: 'Glock 17' }],
    ammunitionKinds: [{ id: 'rodzaj-1', name: '9 × 19 mm Parabellum' }],
  }

  it('zamienia identyfikatory katalogu na nazwy, bo list czyta człowiek', () => {
    const opis = bookingSummaryFromRows(WIERSZE)

    expect(opis.rentals).toEqual([{ name: 'Glock 17', quantity: 2 }])
    expect(opis.ammunition).toEqual([{ name: '9 × 19 mm Parabellum', quantity: 100 }])
  })

  // Blok o 08:00 UTC zaczyna się o 10:00 w Warszawie i należy do 15 czerwca
  // jej kalendarza — a to ten dzień stoi w nagłówku listu.
  it('liczy dzień w strefie Strzelnicy, a nie w UTC', () => {
    expect(
      bookingSummaryFromRows({
        ...WIERSZE,
        booking: { ...WIERSZE.booking, starts_at: '2026-06-15T22:30:00Z' },
      }).day,
    ).toBe('2026-06-16')
  })

  it('przenosi termin, Uczestników, deklaracje, Kwotę i kontakt', () => {
    const opis = bookingSummaryFromRows(WIERSZE)

    expect(opis.laneName).toBe('Oś pistoletowa nr 1')
    expect(opis.startsAt.toISOString()).toBe('2026-06-15T08:00:00.000Z')
    expect(opis.participants).toBe(3)
    expect(opis.hasPermit).toBe(false)
    expect(opis.withInstructor).toBe(true)
    expect(opis.amount).toBe(37000)
    expect(opis.contact).toEqual({
      name: 'Anna Kowalska',
      email: 'anna@example.pl',
      phone: '600100200',
    })
  })

  it('Rezerwacja bez zamówionego sprzętu daje puste listy, a nie brak', () => {
    const opis = bookingSummaryFromRows({ ...WIERSZE, rentals: [], ammunition: [] })

    expect(opis.rentals).toEqual([])
    expect(opis.ammunition).toEqual([])
  })

  // Pozycja bez odpowiednika w katalogu zatrzymuje cały opis. List z pozycją
  // bez nazwy kazałby obsłudze zgadywać, co przygotować na stanowisko.
  it('nie przepuszcza pozycji spoza katalogu', () => {
    expect(() => bookingSummaryFromRows({ ...WIERSZE, weaponTypes: [] })).toThrow(
      UnknownCatalogItemError,
    )
  })
})
