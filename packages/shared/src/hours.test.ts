import { describe, expect, it } from 'vitest'
import type { BookedTerm, CalendarException, ExceptionRequest, OpeningHours } from './index.ts'
import {
  exceptionProblems,
  hoursConflicts,
  hoursForDay,
  MalformedHoursRequestError,
  MAX_CLOSES_MINUTE,
  readExceptionRequest,
  readHoursRequest,
  sameOpeningHours,
  weekHoursProblems,
} from './index.ts'

// Poniedziałek 15 czerwca 2026 (czas letni w Warszawie, UTC+2).
const PONIEDZIALEK = '2026-06-15'
// Sobota 20 czerwca 2026 — dzień, który w seedzie domyka się po północy.
const SOBOTA = '2026-06-20'

const STREFA = 'Europe/Warsaw'

/** Tydzień seeda w skrócie: poniedziałek 10:00–22:00, sobota 09:00–01:00. */
const TYDZIEN: OpeningHours[] = [
  { weekday: 1, opensMinute: 600, closesMinute: 1320 },
  { weekday: 6, opensMinute: 540, closesMinute: 1500 },
]

function wyjatek(dane: Partial<CalendarException> = {}): CalendarException {
  return { day: PONIEDZIALEK, reason: 'Święto', hours: null, ...dane }
}

function zadanie(dane: Partial<ExceptionRequest> = {}): ExceptionRequest {
  return {
    day: PONIEDZIALEK,
    exception: { reason: 'Święto', hours: null },
    ...dane,
  }
}

/** Rezerwacja jako sam termin — tyle, ile trzeba, żeby orzec o kolizji. */
function rezerwacja(od: string, doKiedy: string, id = 'rezerwacja-1'): BookedTerm {
  return { id, startsAt: new Date(od), endsAt: new Date(doKiedy) }
}

describe('godziny otwarcia jednego dnia', () => {
  it('bierze je z tygodnia, gdy dnia nie dotyczy żaden wyjątek', () => {
    expect(hoursForDay({ day: PONIEDZIALEK, openingHours: TYDZIEN, exceptions: [] })).toEqual({
      opensMinute: 600,
      closesMinute: 1320,
    })
  })

  it('zamyka dzień, którego tydzień nie wymienia', () => {
    // Brak wiersza znaczy dzień zamknięty — ta sama konwencja, co w schemacie.
    expect(hoursForDay({ day: '2026-06-16', openingHours: TYDZIEN, exceptions: [] })).toBeNull()
  })

  it('zamyka dzień objęty wyjątkiem bez godzin', () => {
    expect(
      hoursForDay({ day: PONIEDZIALEK, openingHours: TYDZIEN, exceptions: [wyjatek()] }),
    ).toBeNull()
  })

  it('podstawia godziny wyjątku w miejsce tygodniowych', () => {
    // Wigilia otwarta do południa: wyjątek nie zamyka dnia, tylko go skraca.
    const wigilia = wyjatek({ hours: { opensMinute: 600, closesMinute: 720 } })

    expect(
      hoursForDay({ day: PONIEDZIALEK, openingHours: TYDZIEN, exceptions: [wigilia] }),
    ).toEqual({ opensMinute: 600, closesMinute: 720 })
  })

  it('otwiera wyjątkiem dzień, którego tydzień w ogóle nie wymienia', () => {
    // Wtorek jest w tym tygodniu zamknięty, a jednak Strzelnica otwiera go
    // jednorazowo: wyjątek mówi o dniu wszystko, a nie poprawia tygodnia.
    const wtorek = wyjatek({ day: '2026-06-16', hours: { opensMinute: 540, closesMinute: 1200 } })

    expect(hoursForDay({ day: '2026-06-16', openingHours: TYDZIEN, exceptions: [wtorek] })).toEqual(
      { opensMinute: 540, closesMinute: 1200 },
    )
  })

  it('nie dotyka dni sąsiednich', () => {
    expect(
      hoursForDay({ day: SOBOTA, openingHours: TYDZIEN, exceptions: [wyjatek({ day: SOBOTA })] }),
    ).toBeNull()
    expect(
      hoursForDay({ day: SOBOTA, openingHours: TYDZIEN, exceptions: [wyjatek()] }),
    ).toEqual({ opensMinute: 540, closesMinute: 1500 })
  })
})

