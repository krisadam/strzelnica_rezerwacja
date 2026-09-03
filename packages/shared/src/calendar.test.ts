import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayIn,
  formatDayLabel,
  formatMoment,
  formatTimeRange,
  InvalidCalendarDayError,
  weekdayOf,
  zonedMinuteToInstant,
} from './index.ts'

const WARSZAWA = 'Europe/Warsaw'

describe('dzień tygodnia', () => {
  it('liczy w konwencji ISO — poniedziałek to 1, niedziela to 7', () => {
    expect(weekdayOf('2026-06-15')).toBe(1)
    expect(weekdayOf('2026-06-21')).toBe(7)
  })

  it('odrzuca zapis, który nie jest dniem kalendarzowym', () => {
    expect(() => weekdayOf('15.06.2026')).toThrow(InvalidCalendarDayError)
  })
})

describe('przechodzenie między dniami', () => {
  it('przekracza granicę miesiąca i roku', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('nie gubi dnia przy zmianie czasu — dzień to data, nie 24 godziny', () => {
    // W nocy 29 marca 2026 Warszawa przechodzi na czas letni.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })
})

describe('minuta dnia Strzelnicy jako moment w UTC', () => {
  it('uwzględnia czas letni i zimowy', () => {
    expect(zonedMinuteToInstant('2026-06-15', 600, WARSZAWA).toISOString()).toBe(
      '2026-06-15T08:00:00.000Z',
    )
    expect(zonedMinuteToInstant('2026-01-12', 600, WARSZAWA).toISOString()).toBe(
      '2026-01-12T09:00:00.000Z',
    )
  })

  it('przyjmuje minutę spoza doby, żeby wyrazić koniec Bloku po północy', () => {
    expect(zonedMinuteToInstant('2026-06-20', 1500, WARSZAWA).toISOString()).toBe(
      '2026-06-20T23:00:00.000Z',
    )
  })

  it('trafia w tę samą minutę po obu stronach zmiany czasu', () => {
    // 29 marca 2026 o 02:00 zegar skacze na 03:00; 10:00 istnieje mimo to.
    expect(zonedMinuteToInstant('2026-03-29', 600, WARSZAWA).toISOString()).toBe(
      '2026-03-29T08:00:00.000Z',
    )
  })
})

describe('dzień trwający w danej chwili', () => {
  it('czyta kalendarz Strzelnicy, nie kalendarz UTC', () => {
    // 23:30 w Warszawie to jeszcze ten sam dzień, choć w UTC jest 21:30.
    expect(dayIn(WARSZAWA, new Date('2026-06-15T21:30:00Z'))).toBe('2026-06-15')
    // 01:30 czasu Warszawy to już następny dzień, a w UTC wciąż poprzedni.
    expect(dayIn(WARSZAWA, new Date('2026-06-15T23:30:00Z'))).toBe('2026-06-16')
  })
})

describe('zapis czasu na ekranie', () => {
  it('pokazuje zakres Bloku w zegarze Strzelnicy, nie w UTC', () => {
    // Blok 23:00–01:00 czasu warszawskiego to 21:00–23:00 UTC.
    expect(
      formatTimeRange(
        new Date('2026-06-20T21:00:00Z'),
        new Date('2026-06-20T23:00:00Z'),
        WARSZAWA,
      ),
    ).toBe('23:00–01:00')
  })

  // Granica Okna anulowania jest chwilą, a nie datą kalendarza, więc dobę
  // wyznacza jej strefa Strzelnicy: 23:30 UTC to już następny dzień w Warszawie.
  it('pokazuje chwilę w zegarze Strzelnicy razem z jej dniem', () => {
    expect(formatMoment(new Date('2026-06-14T08:00:00Z'), WARSZAWA)).toBe('14 czerwca 10:00')
    expect(formatMoment(new Date('2026-06-15T23:30:00Z'), WARSZAWA)).toBe('16 czerwca 01:30')
  })

  it('nazywa dzień po polsku i nie przesuwa go o dobę', () => {
    expect(formatDayLabel('2026-06-15')).toBe('poniedziałek, 15 czerwca')
    expect(formatDayLabel('2026-01-01')).toBe('czwartek, 1 stycznia')
  })
})
