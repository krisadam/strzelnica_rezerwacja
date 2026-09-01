import { describe, expect, it } from 'vitest'
import type {
  BlockSchedule,
  DayAvailabilityInput,
  Occupancy,
  OpeningHours,
  TimeRules,
  WeaponOccupancy,
  WeaponRental,
  WeaponType,
} from './index.ts'
import {
  addDays,
  bookingHorizon,
  occupancyWindow,
  remainingWeapons,
  scheduleForDay,
} from './index.ts'

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
    occupancies: [],
    instructorPool: 1,
    weaponTypes: [],
    weaponOccupancies: [],
    // Domyślnie pytamy jako Osoba rezerwująca z Pozwoleniem, która Instruktora
    // nie zamawia i broni nie wypożycza — jedyne zamierzenie, przy którym ani
    // Pula instruktorów, ani pule sztuk w ogóle nie grają roli.
    intent: { hasPermit: true, wantsInstructor: false, rentals: [] },
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

/**
 * Zajęcie Osi na wyłączność. Dzisiaj bierze się wyłącznie z Rezerwacji;
 * Blokada (ticket #16) wejdzie tą samą drogą i musi dać ten sam wynik.
 */
describe('zajętość Osi', () => {
  // Pierwszy Blok poniedziałku: 10:00–12:00 czasu Warszawy, czyli 08:00–10:00 UTC.
  function zajecie(od: string, do_: string, laneId = OS_PISTOLETOWA): Occupancy {
    return { laneId, startsAt: new Date(od), endsAt: new Date(do_), withInstructor: false }
  }

  it('zdejmuje Blok pokryty Rezerwacją co do minuty', () => {
    const bloki = blokiDnia(
      pytanie({ occupancies: [zajecie('2026-06-15T08:00:00Z', '2026-06-15T10:00:00Z')] }),
    )

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.unavailableBecause).toBe('termin-zajety')
    expect(bloki[1]?.available).toBe(true)
  })

  it('zdejmuje Blok, którego Rezerwacja dotyka choćby kawałkiem', () => {
    const bloki = blokiDnia(
      pytanie({ occupancies: [zajecie('2026-06-15T09:30:00Z', '2026-06-15T09:45:00Z')] }),
    )

    expect(bloki[0]?.unavailableBecause).toBe('termin-zajety')
  })

  // Rezerwacja 08:00–10:00 i Blok 10:00–12:00 nie nakładają się: koniec jednej
  // jest początkiem drugiej. Bez tego rozkład ze stykającymi się Blokami
  // sprzedałby tylko co drugi.
  it('nie zdejmuje Bloku stykającego się początkiem z końcem Rezerwacji', () => {
    const bloki = blokiDnia(
      pytanie({
        schedules: [blok(600), blok(720)],
        occupancies: [zajecie('2026-06-15T08:00:00Z', '2026-06-15T10:00:00Z')],
      }),
    )

    expect(bloki[1]?.startsAt.toISOString()).toBe('2026-06-15T10:00:00.000Z')
    expect(bloki[1]?.available).toBe(true)
  })

  it('nie zdejmuje Bloku stykającego się końcem z początkiem Rezerwacji', () => {
    const bloki = blokiDnia(
      pytanie({ occupancies: [zajecie('2026-06-15T10:00:00Z', '2026-06-15T12:00:00Z')] }),
    )

    expect(bloki[0]?.available).toBe(true)
  })

  it('nie rusza Bloków innej Osi', () => {
    const bloki = blokiDnia(
      pytanie({
        occupancies: [
          zajecie('2026-06-15T08:00:00Z', '2026-06-15T10:00:00Z', OS_KARABINOWA),
        ],
      }),
    )

    expect(bloki.every((b) => b.available)).toBe(true)
  })

  it('zdejmuje Blok przecinający granicę doby, zajęty po północy', () => {
    const bloki = blokiDnia(
      pytanie({
        day: SOBOTA,
        schedules: [blok(1380, { weekday: 6, id: 'noc' })],
        // Blok trwa 21:00–23:00 UTC; Rezerwacja zahacza o jego drugą godzinę.
        occupancies: [zajecie('2026-06-20T22:00:00Z', '2026-06-20T23:00:00Z')],
        now: new Date('2026-06-01T09:00:00Z'),
      }),
    )

    expect(bloki[0]?.unavailableBecause).toBe('termin-zajety')
  })

  // Rezerwacja wpisana ręcznie w Panelu (ticket #17) wolno, żeby naruszała
  // limity Strzelnicy. Dostępność ma to znieść bez wyjątku i bez naprawiania:
  // Blok zajęty poza godzinami otwarcia zostaje przy powodzie, który mówi
  // o nim samym.
  it('nie przykrywa powodu mówiącego o samym Bloku', () => {
    const bloki = blokiDnia(
      pytanie({
        schedules: [blok(480)],
        occupancies: [zajecie('2026-06-15T06:00:00Z', '2026-06-15T08:00:00Z')],
      }),
    )

    expect(bloki[0]?.unavailableBecause).toBe('poza-godzinami-otwarcia')
  })
})

