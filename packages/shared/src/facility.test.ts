import { describe, expect, it } from 'vitest'
import type { BookedAttendance, FacilityConfigDraft } from './index.ts'
import {
  facilityConfigProblems,
  instructorOverruns,
  MalformedFacilityConfigRequestError,
  MAX_INSTRUCTOR_POOL,
  MAX_RATE_GR,
  MAX_TIME_RULE,
  readFacilityConfigRequest,
} from './index.ts'

/** Wypełniony formularz cennika i reguł — typowa Strzelnica, wszystko w zakresie. */
function zamiar(dane: Partial<FacilityConfigDraft> = {}): FacilityConfigDraft {
  return {
    instructorPool: 2,
    participationRate: 3_000,
    instructorRate: 8_000,
    timeRules: { horizonDays: 30, minLeadMinutes: 120, cancellationWindowHours: 24 },
    ...dane,
  }
}

describe('zastrzeżenia do cennika i reguł Strzelnicy', () => {
  it('przepuszcza wypełniony formularz', () => {
    expect(facilityConfigProblems(zamiar())).toEqual([])
  })

  it('przepuszcza zera wszędzie, bo każde z nich jest odpowiedzią', () => {
    // Stawka zerowa znaczy „w cenie", Pula zerowa — Strzelnicę bez nadzoru
    // (u niej rezerwuje wyłącznie ktoś z Pozwoleniem), horyzont zerowy —
    // przyjmowanie wyłącznie na dzisiaj, a okno anulowania zerowe — klienta,
    // który anuluje sam do samego terminu. Żadne z tego nie jest pomyłką.
    expect(
      facilityConfigProblems(
        zamiar({
          instructorPool: 0,
          participationRate: 0,
          instructorRate: 0,
          timeRules: { horizonDays: 0, minLeadMinutes: 0, cancellationWindowHours: 0 },
        }),
      ),
    ).toEqual([])
  })

  it('wytyka ujemną stawkę za uczestnictwo', () => {
    expect(facilityConfigProblems(zamiar({ participationRate: -1 }))).toEqual([
      'zla-stawka-uczestnictwa',
    ])
  })

  it('wytyka ujemną stawkę za Instruktora', () => {
    expect(facilityConfigProblems(zamiar({ instructorRate: -100 }))).toEqual([
      'zla-stawka-instruktora',
    ])
  })

  it('wytyka stawkę, która nie jest liczbą groszy', () => {
    // Cena wpisana w złotych przechodzi przez `parseAmount`, więc ułamek grosza
    // dociera tutaj jako nie-liczba — i ma wrócić zastrzeżeniem, a nie
    // zaokrągleniem, którego nikt nie zobaczy.
    expect(facilityConfigProblems(zamiar({ participationRate: Number.NaN }))).toEqual([
      'zla-stawka-uczestnictwa',
    ])
    expect(facilityConfigProblems(zamiar({ instructorRate: MAX_RATE_GR + 1 }))).toEqual([
      'zla-stawka-instruktora',
    ])
  })

  it('wytyka Pulę instruktorów, która nie jest liczbą ludzi', () => {
    expect(facilityConfigProblems(zamiar({ instructorPool: -1 }))).toEqual([
      'zla-pula-instruktorow',
    ])
    expect(facilityConfigProblems(zamiar({ instructorPool: 1.5 }))).toEqual([
      'zla-pula-instruktorow',
    ])
    expect(
      facilityConfigProblems(zamiar({ instructorPool: MAX_INSTRUCTOR_POOL + 1 })),
    ).toEqual(['zla-pula-instruktorow'])
  })

  it('wytyka każdą regułę czasową osobno', () => {
    // Osobno, bo mierzą co innego: horyzont dni, wyprzedzenie minuty, okno
    // godziny — a zdanie „zła reguła czasowa" kazałoby zgadywać, które pole
    // poprawić.
    expect(
      facilityConfigProblems(
        zamiar({ timeRules: { horizonDays: -1, minLeadMinutes: 120, cancellationWindowHours: 24 } }),
      ),
    ).toEqual(['zly-horyzont'])
    expect(
      facilityConfigProblems(
        zamiar({ timeRules: { horizonDays: 30, minLeadMinutes: -1, cancellationWindowHours: 24 } }),
      ),
    ).toEqual(['zle-wyprzedzenie'])
    expect(
      facilityConfigProblems(
        zamiar({
          timeRules: { horizonDays: 30, minLeadMinutes: 120, cancellationWindowHours: -1 },
        }),
      ),
    ).toEqual(['zle-okno-anulowania'])
    expect(
      facilityConfigProblems(
        zamiar({
          timeRules: {
            horizonDays: MAX_TIME_RULE + 1,
            minLeadMinutes: 120,
            cancellationWindowHours: 24,
          },
        }),
      ),
    ).toEqual(['zly-horyzont'])
  })

  it('wypisuje wszystkie zastrzeżenia naraz, w kolejności czytania formularza', () => {
    // Obsługa ma zobaczyć całą listę poprawek za jednym razem, a nie odkrywać
    // je pojedynczo przy każdym kliknięciu. Ta sama decyzja, co przy Osi.
    expect(
      facilityConfigProblems(
        zamiar({
          instructorPool: -1,
          participationRate: -1,
          instructorRate: -1,
          timeRules: { horizonDays: -1, minLeadMinutes: -1, cancellationWindowHours: -1 },
        }),
      ),
    ).toEqual([
      'zla-stawka-uczestnictwa',
      'zla-stawka-instruktora',
      'zla-pula-instruktorow',
      'zly-horyzont',
      'zle-wyprzedzenie',
      'zle-okno-anulowania',
    ])
  })
})

