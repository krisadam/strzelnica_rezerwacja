import { describe, expect, it } from 'vitest'
import type { BlockSchedule, DayAvailabilityInput, OpeningHours, TimeRules } from './index.js'
import { addDays, bookingHorizon, scheduleForDay } from './index.js'

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

/** Reguły czasowe na tyle luźne, że nie odbierają dostępności same z siebie. */
function reguly(nadpisania: Partial<TimeRules> = {}): TimeRules {
  return { horizonDays: 30, minLeadMinutes: 0, cancellationWindowHours: 24, ...nadpisania }
}

function pytanie(nadpisania: Partial<DayAvailabilityInput> = {}): DayAvailabilityInput {
  return {
    day: PONIEDZIALEK,
    timeZone: 'Europe/Warsaw',
    laneId: OS_PISTOLETOWA,
    schedules: [blok(600), blok(750)],
    openingHours: OTWARTE_10_22,
    closedDates: [],
    timeRules: reguly(),
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

describe('horyzont rezerwacji', () => {
  // „Teraz" wypada 1 czerwca, więc poniedziałek 15 czerwca leży 14 dni dalej.
  const PIERWSZY_CZERWCA = new Date('2026-06-01T09:00:00Z')

  it('dopuszcza Blok dnia leżącego dokładnie na granicy horyzontu', () => {
    const bloki = blokiDnia(
      pytanie({ now: PIERWSZY_CZERWCA, timeRules: reguly({ horizonDays: 14 }) }),
    )

    expect(bloki.every((b) => b.available)).toBe(true)
  })

  it('odrzuca Blok dnia leżącego o jeden dzień za horyzontem', () => {
    const bloki = blokiDnia(
      pytanie({ now: PIERWSZY_CZERWCA, timeRules: reguly({ horizonDays: 13 }) }),
    )

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.unavailableBecause).toBe('poza-horyzontem')
  })
})

describe('minimalne wyprzedzenie', () => {
  // Pierwszy Blok poniedziałku zaczyna się o 10:00 czasu Warszawy, czyli 08:00 UTC.
  const DWIE_GODZINY = reguly({ minLeadMinutes: 120 })

  it('dopuszcza Blok oddalony dokładnie o minimalne wyprzedzenie', () => {
    const bloki = blokiDnia(
      pytanie({ now: new Date('2026-06-15T06:00:00Z'), timeRules: DWIE_GODZINY }),
    )

    expect(bloki[0]?.available).toBe(true)
  })

  it('odrzuca Blok oddalony o minutę mniej', () => {
    const bloki = blokiDnia(
      pytanie({ now: new Date('2026-06-15T06:01:00Z'), timeRules: DWIE_GODZINY }),
    )

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.unavailableBecause).toBe('ponizej-wyprzedzenia')
  })

  it('nie rusza dalszych Bloków tego samego dnia', () => {
    const bloki = blokiDnia(
      pytanie({ now: new Date('2026-06-15T06:01:00Z'), timeRules: DWIE_GODZINY }),
    )

    expect(bloki[1]?.available).toBe(true)
  })

  it('nazywa Blok, który już się zaczął, przeszłością — a nie zbyt bliskim terminem', () => {
    const bloki = blokiDnia(
      pytanie({ now: new Date('2026-06-15T08:30:00Z'), timeRules: DWIE_GODZINY }),
    )

    expect(bloki[0]?.unavailableBecause).toBe('przeszlosc')
  })
})

describe('granica horyzontu dla kalendarza', () => {
  function horyzont(now: Date, horizonDays: number) {
    return bookingHorizon({ timeZone: 'Europe/Warsaw', timeRules: reguly({ horizonDays }), now })
  }

  it('leży tyle dni od dzisiaj, ile mówi konfiguracja', () => {
    expect(horyzont(new Date('2026-06-15T06:00:00Z'), 30)).toBe('2026-07-15')
  })

  it('liczy „dzisiaj" zegarem Strzelnicy, nie zegarem czytającego', () => {
    // 00:30 w Warszawie to wciąż poprzedni dzień w UTC.
    expect(horyzont(new Date('2026-06-01T22:30:00Z'), 13)).toBe('2026-06-15')
  })

  it('zatrzymuje się na dzisiaj, gdy Strzelnica nie przyjmuje na jutro', () => {
    expect(horyzont(new Date('2026-06-15T06:00:00Z'), 0)).toBe('2026-06-15')
  })

  // Kalendarz kończy nawigację tam, gdzie dostępność przestaje dopuszczać
  // Bloki. Rozjazd między tymi dwiema granicami byłby dla Osoby rezerwującej
  // dniem, na który wolno wejść i w którym nic nie da się kliknąć.
  it('wypada tam, gdzie dostępność przestaje dopuszczać Bloki', () => {
    const now = new Date('2026-06-01T09:00:00Z')
    const timeRules = reguly({ horizonDays: 14 })
    const ostatniDzien = bookingHorizon({ timeZone: 'Europe/Warsaw', timeRules, now })

    expect(blokiDnia(pytanie({ day: ostatniDzien, now, timeRules }))[0]?.available).toBe(true)
    // Tydzień dalej wypada ten sam dzień tygodnia, więc rozkład ma co pokazać.
    expect(
      blokiDnia(pytanie({ day: addDays(ostatniDzien, 7), now, timeRules }))[0]
        ?.unavailableBecause,
    ).toBe('poza-horyzontem')
  })
})