/**
 * Okno, w którym w ogóle warto szukać zajętości. Zbyt wąskie gubi kolizje po
 * cichu — Rezerwacja spoza okna nie zdejmie Bloku i termin sprzeda się dwa razy.
 */
describe('okno zajętości dnia', () => {
  it('zaczyna się o północy dnia Strzelnicy', () => {
    expect(occupancyWindow(PONIEDZIALEK, 'Europe/Warsaw').from.toISOString()).toBe(
      '2026-06-14T22:00:00.000Z',
    )
  })

  // Blok wolno zacząć o 23:30 i ciągnąć przez noc, więc ostatni moment, jaki
  // może zająć Blok poniedziałku, wypada dobę po końcu poniedziałku.
  it('kończy się dobę po końcu dnia, żeby zmieścić Blok przez granicę doby', () => {
    expect(occupancyWindow(PONIEDZIALEK, 'Europe/Warsaw').to.toISOString()).toBe(
      '2026-06-16T22:00:00.000Z',
    )
  })

  it('obejmuje każdy Blok, jaki rozkład może wystawić tego dnia', () => {
    const okno = occupancyWindow(SOBOTA, 'Europe/Warsaw')
    const bloki = blokiDnia(
      pytanie({
        day: SOBOTA,
        // Najwcześniejszy i najpóźniejszy Blok, jakie schemat dopuszcza:
        // początek na 00:00 i na 23:30, każdy o skrajnej długości.
        schedules: [
          blok(0, { weekday: 6, id: 'swit', durationMinutes: 120 }),
          blok(1410, { weekday: 6, id: 'noc', durationMinutes: 1470 }),
        ],
        openingHours: [{ weekday: 6, opensMinute: 0, closesMinute: 2880 }],
        now: new Date('2026-06-01T09:00:00Z'),
      }),
    )

    expect(bloki).toHaveLength(2)
    for (const b of bloki) {
      expect(b.startsAt.getTime()).toBeGreaterThanOrEqual(okno.from.getTime())
      expect(b.endsAt.getTime()).toBeLessThanOrEqual(okno.to.getTime())
    }
  })
})

/**
 * Pula instruktorów. Jedyna reguła dostępności, która nie mówi o Osi: liczy
 * się po całej Strzelnicy i rozstrzyga inaczej dla dwóch Osób rezerwujących
 * patrzących w ten sam Blok w tej samej chwili.
 */
