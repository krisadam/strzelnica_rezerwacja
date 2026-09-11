import { describe, expect, it } from 'vitest'
import type { ScheduleBlock } from './index.ts'
import {
  copyDay,
  formatScheduleMinute,
  laneWeek,
  MalformedScheduleRequestError,
  readScheduleRequest,
  sameWeek,
  scheduleProblems,
  WEEKDAYS,
} from './index.ts'

const OS_PISTOLETOWA = 'os-1'
const OS_KARABINOWA = 'os-2'

/** Blok rozkładu; domyślnie poniedziałkowy 10:00–12:00. */
function blok(dane: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return { weekday: 1, startMinute: 600, durationMinutes: 120, ...dane }
}

describe('zastrzeżenia do rozkładu Osi', () => {
  it('przepuszcza tydzień pusty — Oś, której Strzelnica w ogóle nie wystawia', () => {
    expect(scheduleProblems([])).toEqual([])
  })

  it('przepuszcza Bloki stykające się końcem z początkiem', () => {
    // Przedział domknięty od początku, otwarty od końca — tak samo jak przy
    // zajętości Osi. Rozkład 10:00–12:00 i 12:00–14:00 jest rozkładem bez
    // przerwy technicznej, a nie rozkładem błędnym.
    expect(
      scheduleProblems([blok(), blok({ startMinute: 720 })]),
    ).toEqual([])
  })

  it('wytyka początek poza siatką Slotów', () => {
    expect(scheduleProblems([blok({ startMinute: 615 })])).toEqual(['poza-siatka'])
  })

  it('wytyka początek spoza doby', () => {
    // Doba zaczyna się o minucie zerowej i kończy przed 1440: Blok zaczynający
    // się o 24:00 jest Blokiem dnia następnego, a nie Blokiem tego dnia.
    expect(scheduleProblems([blok({ startMinute: -30 })])).toEqual(['poza-siatka'])
    expect(scheduleProblems([blok({ startMinute: 1440 })])).toEqual(['poza-siatka'])
  })

  it('wytyka długość, która nie jest dodatnią wielokrotnością Slotu', () => {
    expect(scheduleProblems([blok({ durationMinutes: 45 })])).toEqual(['zla-dlugosc'])
    expect(scheduleProblems([blok({ durationMinutes: 0 })])).toEqual(['zla-dlugosc'])
    expect(scheduleProblems([blok({ durationMinutes: -60 })])).toEqual(['zla-dlugosc'])
  })

  it('wytyka Blok dłuższy niż doba', () => {
    // Blok trwający dłużej niż doba zachodziłby sam na siebie w tygodniowym
    // rytmie rozkładu — a zarazem nie jest niczym, co Strzelnica sprzedaje.
    expect(scheduleProblems([blok({ durationMinutes: 1470 })])).toEqual(['zla-dlugosc'])
  })

  it('przepuszcza Blok trwający dokładnie dobę', () => {
    expect(scheduleProblems([blok({ startMinute: 0, durationMinutes: 1440 })])).toEqual([])
  })

  it('wytyka dwa Bloki nachodzące na siebie tego samego dnia', () => {
    expect(scheduleProblems([blok(), blok({ startMinute: 660 })])).toEqual(['nachodzace-bloki'])
  })

  it('wytyka Blok wpisany dwa razy', () => {
    expect(scheduleProblems([blok(), blok()])).toEqual(['nachodzace-bloki'])
  })

  it('przepuszcza ten sam Blok w dwóch różnych dniach tygodnia', () => {
    expect(scheduleProblems([blok({ weekday: 1 }), blok({ weekday: 2 })])).toEqual([])
  })

  it('wytyka Blok przechodzący przez północ na Blok dnia następnego', () => {
    // Blok wolno przeciągnąć przez granicę doby (sobota 23:00 + 120 minut),
    // więc zachodzenie liczy się na osi całego tygodnia, a nie w obrębie
    // jednego dnia. Inaczej sobotni Blok 23:00–01:00 i niedzielny 00:00–02:00
    // sprzedałyby tę samą godzinę dwa razy.
    expect(
      scheduleProblems([
        blok({ weekday: 6, startMinute: 1380, durationMinutes: 120 }),
        blok({ weekday: 7, startMinute: 0, durationMinutes: 120 }),
      ]),
    ).toEqual(['nachodzace-bloki'])
  })

  it('wytyka Blok niedzielny przechodzący przez północ na poniedziałkowy', () => {
    // Rytm rozkładu jest tygodniowy i zamknięty w koło: po niedzieli wraca
    // poniedziałek tej samej Osi, a nie pustka.
    expect(
      scheduleProblems([
        blok({ weekday: 7, startMinute: 1380, durationMinutes: 120 }),
        blok({ weekday: 1, startMinute: 0, durationMinutes: 60 }),
      ]),
    ).toEqual(['nachodzace-bloki'])
  })

  it('nie orzeka o zachodzeniu, dopóki Bloki nie trzymają się siatki', () => {
    // Bez poprawnych długości nie ma czego zestawiać ze sobą: „nachodzące
    // Bloki" przy długości ujemnej byłoby zdaniem o niczym.
    expect(scheduleProblems([blok({ durationMinutes: -60 }), blok()])).toEqual(['zla-dlugosc'])
  })

  it('wymienia każde zastrzeżenie raz, choćby dotyczyło wielu Bloków', () => {
    expect(scheduleProblems([blok({ startMinute: 615 }), blok({ startMinute: 645 })])).toEqual([
      'poza-siatka',
    ])
  })
})

