import { describe, expect, it } from 'vitest'
import type { ClosureDraft, DayAvailabilityInput, LaneClosure, Occupancy } from './index.ts'
import {
  closureOccupancy,
  closureProblems,
  MalformedClosureRequestError,
  readClosureRequest,
  scheduleForDay,
  writeClosureRequest,
} from './index.ts'

const OS_PISTOLETOWA = 'os-1'
const OS_KARABINOWA = 'os-2'

function blokada(dane: Partial<LaneClosure> = {}): LaneClosure {
  return {
    id: 'blokada-1',
    laneId: OS_PISTOLETOWA,
    startsAt: new Date('2026-06-15T08:00:00Z'),
    endsAt: new Date('2026-06-15T10:00:00Z'),
    reason: 'Serwis wentylacji',
    ...dane,
  }
}

function zamiar(dane: Partial<ClosureDraft> = {}): ClosureDraft {
  return {
    laneId: OS_PISTOLETOWA,
    startsAt: new Date('2026-06-15T08:00:00Z'),
    endsAt: new Date('2026-06-15T10:00:00Z'),
    reason: 'Serwis wentylacji',
    ...dane,
  }
}

function zajecie(od: string, do_: string, laneId = OS_PISTOLETOWA): Occupancy {
  return { laneId, startsAt: new Date(od), endsAt: new Date(do_), withInstructor: false }
}

describe('zastrzeżenia do Blokady', () => {
  it('przepuszcza Blokadę na wolnej Osi', () => {
    expect(closureProblems({ draft: zamiar(), occupancies: [] })).toEqual([])
  })

  // Powód jest tu tym, czym przy odwołaniu: bez niego kolejna zmiana obsługi
  // widzi Oś wyłączoną ze sprzedaży i nie wie, czy wolno ją włączyć.
  it('wytyka Blokadę bez powodu', () => {
    expect(closureProblems({ draft: zamiar({ reason: '   ' }), occupancies: [] })).toEqual([
      'brak-powodu',
    ])
  })

  it('wytyka zakres, którego nie ma — puste pole albo koniec przed początkiem', () => {
    expect(closureProblems({ draft: zamiar({ startsAt: null }), occupancies: [] })).toEqual([
      'zly-zakres',
    ])
    expect(closureProblems({ draft: zamiar({ endsAt: null }), occupancies: [] })).toEqual([
      'zly-zakres',
    ])
    expect(
      closureProblems({
        draft: zamiar({ endsAt: new Date('2026-06-15T08:00:00Z') }),
        occupancies: [],
      }),
    ).toEqual(['zly-zakres'])
  })

  // Blokada na czas zajęty przez Rezerwację nie wchodzi: najpierw trzeba tę
  // Rezerwację odwołać, bo klient ma się dowiedzieć, a nie zastać zamknięte.
  it('nie wpuszcza Blokady na termin trzymany przez Rezerwację', () => {
    expect(
      closureProblems({
        draft: zamiar(),
        occupancies: [zajecie('2026-06-15T09:00:00Z', '2026-06-15T11:00:00Z')],
      }),
    ).toEqual(['termin-zajety'])
  })

  // Jedna reguła kolizji dla całej Zajętości: Blokada nie wchodzi też na Blokadę.
  it('nie wpuszcza Blokady na termin trzymany przez inną Blokadę', () => {
    expect(
      closureProblems({
        draft: zamiar(),
        occupancies: [closureOccupancy(blokada())],
      }),
    ).toEqual(['termin-zajety'])
  })

  it('przepuszcza Blokadę stykającą się z Zajętością końcem i początkiem', () => {
    expect(
      closureProblems({
        draft: zamiar(),
        occupancies: [
          zajecie('2026-06-15T06:00:00Z', '2026-06-15T08:00:00Z'),
          zajecie('2026-06-15T10:00:00Z', '2026-06-15T12:00:00Z'),
        ],
      }),
    ).toEqual([])
  })

  it('nie patrzy na Zajętość innej Osi', () => {
    expect(
      closureProblems({
        draft: zamiar(),
        occupancies: [zajecie('2026-06-15T08:00:00Z', '2026-06-15T10:00:00Z', OS_KARABINOWA)],
      }),
    ).toEqual([])
  })

  // Wszystkie zastrzeżenia naraz, tak jak przy zgłoszeniu Rezerwacji: obsługa
  // ma zobaczyć całą listę poprawek za jednym razem.
  it('wypisuje zastrzeżenie o terminie i o powodzie razem', () => {
    expect(
      closureProblems({
        draft: zamiar({ reason: '' }),
        occupancies: [zajecie('2026-06-15T09:00:00Z', '2026-06-15T11:00:00Z')],
      }),
    ).toEqual(['termin-zajety', 'brak-powodu'])
  })

  // Zakresu nie ma czym zestawić z Zajętością, więc kolizja nie ma o czym
  // orzekać — a „termin zajęty" przy pustym polu byłoby zdaniem o niczym.
  it('nie orzeka o kolizji, gdy zakresu nie ma', () => {
    expect(
      closureProblems({
        draft: zamiar({ startsAt: null }),
        occupancies: [zajecie('2026-06-15T09:00:00Z', '2026-06-15T11:00:00Z')],
      }),
    ).toEqual(['zly-zakres'])
  })
})

/**
 * Blokada w kształcie Zajętości — i to jest cała treść zdania „zajmuje Oś na
 * wyłączność tak samo jak Rezerwacja": dostępność nie dowiaduje się, że pyta
 * o Blokadę.
 */