describe('Pula instruktorów', () => {
  const BEZ_POZWOLENIA = { hasPermit: false, wantsInstructor: false, rentals: [] }
  const Z_POZWOLENIEM = { hasPermit: true, wantsInstructor: false, rentals: [] }
  const Z_POZWOLENIEM_I_INSTRUKTOREM = { hasPermit: true, wantsInstructor: true, rentals: [] }

  /** Cudza Rezerwacja trzymająca Instruktora w godzinach pierwszego Bloku. */
  function zInstruktorem(laneId = OS_KARABINOWA): Occupancy {
    return {
      laneId,
      startsAt: new Date('2026-06-15T08:00:00Z'),
      endsAt: new Date('2026-06-15T10:00:00Z'),
      withInstructor: true,
    }
  }

  it('nie dotyczy Osoby rezerwującej z Pozwoleniem, która Instruktora nie zamawia', () => {
    const bloki = blokiDnia(
      pytanie({ intent: Z_POZWOLENIEM, instructorPool: 0, occupancies: [zInstruktorem()] }),
    )

    expect(bloki.every((b) => b.available)).toBe(true)
  })

  it('dopuszcza Rezerwację bez Pozwolenia, dopóki w Puli zostało miejsce', () => {
    const bloki = blokiDnia(pytanie({ intent: BEZ_POZWOLENIA, instructorPool: 1 }))

    expect(bloki[0]?.available).toBe(true)
  })

  // Ostatnie wolne miejsce: Pula na dwóch, jeden Instruktor już zajęty.
  it('dopuszcza Rezerwację zajmującą ostatnie wolne miejsce w Puli', () => {
    const bloki = blokiDnia(
      pytanie({
        intent: BEZ_POZWOLENIA,
        instructorPool: 2,
        occupancies: [zInstruktorem()],
      }),
    )

    expect(bloki[0]?.available).toBe(true)
  })

  it('odrzuca Rezerwację, dla której w Puli nie ma już miejsca', () => {
    const bloki = blokiDnia(
      pytanie({
        intent: BEZ_POZWOLENIA,
        instructorPool: 1,
        occupancies: [zInstruktorem()],
      }),
    )

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.unavailableBecause).toBe('brak-instruktora')
  })

  // To jest owa różnica ze specyfikacji: ta sama Oś, ten sam Blok, ta sama
  // chwila — a odpowiedź zależy od tego, kto pyta.
  it('czyni ten sam Blok niedostępnym bez Pozwolenia i wolnym z Pozwoleniem', () => {
    const wyczerpana = { instructorPool: 1, occupancies: [zInstruktorem()] }

    expect(blokiDnia(pytanie({ ...wyczerpana, intent: BEZ_POZWOLENIA }))[0]?.available).toBe(
      false,
    )
    expect(blokiDnia(pytanie({ ...wyczerpana, intent: Z_POZWOLENIEM }))[0]?.available).toBe(true)
  })

  it('odrzuca Instruktora zamówionego dobrowolnie tak samo jak wymaganego', () => {
    const bloki = blokiDnia(
      pytanie({
        intent: Z_POZWOLENIEM_I_INSTRUKTOREM,
        instructorPool: 1,
        occupancies: [zInstruktorem()],
      }),
    )

    expect(bloki[0]?.unavailableBecause).toBe('brak-instruktora')
  })

  // Instruktor nadzoruje ludzi, nie stanowisko: Rezerwacja z innej Osi zabiera
  // to samo miejsce w Puli, co Rezerwacja z tej samej.
  it('liczy Instruktorów po całej Strzelnicy, nie po Osi', () => {
    const bloki = blokiDnia(
      pytanie({
        intent: BEZ_POZWOLENIA,
        instructorPool: 1,
        occupancies: [zInstruktorem(OS_KARABINOWA)],
      }),
    )

    expect(bloki[0]?.unavailableBecause).toBe('brak-instruktora')
  })

  it('nie liczy do Puli Rezerwacji, przy której Instruktora nie ma', () => {
    const bloki = blokiDnia(
      pytanie({
        intent: BEZ_POZWOLENIA,
        instructorPool: 1,
        occupancies: [{ ...zInstruktorem(), withInstructor: false }],
      }),
    )

    expect(bloki[0]?.available).toBe(true)
  })

  it('nie liczy do Puli Rezerwacji, która się z Blokiem nie styka', () => {
    const bloki = blokiDnia(
      pytanie({
        intent: BEZ_POZWOLENIA,
        instructorPool: 1,
        occupancies: [
          {
            ...zInstruktorem(),
            startsAt: new Date('2026-06-15T10:00:00Z'),
            endsAt: new Date('2026-06-15T12:00:00Z'),
          },
        ],
      }),
    )

    expect(bloki[0]?.available).toBe(true)
  })

  it('zamyka Strzelnicę bez Instruktorów dla każdego, kto go potrzebuje', () => {
    const bloki = blokiDnia(pytanie({ intent: BEZ_POZWOLENIA, instructorPool: 0 }))

    expect(bloki[0]?.unavailableBecause).toBe('brak-instruktora')
  })

  // Zajęta Oś mówi o samym Bloku, brak Instruktora — o zamierzeniach pytającego.
  // Osoba rezerwująca ma wiedzieć, czy zmiana deklaracji cokolwiek tu da.
  it('nie przykrywa zajętej Osi brakiem Instruktora', () => {
    const bloki = blokiDnia(
      pytanie({
        intent: BEZ_POZWOLENIA,
        instructorPool: 0,
        occupancies: [
          { ...zInstruktorem(OS_PISTOLETOWA), withInstructor: false },
        ],
      }),
    )

    expect(bloki[0]?.unavailableBecause).toBe('termin-zajety')
  })
})