describe('zastrzeżenia do tygodnia godzin', () => {
  it('przepuszcza tydzień seeda', () => {
    expect(weekHoursProblems(TYDZIEN)).toEqual([])
  })

  it('przepuszcza tydzień pusty', () => {
    // Strzelnica zamknięta przez siedem dni jest odpowiedzią, a nie
    // przeoczeniem — tak samo jak Oś bez ani jednego Bloku.
    expect(weekHoursProblems([])).toEqual([])
  })

  it('przepuszcza dzień domykający się po północy', () => {
    expect(
      weekHoursProblems([{ weekday: 6, opensMinute: 540, closesMinute: MAX_CLOSES_MINUTE }]),
    ).toEqual([])
  })

  it('wytyka zamknięcie przed otwarciem', () => {
    expect(weekHoursProblems([{ weekday: 1, opensMinute: 1320, closesMinute: 600 }])).toEqual([
      'zle-godziny',
    ])
  })

  it('wytyka dzień otwarty i zamknięty w tej samej minucie', () => {
    // Zero minut otwarcia nie jest dniem otwartym, tylko dniem zamkniętym
    // wpisanym niejasno — a od tego jest brak wiersza.
    expect(weekHoursProblems([{ weekday: 1, opensMinute: 600, closesMinute: 600 }])).toEqual([
      'zle-godziny',
    ])
  })

  it('wytyka otwarcie poza dobą i zamknięcie ponad dobę po niej', () => {
    expect(weekHoursProblems([{ weekday: 1, opensMinute: 1440, closesMinute: 1500 }])).toEqual([
      'zle-godziny',
    ])
    expect(
      weekHoursProblems([{ weekday: 1, opensMinute: 600, closesMinute: MAX_CLOSES_MINUTE + 30 }]),
    ).toEqual(['zle-godziny'])
  })

  it('wytyka godziny niecałkowite', () => {
    expect(weekHoursProblems([{ weekday: 1, opensMinute: 600.5, closesMinute: 1320 }])).toEqual([
      'zle-godziny',
    ])
  })

  it('wytyka dzień wypisany dwa razy', () => {
    // Dzień o dwóch parach godzin nie ma ich wcale: nie ma jak orzec, która
    // z nich mierzy Bloki.
    expect(
      weekHoursProblems([
        { weekday: 1, opensMinute: 600, closesMinute: 720 },
        { weekday: 1, opensMinute: 900, closesMinute: 1320 },
      ]),
    ).toEqual(['powtorzony-dzien'])
  })

  it('wypisuje każde zastrzeżenie raz, choćby dotyczyło kilku dni', () => {
    expect(
      weekHoursProblems([
        { weekday: 1, opensMinute: 1320, closesMinute: 600 },
        { weekday: 2, opensMinute: 1320, closesMinute: 600 },
      ]),
    ).toEqual(['zle-godziny'])
  })
})

describe('porównanie dwóch tygodni godzin', () => {
  it('nie widzi różnicy w kolejności dni', () => {
    expect(sameOpeningHours(TYDZIEN, [...TYDZIEN].reverse())).toBe(true)
  })

  it('widzi dzień dopisany, zdjęty i poprawiony', () => {
    expect(sameOpeningHours(TYDZIEN, [])).toBe(false)
    expect(
      sameOpeningHours(TYDZIEN, [...TYDZIEN, { weekday: 7, opensMinute: 540, closesMinute: 1200 }]),
    ).toBe(false)
    expect(
      sameOpeningHours(TYDZIEN, [{ ...TYDZIEN[0]!, closesMinute: 1200 }, TYDZIEN[1]!]),
    ).toBe(false)
  })
})