describe('odczyt żądania konfiguracji Strzelnicy', () => {
  const ZADANIE = {
    instructorPool: 2,
    participationRateGr: 3_000,
    instructorRateGr: 8_000,
    horizonDays: 30,
    minLeadMinutes: 120,
    cancellationWindowHours: 24,
  }

  it('czyta wypełnione żądanie', () => {
    expect(readFacilityConfigRequest(ZADANIE)).toEqual(zamiar())
  })

  it('odmawia żądaniu, które nie jest obiektem', () => {
    expect(() => readFacilityConfigRequest(null)).toThrow(MalformedFacilityConfigRequestError)
    expect(() => readFacilityConfigRequest([ZADANIE])).toThrow(MalformedFacilityConfigRequestError)
  })

  it('odmawia żądaniu z polem, które nie jest liczbą całkowitą', () => {
    for (const pole of Object.keys(ZADANIE)) {
      expect(() => readFacilityConfigRequest({ ...ZADANIE, [pole]: '30' })).toThrow(
        MalformedFacilityConfigRequestError,
      )
      expect(() => readFacilityConfigRequest({ ...ZADANIE, [pole]: undefined })).toThrow(
        MalformedFacilityConfigRequestError,
      )
    }
  })

  it('przepuszcza liczby spoza zakresu, bo te wracają nazwanym zastrzeżeniem', () => {
    // Kształt i osąd to dwie różne odpowiedzi: „zły kształt" nie mówi obsłudze,
    // co wpisać, a `facilityConfigProblems` mówi.
    expect(readFacilityConfigRequest({ ...ZADANIE, instructorPool: -3 }).instructorPool).toBe(-3)
  })
})

/** Rezerwacja z Instruktorem, opisana godzinami, w których trzyma jego czas. */
function nadzor(bookingId: string, odGodziny: number, doGodziny: number): BookedAttendance {
  return {
    bookingId,
    startsAt: new Date(`2026-09-21T${String(odGodziny).padStart(2, '0')}:00:00Z`),
    endsAt: new Date(`2026-09-21T${String(doGodziny).padStart(2, '0')}:00:00Z`),
  }
}

describe('przekroczenia Puli instruktorów', () => {
  it('milczy, gdy Pula starcza na wszystkie Rezerwacje', () => {
    expect(
      instructorOverruns({ pool: 2, attendances: [nadzor('a', 10, 12), nadzor('b', 10, 12)] }),
    ).toEqual([])
  })

  it('wypisuje Rezerwacje, którym Pula po zmniejszeniu już nie starcza', () => {
    // Zmniejszenie Puli Rezerwacji nie rusza — niesie własną obecność
    // Instruktora — więc odpowiedzią jest lista do rozstrzygnięcia, a nie
    // odmowa zapisu. Ta sama decyzja, co przy puli sztuk broni.
    expect(
      instructorOverruns({ pool: 1, attendances: [nadzor('a', 10, 12), nadzor('b', 10, 12)] }),
    ).toEqual([
      { bookingId: 'a', attended: 2 },
      { bookingId: 'b', attended: 2 },
    ])
  })

  it('liczy Instruktorów wyłącznie z Rezerwacji nachodzących na siebie w czasie', () => {
    // Dwie Rezerwacje po sobie dzielą tego samego Instruktora: pierwsza kończy
    // strzelanie, zanim druga je zacznie.
    expect(
      instructorOverruns({ pool: 1, attendances: [nadzor('a', 10, 12), nadzor('b', 12, 14)] }),
    ).toEqual([])
  })

  it('wypisuje każdą Rezerwację z Instruktorem, gdy Pula spada do zera', () => {
    // Pula zerowa jest konfiguracją dopuszczalną — Strzelnicą, która nadzoru
    // nie zapewnia — ale nikomu nie odbiera Instruktora obiecanego wcześniej.
    // Obsługa ma to zobaczyć z nazwiskiem, zanim naciśnie przycisk.
    expect(instructorOverruns({ pool: 0, attendances: [nadzor('a', 10, 12)] })).toEqual([
      { bookingId: 'a', attended: 1 },
    ])
  })
})