/**
 * Pula sztuk Typu broni. Druga — po Puli instruktorów — reguła zależna od
 * zamierzeń pytającego, ale rozstrzygana inaczej: nie „zajęte / wolne", tylko
 * po sztukach, bo katalog dzieli się między Rezerwacje nakładające się w czasie.
 */
describe('Pula sztuk Typu broni', () => {
  // Cena stoi w katalogu obok puli, ale dostępności nie dotyczy — Typ droższy
  // nie jest przez to trudniej dostępny. Tutaj jest tylko dlatego, że katalog
  // Strzelnicy jest jeden i niesie jedno i drugie.
  const GLOCK: WeaponType = { id: 'glock', name: 'Glock 17', pool: 3, unitPrice: 5_000 }
  const SHADOW: WeaponType = { id: 'shadow', name: 'CZ Shadow 2', pool: 1, unitPrice: 6_000 }
  const KATALOG = [GLOCK, SHADOW]

  /** Cudze Wypożyczenie w godzinach pierwszego Bloku poniedziałku. */
  function wypozyczone(weaponTypeId: string, quantity: number): WeaponOccupancy {
    return {
      weaponTypeId,
      quantity,
      startsAt: new Date('2026-06-15T08:00:00Z'),
      endsAt: new Date('2026-06-15T10:00:00Z'),
    }
  }

  function zamawiajac(rentals: WeaponRental[], nadpisania: Partial<DayAvailabilityInput> = {}) {
    return blokiDnia(
      pytanie({
        weaponTypes: KATALOG,
        intent: { hasPermit: true, wantsInstructor: false, rentals },
        ...nadpisania,
      }),
    )
  }

  it('nie dotyczy Rezerwacji, która nie wypożycza niczego', () => {
    const bloki = zamawiajac([], { weaponOccupancies: [wypozyczone('shadow', 1)] })

    expect(bloki.every((b) => b.available)).toBe(true)
  })

  it('dopuszcza zamówienie, dopóki sztuk starcza', () => {
    const bloki = zamawiajac([{ weaponTypeId: 'glock', quantity: 2 }])

    expect(bloki[0]?.available).toBe(true)
  })

  it('dopuszcza zamówienie ostatniej wolnej sztuki Typu', () => {
    const bloki = zamawiajac([{ weaponTypeId: 'shadow', quantity: 1 }])

    expect(bloki[0]?.available).toBe(true)
  })

  it('odrzuca zamówienie o jedną sztukę większe niż Pula', () => {
    const bloki = zamawiajac([{ weaponTypeId: 'glock', quantity: 4 }])

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.unavailableBecause).toBe('brak-sztuk-broni')
  })

  // Sedno reguły: katalog dzieli się między Rezerwacje, które nakładają się
  // w czasie, więc sztuki liczy się sumą po nich wszystkich.
  it('sumuje sztuki po nakładających się Rezerwacjach', () => {
    const zajete = { weaponOccupancies: [wypozyczone('glock', 1), wypozyczone('glock', 1)] }

    expect(zamawiajac([{ weaponTypeId: 'glock', quantity: 1 }], zajete)[0]?.available).toBe(true)
    expect(zamawiajac([{ weaponTypeId: 'glock', quantity: 2 }], zajete)[0]?.available).toBe(false)
  })

  it('dopuszcza ostatnią sztukę pozostałą po cudzych Rezerwacjach', () => {
    const bloki = zamawiajac([{ weaponTypeId: 'glock', quantity: 1 }], {
      weaponOccupancies: [wypozyczone('glock', 2)],
    })

    expect(bloki[0]?.available).toBe(true)
  })

  it('nie liczy Wypożyczenia, które się z Blokiem nie styka', () => {
    const bloki = zamawiajac([{ weaponTypeId: 'shadow', quantity: 1 }], {
      weaponOccupancies: [
        {
          ...wypozyczone('shadow', 1),
          startsAt: new Date('2026-06-15T10:00:00Z'),
          endsAt: new Date('2026-06-15T12:00:00Z'),
        },
      ],
    })

    expect(bloki[0]?.available).toBe(true)
  })

  it('nie odejmuje sztuk jednego Typu od Puli drugiego', () => {
    const bloki = zamawiajac([{ weaponTypeId: 'shadow', quantity: 1 }], {
      weaponOccupancies: [wypozyczone('glock', 3)],
    })

    expect(bloki[0]?.available).toBe(true)
  })

  // Typ spoza katalogu Strzelnicy nie ma ani jednej sztuki do wydania. Odmowa
  // jest ta sama, co przy Puli wyczerpanej — obie znaczą „nie ma czym".
  it('odrzuca zamówienie Typu, którego katalog nie zna', () => {
    const bloki = zamawiajac([{ weaponTypeId: 'nieznany', quantity: 1 }])

    expect(bloki[0]?.unavailableBecause).toBe('brak-sztuk-broni')
  })

  // Ta sama różnica, co przy Puli instruktorów: ten sam Blok, ta sama chwila,
  // a odpowiedź zależy od tego, o co pyta Osoba rezerwująca.
  it('czyni ten sam Blok wolnym bez zamówienia i niedostępnym z zamówieniem', () => {
    const wyczerpany = { weaponOccupancies: [wypozyczone('shadow', 1)] }

    expect(zamawiajac([], wyczerpany)[0]?.available).toBe(true)
    expect(zamawiajac([{ weaponTypeId: 'shadow', quantity: 1 }], wyczerpany)[0]?.available).toBe(
      false,
    )
  })

  it('nie przykrywa zajętej Osi brakiem sztuk', () => {
    const bloki = zamawiajac([{ weaponTypeId: 'glock', quantity: 4 }], {
      occupancies: [
        {
          laneId: OS_PISTOLETOWA,
          startsAt: new Date('2026-06-15T08:00:00Z'),
          endsAt: new Date('2026-06-15T10:00:00Z'),
          withInstructor: false,
        },
      ],
    })

    expect(bloki[0]?.unavailableBecause).toBe('termin-zajety')
  })
})

