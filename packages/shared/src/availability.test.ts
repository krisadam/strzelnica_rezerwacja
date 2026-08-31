import { describe, expect, it } from 'vitest'
import type { BlockSchedule, DayAvailabilityInput, OpeningHours } from './index.js'
import { scheduleForDay } from './index.js'

/** Same Bloki — dni zamknięte mają osobne asercje na `open`. */
function blokiDnia(...args: Parameters<typeof scheduleForDay>) {
  return scheduleForDay(...args).blocks
}

const OS_PISTOLETOWA = 'os-1'
const OS_KARABINOWA = 'os-2'

// Poniedziałek 15 czerwca 2026 (czas letni w Warszawie, UTC+2).
const PONIEDZIALEK = '2026-06-15'
// Sobota 20 czerwca 2026.
const SOBOTA = '2026-06-20'
// Poniedziałek 12 stycznia 2026 (czas zimowy, UTC+1).
const ZIMOWY_PONIEDZIALEK = '2026-01-12'

const OTWARTE_10_22: OpeningHours[] = [
  { weekday: 1, opensMinute: 600, closesMinute: 1320 },
  // Sobota domyka się o 01:00 następnego dnia.
  { weekday: 6, opensMinute: 540, closesMinute: 1500 },
]

function blok(startMinute: number, extra: Partial<BlockSchedule> = {}): BlockSchedule {
  return {
    id: `blok-${extra.weekday ?? 1}-${startMinute}`,
    laneId: OS_PISTOLETOWA,
    weekday: 1,
    startMinute,
    durationMinutes: 120,
    ...extra,
  }
}

function pytanie(nadpisania: Partial<DayAvailabilityInput> = {}): DayAvailabilityInput {
  return {
    day: PONIEDZIALEK,
    timeZone: 'Europe/Warsaw',
    laneId: OS_PISTOLETOWA,
    schedules: [blok(600), blok(750)],
    openingHours: OTWARTE_10_22,
    closedDates: [],
    now: new Date('2026-06-01T09:00:00Z'),
    ...nadpisania,
  }
}

describe('dostępne Bloki dnia', () => {
  it('pokazuje Bloki z rozkładu Osi jako wolne', () => {
    const bloki = blokiDnia(pytanie())

    expect(bloki).toHaveLength(2)
    expect(bloki.every((b) => b.available)).toBe(true)
    expect(bloki[0]?.startsAt.toISOString()).toBe('2026-06-15T08:00:00.000Z')
    expect(bloki[0]?.endsAt.toISOString()).toBe('2026-06-15T10:00:00.000Z')
  })

  it('zwraca Bloki w kolejności rozpoczęcia, niezależnie od kolejności rozkładu', () => {
    const bloki = blokiDnia(pytanie({ schedules: [blok(900), blok(600), blok(750)] }))

    expect(bloki.map((b) => b.startMinute)).toEqual([600, 750, 900])
  })

  it('pomija Bloki innych Osi i innych dni tygodnia', () => {
    const bloki = blokiDnia(
      pytanie({
        schedules: [
          blok(600),
          blok(750, { laneId: OS_KARABINOWA, id: 'obca-os' }),
          blok(900, { weekday: 2, id: 'inny-dzien' }),
        ],
      }),
    )

    expect(bloki.map((b) => b.scheduleId)).toEqual(['blok-1-600'])
  })

  it('uwzględnia strefę Strzelnicy, także poza czasem letnim', () => {
    const bloki = blokiDnia(
      pytanie({ day: ZIMOWY_PONIEDZIALEK, now: new Date('2026-01-01T09:00:00Z') }),
    )

    expect(bloki[0]?.startsAt.toISOString()).toBe('2026-01-12T09:00:00.000Z')
  })
})

describe('Blok poza godzinami otwarcia', () => {
  it('jest niedostępny, gdy zaczyna się przed otwarciem', () => {
    const bloki = blokiDnia(pytanie({ schedules: [blok(480)] }))

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.unavailableBecause).toBe('poza-godzinami-otwarcia')
  })

  it('jest niedostępny, gdy kończy się po zamknięciu', () => {
    // 21:30 + 120 minut = 23:30, a Strzelnica zamyka o 22:00.
    const bloki = blokiDnia(pytanie({ schedules: [blok(1290)] }))

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.unavailableBecause).toBe('poza-godzinami-otwarcia')
  })

  it('jest wolny, gdy kończy się dokładnie o zamknięciu', () => {
    const bloki = blokiDnia(pytanie({ schedules: [blok(1200)] }))

    expect(bloki[0]?.available).toBe(true)
  })

  it('zamyka cały dzień tygodnia, w którym Strzelnica nie ma godzin otwarcia', () => {
    expect(scheduleForDay(pytanie({ openingHours: [] }))).toEqual({ open: false, blocks: [] })
  })
})

describe('wyjątek kalendarzowy', () => {
  it('zamyka dzień, zamiast tylko zdejmować z niego Bloki', () => {
    expect(scheduleForDay(pytanie({ closedDates: [PONIEDZIALEK] }))).toEqual({
      open: false,
      blocks: [],
    })
  })

  it('nie rusza sąsiednich dni', () => {
    const grafik = scheduleForDay(pytanie({ closedDates: ['2026-06-14', '2026-06-16'] }))

    expect(grafik.open).toBe(true)
    expect(grafik.blocks).toHaveLength(2)
  })
})

describe('Blok przecinający granicę doby', () => {
  const sobotniaNoc = blok(1380, { weekday: 6, id: 'noc' })

  it('kończy się następnego dnia i pozostaje Blokiem soboty', () => {
    const bloki = blokiDnia(
      pytanie({ day: SOBOTA, schedules: [sobotniaNoc], now: new Date('2026-06-01T09:00:00Z') }),
    )

    expect(bloki).toHaveLength(1)
    expect(bloki[0]?.startsAt.toISOString()).toBe('2026-06-20T21:00:00.000Z')
    expect(bloki[0]?.endsAt.toISOString()).toBe('2026-06-20T23:00:00.000Z')
    expect(bloki[0]?.available).toBe(true)
  })

  it('mierzy się z godzinami otwarcia domykającymi się po północy', () => {
    const bloki = blokiDnia(
      pytanie({
        day: SOBOTA,
        schedules: [sobotniaNoc],
        // Zamknięcie o 24:00 nie mieści Bloku 23:00–01:00.
        openingHours: [{ weekday: 6, opensMinute: 540, closesMinute: 1440 }],
        now: new Date('2026-06-01T09:00:00Z'),
      }),
    )

    expect(bloki[0]?.unavailableBecause).toBe('poza-godzinami-otwarcia')
  })

  it('nie pojawia się w rozkładzie następnego dnia', () => {
    const bloki = blokiDnia(
      pytanie({
        day: '2026-06-21',
        schedules: [sobotniaNoc],
        openingHours: [{ weekday: 7, opensMinute: 540, closesMinute: 1200 }],
      }),
    )

    expect(bloki).toEqual([])
  })
})

describe('Blok, który już minął', () => {
  it('jest niedostępny, gdy zaczął się przed „teraz"', () => {
    const bloki = blokiDnia(pytanie({ now: new Date('2026-06-15T08:30:00Z') }))

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.unavailableBecause).toBe('przeszlosc')
    expect(bloki[1]?.available).toBe(true)
  })

  it('jest niedostępny w chwili własnego rozpoczęcia', () => {
    const bloki = blokiDnia(pytanie({ now: new Date('2026-06-15T08:00:00Z') }))

    expect(bloki[0]?.available).toBe(false)
  })
})
