/**
 * Kalendarz Strzelnicy: przeliczanie między dniem zapisanym w jej strefie
 * a momentem w UTC. Baza trzyma czas w UTC, a rozkład Bloków — w minutach od
 * północy dnia Strzelnicy; to jest jedyne miejsce, gdzie te dwa światy się
 * spotykają.
 *
 * Wszystko tutaj jest czystą funkcją: strefa i „teraz" są parametrami.
 */

/** Dzień kalendarzowy Strzelnicy w zapisie `RRRR-MM-DD`. */
export type CalendarDay = string

/** Dzień tygodnia w konwencji ISO-8601: 1 = poniedziałek, 7 = niedziela. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export class InvalidCalendarDayError extends Error {
  constructor(day: string) {
    super(`Dzień kalendarzowy ma mieć postać RRRR-MM-DD, a jest: ${day}`)
    this.name = 'InvalidCalendarDayError'
  }
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDay(day: CalendarDay): { year: number; month: number; date: number } {
  const match = DAY_PATTERN.exec(day)
  if (!match) throw new InvalidCalendarDayError(day)
  const [, year, month, date] = match
  return { year: Number(year), month: Number(month), date: Number(date) }
}

function formatDay(utcMs: number): CalendarDay {
  return new Date(utcMs).toISOString().slice(0, 10)
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  formatters.set(timeZone, formatter)
  return formatter
}

/** Ten sam moment odczytany jako ściana zegara w danej strefie, wyrażony w UTC. */
function wallClockMs(instantMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(instantMs))
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value)
  return Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  )
}

function offsetMs(instantMs: number, timeZone: string): number {
  return wallClockMs(instantMs, timeZone) - instantMs
}

/**
 * Moment w UTC odpowiadający wskazanej minucie dnia Strzelnicy. Minuta może
 * przekroczyć 1440 — wtedy wynik wypada po północy, co jest jedynym sposobem
 * na zapisanie Bloku przecinającego granicę doby.
 *
 * Przesunięcie strefy liczone jest dwa razy, bo przy zmianie czasu zależy ono
 * od momentu, który dopiero wyznaczamy.
 */
export function zonedMinuteToInstant(
  day: CalendarDay,
  minute: number,
  timeZone: string,
): Date {
  const { year, month, date } = parseDay(day)
  const asIfUtc = Date.UTC(year, month - 1, date) + minute * 60_000
  const firstGuess = asIfUtc - offsetMs(asIfUtc, timeZone)
  return new Date(asIfUtc - offsetMs(firstGuess, timeZone))
}

/** Dzień tygodnia dnia kalendarzowego. Nie zależy od strefy — data już ją niesie. */
export function weekdayOf(day: CalendarDay): Weekday {
  const { year, month, date } = parseDay(day)
  const jsDay = new Date(Date.UTC(year, month - 1, date)).getUTCDay()
  return (jsDay === 0 ? 7 : jsDay) as Weekday
}

/** Dzień oddalony o `count` dni. Ujemne cofa. */
export function addDays(day: CalendarDay, count: number): CalendarDay {
  const { year, month, date } = parseDay(day)
  return formatDay(Date.UTC(year, month - 1, date + count))
}

/** Dzień, który w strefie Strzelnicy trwa w podanym momencie. */
export function dayIn(timeZone: string, instant: Date): CalendarDay {
  return formatDay(wallClockMs(instant.getTime(), timeZone))
}

const labelFormatters = new Map<string, Intl.DateTimeFormat>()

function labelFormatterFor(
  key: string,
  build: () => Intl.DateTimeFormat,
): Intl.DateTimeFormat {
  const cached = labelFormatters.get(key)
  if (cached) return cached
  const formatter = build()
  labelFormatters.set(key, formatter)
  return formatter
}

/**
 * Zakres czasu w zegarze Strzelnicy, np. „23:00–01:00". Formatowanie mieszka
 * tutaj razem z resztą przeliczeń stref — Widget i Panel mają pokazywać te
 * same godziny, a nie każdy swoje.
 */
export function formatTimeRange(from: Date, to: Date, timeZone: string): string {
  const format = labelFormatterFor(
    `czas:${timeZone}`,
    () => new Intl.DateTimeFormat('pl-PL', { timeZone, hour: '2-digit', minute: '2-digit' }),
  )
  return `${format.format(from)}–${format.format(to)}`
}

/**
 * Dzień w zapisie do nagłówka, np. „poniedziałek, 15 czerwca". Data jest już
 * datą kalendarza Strzelnicy, więc formatuje się ją w UTC — inaczej strefa
 * czytającego przesuwałaby nagłówek o dobę.
 */
export function formatDayLabel(day: CalendarDay): string {
  const format = labelFormatterFor(
    'dzien',
    () =>
      new Intl.DateTimeFormat('pl-PL', {
        timeZone: 'UTC',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
  )
  return format.format(new Date(`${day}T00:00:00Z`))
}

/**
 * Chwila w zegarze Strzelnicy, np. „14 czerwca 10:00". Inaczej niż
 * `formatDayLabel`, dotyczy momentu, a nie daty kalendarza, więc dobę wyznacza
 * strefa Strzelnicy: granica Okna anulowania wypadająca po północy czasu
 * uniwersalnego wciąż należy do dnia, który czyta klient.
 *
 * Bez dnia tygodnia — ta chwila nie jest terminem, na który się przyjeżdża,
 * tylko liczbą, do której trzeba zdążyć.
 */
export function formatMoment(instant: Date, timeZone: string): string {
  const format = labelFormatterFor(
    `chwila:${timeZone}`,
    () =>
      new Intl.DateTimeFormat('pl-PL', {
        timeZone,
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }),
  )
  return format.format(instant)
}