/**
 * Pozostałe sztuki każdego Typu w konkretnym terminie. Widget pyta o to wprost,
 * żeby ograniczyć wybór do liczby faktycznie dostępnej — a nie pozwolić zamówić
 * i dopiero potem odmówić.
 */
describe('pozostałe sztuki Typu broni', () => {
  const KATALOG: WeaponType[] = [
    { id: 'glock', name: 'Glock 17', pool: 3, unitPrice: 5_000 },
    { id: 'shadow', name: 'CZ Shadow 2', pool: 1, unitPrice: 6_000 },
  ]

  const OD = new Date('2026-06-15T08:00:00Z')
  const DO = new Date('2026-06-15T10:00:00Z')

  function pozostale(weaponOccupancies: WeaponOccupancy[] = []) {
    return remainingWeapons({ weaponTypes: KATALOG, weaponOccupancies, startsAt: OD, endsAt: DO })
  }

  function wypozyczone(weaponTypeId: string, quantity: number): WeaponOccupancy {
    return { weaponTypeId, quantity, startsAt: OD, endsAt: DO }
  }

  it('zwraca całą Pulę, gdy nikt nic nie wypożycza', () => {
    expect(pozostale()).toEqual([
      { type: KATALOG[0], remaining: 3 },
      { type: KATALOG[1], remaining: 1 },
    ])
  })

  it('odejmuje sztuki z nakładających się Rezerwacji', () => {
    expect(pozostale([wypozyczone('glock', 1), wypozyczone('glock', 1)])[0]?.remaining).toBe(1)
  })

  it('pomija Wypożyczenia spoza terminu', () => {
    const poza = {
      ...wypozyczone('glock', 3),
      startsAt: new Date('2026-06-15T10:00:00Z'),
      endsAt: new Date('2026-06-15T12:00:00Z'),
    }

    expect(pozostale([poza])[0]?.remaining).toBe(3)
  })

  // Rezerwacja wpisana ręcznie w Panelu (ticket #17) wolno naruszyć limity
  // Strzelnicy. Dostępność ma to znieść bez wyjątku i bez „naprawiania" —
  // pozostało zero sztuk, a nie minus jedna.
  it('nie schodzi poniżej zera, gdy Strzelnica wydała więcej, niż ma', () => {
    expect(pozostale([wypozyczone('shadow', 3)])[1]?.remaining).toBe(0)
  })

  it('zachowuje kolejność katalogu, żeby lista nie skakała przy przeliczeniu', () => {
    expect(pozostale([wypozyczone('glock', 1)]).map((pozycja) => pozycja.type.id)).toEqual([
      'glock',
      'shadow',
    ])
  })
})