describe('Blokada w dostępności Bloków', () => {
  function pytanie(occupancies: readonly Occupancy[]): DayAvailabilityInput {
    return {
      // Poniedziałek 15 czerwca 2026, czas letni w Warszawie (UTC+2): Blok
      // 10:00–12:00 to 08:00–10:00 UTC.
      day: '2026-06-15',
      timeZone: 'Europe/Warsaw',
      laneId: OS_PISTOLETOWA,
      schedules: [
        {
          id: 'blok-600',
          laneId: OS_PISTOLETOWA,
          weekday: 1,
          startMinute: 600,
          durationMinutes: 120,
        },
      ],
      openingHours: [{ weekday: 1, opensMinute: 600, closesMinute: 1320 }],
      closedDates: [],
      occupancies,
      instructorPool: 1,
      weaponTypes: [],
      weaponOccupancies: [],
      intent: { hasPermit: true, wantsInstructor: false, rentals: [] },
      timeRules: { horizonDays: 30, minLeadMinutes: 0, cancellationWindowHours: 24 },
      now: new Date('2026-06-01T09:00:00Z'),
    }
  }

  it('zdejmuje Blok pokryty Blokadą co do minuty', () => {
    const bloki = scheduleForDay(pytanie([closureOccupancy(blokada())])).blocks

    expect(bloki[0]?.available).toBe(false)
    expect(bloki[0]?.refusals[0]).toBe('termin-zajety')
  })

  // Blokada nie musi trafiać w siatkę Bloków: obsługa zamyka Oś na czas
  // serwisu, a nie na wielokrotność Slotu. Kwadrans w środku Bloku zdejmuje
  // cały Blok, bo Bloku nie da się sprzedać w połowie.
  it('zdejmuje Blok pokryty Blokadą częściowo', () => {
    const bloki = scheduleForDay(
      pytanie([
        closureOccupancy(
          blokada({
            startsAt: new Date('2026-06-15T09:30:00Z'),
            endsAt: new Date('2026-06-15T09:45:00Z'),
          }),
        ),
      ]),
    ).blocks

    expect(bloki[0]?.refusals[0]).toBe('termin-zajety')
  })

  it('zdejmuje Blok, który Blokada obejmuje z zapasem po obu stronach', () => {
    const bloki = scheduleForDay(
      pytanie([
        closureOccupancy(
          blokada({
            startsAt: new Date('2026-06-14T00:00:00Z'),
            endsAt: new Date('2026-06-16T00:00:00Z'),
          }),
        ),
      ]),
    ).blocks

    expect(bloki[0]?.refusals[0]).toBe('termin-zajety')
  })

  it('nie zdejmuje Bloku stykającego się z Blokadą', () => {
    const bloki = scheduleForDay(
      pytanie([
        closureOccupancy(
          blokada({
            startsAt: new Date('2026-06-15T06:00:00Z'),
            endsAt: new Date('2026-06-15T08:00:00Z'),
          }),
        ),
      ]),
    ).blocks

    expect(bloki[0]?.available).toBe(true)
  })

  it('nie zdejmuje Bloku Blokadą innej Osi', () => {
    const bloki = scheduleForDay(
      pytanie([closureOccupancy(blokada({ laneId: OS_KARABINOWA }))]),
    ).blocks

    expect(bloki[0]?.available).toBe(true)
  })

  /**
   * Blokada nie zajmuje miejsca w Puli instruktorów — nie ma przy niej nikogo
   * do nadzorowania. Oś zamknięta na serwis nie ma odbierać Instruktora
   * Rezerwacji na Osi obok.
   */
  it('nie zabiera miejsca w Puli instruktorów', () => {
    const bloki = scheduleForDay({
      ...pytanie([closureOccupancy(blokada({ laneId: OS_KARABINOWA }))]),
      instructorPool: 1,
      intent: { hasPermit: false, wantsInstructor: false, rentals: [] },
    }).blocks

    expect(bloki[0]?.available).toBe(true)
  })
})

describe('żądanie Blokady w sieci', () => {
  const ZADANIE = {
    laneId: OS_PISTOLETOWA,
    startsAt: '2026-06-15T08:00:00.000Z',
    endsAt: '2026-06-15T10:00:00.000Z',
    reason: 'Serwis wentylacji',
  }

  it('czyta chwile z zapisu ISO', () => {
    expect(readClosureRequest(ZADANIE)).toEqual({
      laneId: OS_PISTOLETOWA,
      startsAt: new Date('2026-06-15T08:00:00Z'),
      endsAt: new Date('2026-06-15T10:00:00Z'),
      reason: 'Serwis wentylacji',
    })
  })

  it('wraca do zapisu ISO tym samym kształtem', () => {
    expect(writeClosureRequest(readClosureRequest(ZADANIE))).toEqual(ZADANIE)
  })

  // Powód pusty przechodzi kształtem, a zatrzymuje się na `closureProblems` —
  // tej samej funkcji, którą pyta Panel. Odsianie go tutaj czyniłoby
  // „brak-powodu" odpowiedzią, której serwer nigdy nie udziela.
  it('przepuszcza pusty powód, bo o nim orzeka zastrzeżenie', () => {
    expect(readClosureRequest({ ...ZADANIE, reason: '  ' }).reason).toBe('')
  })

  it('odmawia żądaniu bez Osi, bez chwil i nie-obiektowi', () => {
    for (const zle of [
      null,
      'blokada',
      [ZADANIE],
      { ...ZADANIE, laneId: '' },
      { ...ZADANIE, startsAt: 'przedwczoraj' },
      { ...ZADANIE, endsAt: 123 },
      { ...ZADANIE, reason: null },
    ]) {
      expect(() => readClosureRequest(zle)).toThrow(MalformedClosureRequestError)
    }
  })
})