describe('rozkład jednej Osi', () => {
  const rozklad = [
    { id: 'p-1', laneId: OS_PISTOLETOWA, weekday: 1 as const, startMinute: 600, durationMinutes: 120 },
    { id: 'p-2', laneId: OS_PISTOLETOWA, weekday: 3 as const, startMinute: 540, durationMinutes: 60 },
    { id: 'k-1', laneId: OS_KARABINOWA, weekday: 1 as const, startMinute: 660, durationMinutes: 90 },
  ]

  it('bierze Bloki wskazanej Osi i gubi jej identyfikator', () => {
    expect(laneWeek(rozklad, OS_PISTOLETOWA)).toEqual([
      { weekday: 1, startMinute: 600, durationMinutes: 120 },
      { weekday: 3, startMinute: 540, durationMinutes: 60 },
    ])
  })

  it('oddaje Bloki w porządku tygodnia, nie w porządku odczytu', () => {
    expect(
      laneWeek(
        [
          { id: 'b', laneId: OS_PISTOLETOWA, weekday: 3, startMinute: 540, durationMinutes: 60 },
          { id: 'c', laneId: OS_PISTOLETOWA, weekday: 1, startMinute: 720, durationMinutes: 60 },
          { id: 'a', laneId: OS_PISTOLETOWA, weekday: 1, startMinute: 600, durationMinutes: 60 },
        ],
        OS_PISTOLETOWA,
      ),
    ).toEqual([
      { weekday: 1, startMinute: 600, durationMinutes: 60 },
      { weekday: 1, startMinute: 720, durationMinutes: 60 },
      { weekday: 3, startMinute: 540, durationMinutes: 60 },
    ])
  })

  it('oddaje pusty tydzień Osi, której rozkład nic nie wystawia', () => {
    expect(laneWeek(rozklad, 'os-nieznana')).toEqual([])
  })
})

describe('kopiowanie rozkładu jednego dnia na inne', () => {
  const tydzien = [
    blok({ weekday: 1, startMinute: 600 }),
    blok({ weekday: 1, startMinute: 780 }),
    blok({ weekday: 5, startMinute: 900 }),
  ]

  it('przepisuje Bloki dnia źródłowego na wskazane dni', () => {
    expect(copyDay({ week: tydzien, from: 1, to: [2] })).toEqual([
      blok({ weekday: 1, startMinute: 600 }),
      blok({ weekday: 1, startMinute: 780 }),
      blok({ weekday: 2, startMinute: 600 }),
      blok({ weekday: 2, startMinute: 780 }),
      blok({ weekday: 5, startMinute: 900 }),
    ])
  })

  it('zastępuje rozkład dnia docelowego, zamiast dopisywać się do niego', () => {
    // Kopiowanie jest tu przepisaniem dnia, a nie dołożeniem Bloków: dzień
    // docelowy ma po nim wyglądać tak samo jak źródłowy, a nie jak suma obu —
    // suma nachodziłaby sama na siebie przy pierwszym rozkładzie o tych
    // samych godzinach.
    expect(copyDay({ week: tydzien, from: 1, to: [5] })).toEqual([
      blok({ weekday: 1, startMinute: 600 }),
      blok({ weekday: 1, startMinute: 780 }),
      blok({ weekday: 5, startMinute: 600 }),
      blok({ weekday: 5, startMinute: 780 }),
    ])
  })

  it('czyści dzień docelowy, gdy dzień źródłowy nie ma ani jednego Bloku', () => {
    // Dzień bez Bloków jest odpowiedzią, a nie brakiem danych: Strzelnica
    // w czwartek nie wystawia nic i kopiowanie ma to właśnie przenieść.
    expect(copyDay({ week: tydzien, from: 4, to: [5] })).toEqual([
      blok({ weekday: 1, startMinute: 600 }),
      blok({ weekday: 1, startMinute: 780 }),
    ])
  })

  it('przepisuje na wiele dni naraz', () => {
    expect(copyDay({ week: [blok({ weekday: 1 })], from: 1, to: [2, 3, 4] })).toEqual([
      blok({ weekday: 1 }),
      blok({ weekday: 2 }),
      blok({ weekday: 3 }),
      blok({ weekday: 4 }),
    ])
  })

  it('nie rusza dnia źródłowego wskazanego zarazem jako docelowy', () => {
    expect(copyDay({ week: tydzien, from: 1, to: [1, 2] })).toEqual([
      blok({ weekday: 1, startMinute: 600 }),
      blok({ weekday: 1, startMinute: 780 }),
      blok({ weekday: 2, startMinute: 600 }),
      blok({ weekday: 2, startMinute: 780 }),
      blok({ weekday: 5, startMinute: 900 }),
    ])
  })

  it('bez dnia docelowego oddaje tydzień nietknięty', () => {
    expect(copyDay({ week: tydzien, from: 1, to: [] })).toEqual(tydzien)
  })
})