describe('zastrzeżenia do wyjątku kalendarzowego', () => {
  it('przepuszcza dzień zamknięty w całości', () => {
    expect(exceptionProblems(zadanie())).toEqual([])
  })

  it('przepuszcza dzień o własnych godzinach', () => {
    expect(
      exceptionProblems(
        zadanie({ exception: { reason: 'Wigilia', hours: { opensMinute: 600, closesMinute: 720 } } }),
      ),
    ).toEqual([])
  })

  it('przepuszcza zdjęcie wyjątku', () => {
    // Wyjątek zdjęty to samo pole daty — godzin nie ma czego sprawdzać.
    expect(exceptionProblems(zadanie({ exception: null }))).toEqual([])
  })

  it('wytyka datę, której nie ma w kalendarzu', () => {
    expect(exceptionProblems(zadanie({ day: '' }))).toEqual(['zla-data'])
    expect(exceptionProblems(zadanie({ day: '24 grudnia' }))).toEqual(['zla-data'])
    expect(exceptionProblems(zadanie({ day: '2026-13-01' }))).toEqual(['zla-data'])
  })

  it('wytyka godziny wyjątku tą samą regułą, co tygodniowe', () => {
    expect(
      exceptionProblems(
        zadanie({ exception: { reason: 'Wigilia', hours: { opensMinute: 720, closesMinute: 600 } } }),
      ),
    ).toEqual(['zle-godziny'])
  })
})

describe('kolizje Rezerwacji z godzinami', () => {
  // Poniedziałek 10:00–22:00 czasu warszawskiego to 08:00–20:00 UTC.
  const W_GODZINACH = rezerwacja('2026-06-15T08:00:00Z', '2026-06-15T10:00:00Z')

  function pytanie(dane: Partial<Parameters<typeof hoursConflicts>[0]> = {}) {
    return hoursConflicts({
      timeZone: STREFA,
      openingHours: TYDZIEN,
      exceptions: [],
      bookings: [W_GODZINACH],
      ...dane,
    })
  }

  it('nie widzi kolizji, gdy Rezerwacja mieści się w godzinach dnia', () => {
    expect(pytanie()).toEqual([])
  })

  it('wskazuje Rezerwację w dniu zamkniętym wyjątkiem', () => {
    // Rezerwacja zostaje — wyjątek jej nie rusza. Kolizję rozstrzyga człowiek,
    // więc jedyne, co tu się dzieje, to wskazanie jej z nazwy.
    expect(pytanie({ exceptions: [wyjatek()] })).toEqual([W_GODZINACH])
  })

  it('wskazuje Rezerwację wystającą poza skrócone godziny', () => {
    const doPoludnia = wyjatek({ hours: { opensMinute: 600, closesMinute: 660 } })

    expect(pytanie({ exceptions: [doPoludnia] })).toEqual([W_GODZINACH])
  })

  it('wskazuje Rezerwację zaczynającą się przed otwarciem', () => {
    const przedOtwarciem = rezerwacja('2026-06-15T07:00:00Z', '2026-06-15T09:00:00Z')

    expect(pytanie({ bookings: [przedOtwarciem] })).toEqual([przedOtwarciem])
  })

  it('wskazuje Rezerwację w dniu, którego tydzień nie wymienia', () => {
    const wtorek = rezerwacja('2026-06-16T08:00:00Z', '2026-06-16T10:00:00Z')

    expect(pytanie({ bookings: [wtorek] })).toEqual([wtorek])
  })

  it('nie widzi kolizji w Rezerwacji przeciągniętej przez północ', () => {
    // Sobota domyka się o 01:00 w niedzielę (1500 minut), więc Rezerwacja
    // 23:00–01:00 mieści się w niej w całości. Dzień liczy się od jej
    // początku, a nie od chwili zakończenia.
    const przezPolnoc = rezerwacja('2026-06-20T21:00:00Z', '2026-06-20T23:00:00Z')

    expect(pytanie({ bookings: [przezPolnoc] })).toEqual([])
  })

  it('wypisuje wszystkie kolidujące Rezerwacje, a nie pierwszą z brzegu', () => {
    const druga = rezerwacja('2026-06-15T12:00:00Z', '2026-06-15T14:00:00Z', 'rezerwacja-2')

    expect(pytanie({ bookings: [W_GODZINACH, druga], exceptions: [wyjatek()] })).toEqual([
      W_GODZINACH,
      druga,
    ])
  })
})