describe('żądanie zapisu rozkładu', () => {
  const zadanie = {
    laneId: OS_PISTOLETOWA,
    week: [{ weekday: 1, startMinute: 600, durationMinutes: 120 }],
  }

  it('czyta żądanie o właściwym kształcie', () => {
    expect(readScheduleRequest(zadanie)).toEqual({
      laneId: OS_PISTOLETOWA,
      week: [{ weekday: 1, startMinute: 600, durationMinutes: 120 }],
    })
  })

  it('czyta żądanie o pustym tygodniu — rozkład da się wyczyścić', () => {
    expect(readScheduleRequest({ laneId: OS_PISTOLETOWA, week: [] })).toEqual({
      laneId: OS_PISTOLETOWA,
      week: [],
    })
  })

  it('odmawia żądaniu bez Osi', () => {
    expect(() => readScheduleRequest({ week: [] })).toThrow(MalformedScheduleRequestError)
    expect(() => readScheduleRequest({ laneId: '  ', week: [] })).toThrow(
      MalformedScheduleRequestError,
    )
  })

  it('odmawia żądaniu bez tygodnia', () => {
    expect(() => readScheduleRequest({ laneId: OS_PISTOLETOWA })).toThrow(
      MalformedScheduleRequestError,
    )
  })

  it('odmawia żądaniu, którego dzień tygodnia nie jest dniem tygodnia', () => {
    // Kształt, a nie reguła: dnia ósmego nie ma czym wyrazić, więc nie ma o co
    // pytać `scheduleProblems`. Inaczej niż początek poza siatką — ten jest
    // liczbą minut, tyle że złą, i orzeka o nim zastrzeżenie.
    expect(() =>
      readScheduleRequest({
        laneId: OS_PISTOLETOWA,
        week: [{ weekday: 8, startMinute: 600, durationMinutes: 120 }],
      }),
    ).toThrow(MalformedScheduleRequestError)
  })

  it('odmawia żądaniu, którego minuty nie są liczbami całkowitymi', () => {
    expect(() =>
      readScheduleRequest({
        laneId: OS_PISTOLETOWA,
        week: [{ weekday: 1, startMinute: '600', durationMinutes: 120 }],
      }),
    ).toThrow(MalformedScheduleRequestError)
    expect(() =>
      readScheduleRequest({
        laneId: OS_PISTOLETOWA,
        week: [{ weekday: 1, startMinute: 600, durationMinutes: 90.5 }],
      }),
    ).toThrow(MalformedScheduleRequestError)
  })

  it('odmawia treści, która nie jest obiektem', () => {
    expect(() => readScheduleRequest(null)).toThrow(MalformedScheduleRequestError)
    expect(() => readScheduleRequest([zadanie])).toThrow(MalformedScheduleRequestError)
  })
})

describe('godzina rozkładu', () => {
  it('pisze minutę od północy jako godzinę zegara Strzelnicy', () => {
    expect(formatScheduleMinute(0)).toBe('00:00')
    expect(formatScheduleMinute(600)).toBe('10:00')
    expect(formatScheduleMinute(1410)).toBe('23:30')
  })

  it('zawija godzinę Bloku przechodzącego przez północ', () => {
    // Koniec Bloku 23:00 + 120 minut jest pierwszą godziną dnia następnego,
    // a nie „25:00" — o tym, że to już jutro, mówi ekran obok tej godziny.
    expect(formatScheduleMinute(1440)).toBe('00:00')
    expect(formatScheduleMinute(1500)).toBe('01:00')
  })
})

describe('dni tygodnia', () => {
  it('wymienia tydzień w porządku ISO — od poniedziałku do niedzieli', () => {
    expect(WEEKDAYS).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe('równość dwóch tygodni', () => {
  it('nie odróżnia tygodni wpisanych w innej kolejności', () => {
    // Kolejność Bloków nie jest treścią rozkładu: ten sam tydzień wpisany od
    // soboty jest tym samym tygodniem.
    expect(
      sameWeek(
        [blok({ weekday: 1 }), blok({ weekday: 6 })],
        [blok({ weekday: 6 }), blok({ weekday: 1 })],
      ),
    ).toBe(true)
  })

  it('odróżnia tygodnie różniące się jednym Blokiem', () => {
    expect(sameWeek([blok()], [blok(), blok({ startMinute: 780 })])).toBe(false)
    expect(sameWeek([blok()], [blok({ durationMinutes: 60 })])).toBe(false)
    expect(sameWeek([blok()], [blok({ weekday: 2 })])).toBe(false)
  })

  it('zna tydzień pusty', () => {
    expect(sameWeek([], [])).toBe(true)
    expect(sameWeek([], [blok()])).toBe(false)
  })
})