describe('odczyt żądania godzin z sieci', () => {
  it('czyta tydzień', () => {
    expect(readHoursRequest({ week: [{ weekday: 1, opensMinute: 600, closesMinute: 1320 }] })).toEqual(
      { week: [{ weekday: 1, opensMinute: 600, closesMinute: 1320 }] },
    )
  })

  it('czyta tydzień pusty', () => {
    expect(readHoursRequest({ week: [] })).toEqual({ week: [] })
  })

  it('odmawia treści, która nie jest żądaniem godzin', () => {
    expect(() => readHoursRequest(null)).toThrow(MalformedHoursRequestError)
    expect(() => readHoursRequest({})).toThrow(MalformedHoursRequestError)
    expect(() => readHoursRequest({ week: 'poniedziałek' })).toThrow(MalformedHoursRequestError)
    expect(() => readHoursRequest({ week: [{ weekday: 8, opensMinute: 0, closesMinute: 60 }] })).toThrow(
      MalformedHoursRequestError,
    )
    expect(() => readHoursRequest({ week: [{ weekday: 1, opensMinute: '10:00' }] })).toThrow(
      MalformedHoursRequestError,
    )
  })

  it('przepuszcza godziny spoza zakresu — o nich orzeka zastrzeżenie', () => {
    // Ta sama granica, co przy Osi i rozkładzie: kształt tutaj, treść
    // w `weekHoursProblems`, żeby wróciła nazwanym zdaniem, a nie odmową
    // „zły kształt".
    expect(readHoursRequest({ week: [{ weekday: 1, opensMinute: 1320, closesMinute: 600 }] })).toEqual(
      { week: [{ weekday: 1, opensMinute: 1320, closesMinute: 600 }] },
    )
  })
})

describe('odczyt żądania wyjątku z sieci', () => {
  it('czyta dzień zamknięty', () => {
    expect(
      readExceptionRequest({ day: PONIEDZIALEK, exception: { reason: '  Święto  ', hours: null } }),
    ).toEqual({ day: PONIEDZIALEK, exception: { reason: 'Święto', hours: null } })
  })

  it('czyta dzień o własnych godzinach', () => {
    expect(
      readExceptionRequest({
        day: PONIEDZIALEK,
        exception: { reason: 'Wigilia', hours: { opensMinute: 600, closesMinute: 720 } },
      }),
    ).toEqual({
      day: PONIEDZIALEK,
      exception: { reason: 'Wigilia', hours: { opensMinute: 600, closesMinute: 720 } },
    })
  })

  it('czyta zdjęcie wyjątku', () => {
    expect(readExceptionRequest({ day: PONIEDZIALEK, exception: null })).toEqual({
      day: PONIEDZIALEK,
      exception: null,
    })
  })

  it('odmawia treści, która nie jest żądaniem wyjątku', () => {
    expect(() => readExceptionRequest(null)).toThrow(MalformedHoursRequestError)
    expect(() => readExceptionRequest({ day: PONIEDZIALEK })).toThrow(MalformedHoursRequestError)
    expect(() => readExceptionRequest({ day: 7, exception: null })).toThrow(
      MalformedHoursRequestError,
    )
    expect(() =>
      readExceptionRequest({ day: PONIEDZIALEK, exception: { reason: 'Święto' } }),
    ).toThrow(MalformedHoursRequestError)
    expect(() =>
      readExceptionRequest({
        day: PONIEDZIALEK,
        exception: { reason: 'Święto', hours: { opensMinute: '10:00', closesMinute: 720 } },
      }),
    ).toThrow(MalformedHoursRequestError)
  })

  it('przepuszcza datę, której nie ma w kalendarzu — o niej orzeka zastrzeżenie', () => {
    expect(readExceptionRequest({ day: '24 grudnia', exception: null })).toEqual({
      day: '24 grudnia',
      exception: null,
    })
  })
})
