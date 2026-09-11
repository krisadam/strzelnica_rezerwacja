/**
 * Rozkład Bloków Osi — tydzień, z którego bierze się cała oferta terminów.
 * Bloki wypisuje ręcznie Strzelnica i nie generuje ich nic (ADR 0005), więc
 * jedynym miejscem, w którym powstają, jest ekran konfiguracji w Panelu.
 *
 * Jednostką zapisu jest **tydzień jednej Osi**, a nie pojedynczy Blok
 * (ADR 0013): dopisanie Bloku, skasowanie Bloku, skopiowanie dnia na sześć
 * innych i skopiowanie całej Osi na drugą są wtedy jednym i tym samym zapisem,
 * a zastrzeżenia liczą się raz — na tym, co po zapisie zostanie.
 *
 * Czyste funkcje, jak przy Blokadzie i przy zgłoszeniu Rezerwacji: ta sama
 * kopia orzeka w Panelu, zanim pokaże się przycisk, i w Edge Function, zanim
 * cokolwiek trafi do bazy.
 */
import type { Weekday } from './calendar.ts'
import { MINUTES_IN_DAY } from './calendar.ts'
import type { BlockSchedule } from './availability.ts'

/**
 * Slot — jednostka siatki czasu grafiku. Blok trwa jego wielokrotność i na nim
 * się zaczyna; nie istnieje termin rozpoczynający się poza tą siatką.
 */
export const SLOT_MINUTES = 30

/** Ile minut ma tydzień rozkładu — siedem dni w zamkniętym rytmie. */
const MINUTES_IN_WEEK = 7 * MINUTES_IN_DAY

/**
 * Tydzień w porządku ISO-8601, od poniedziałku do niedzieli. Stoi tutaj, bo
 * rozkład jest jedyną rzeczą w tym module oglądaną dzień po dniu — a lista
 * wypisana w ekranie rozjechałaby się z kolejnością, którą zna `weekdayOf`.
 */
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]

/**
 * Blok w rozkładzie Osi, bez identyfikatora i bez Osi. Jedno i drugie jest
 * nadmiarem tam, gdzie rozkład zapisuje się w całości: Oś stoi przy żądaniu
 * raz, a identyfikator wiersza nie przeżywa zapisu i nie ma czego opisywać —
 * Blok jest tym, co mówią jego trzy liczby.
 */
export type ScheduleBlock = {
  weekday: Weekday
  /** Początek w minutach od północy dnia Strzelnicy, na siatce Slotów. */
  startMinute: number
  /** Długość Bloku; wielokrotność Slotu. */
  durationMinutes: number
}

/** Dlaczego rozkład nie wchodzi. */
export type ScheduleProblem =
  /** Początek poza siatką Slotów albo poza dobą. */
  | 'poza-siatka'
  /** Długość nie jest dodatnią wielokrotnością Slotu albo przekracza dobę. */
  | 'zla-dlugosc'
  /** Dwa Bloki tej samej Osi zachodzą na siebie. */
  | 'nachodzace-bloki'
  /** Oś, której ta Strzelnica nie ma. Odpowiedź bazy, nie formularza. */
  | 'nieznana-os'

/**
 * Blok rozłożony na odcinki tygodniowej osi minut. Dwa odcinki, a nie jeden,
 * gdy Blok przechodzi przez koniec tygodnia: niedzielny 23:00 + 120 minut
 * kończy się w poniedziałek o 01:00, bo rytm rozkładu jest tygodniowy
 * i zamknięty w koło — po niedzieli wraca poniedziałek tej samej Osi.
 */
function segments(block: ScheduleBlock): { from: number; to: number }[] {
  const from = (block.weekday - 1) * MINUTES_IN_DAY + block.startMinute
  const to = from + block.durationMinutes
  if (to <= MINUTES_IN_WEEK) return [{ from, to }]
  return [
    { from, to: MINUTES_IN_WEEK },
    { from: 0, to: to - MINUTES_IN_WEEK },
  ]
}

/**
 * Czy dwa Bloki zachodzą na siebie. Przedział domknięty od początku, otwarty
 * od końca — czwarte wyrażenie tej samej reguły, co `overlaps` przy zajętości
 * Osi: rozkład 10:00–12:00 i 12:00–14:00 jest rozkładem bez przerwy
 * technicznej, a nie rozkładem błędnym.
 */
function collide(a: ScheduleBlock, b: ScheduleBlock): boolean {
  return segments(a).some((jeden) =>
    segments(b).some((drugi) => jeden.from < drugi.to && drugi.from < jeden.to),
  )
}

/**
 * Wszystkie zastrzeżenia do tygodnia jednej Osi naraz, w kolejności czytania —
 * tak samo jak przy Blokadzie: obsługa ma zobaczyć całą listę poprawek za
 * jednym razem, a nie odkrywać je pojedynczo przy każdym kliknięciu. Każde
 * zastrzeżenie stoi tu raz, choćby dotyczyło kilku Bloków: jedno zdanie o Bloku
 * poza siatką powtórzone pięć razy nie mówi nic ponad to pierwsze.
 *
 * Tydzień pusty jest rozkładem poprawnym i jest to odpowiedź, a nie przeoczenie:
 * Oś, której Strzelnica nie wystawia w żadnym dniu, nie ma po prostu terminów
 * do wzięcia.
 */
export function scheduleProblems(week: readonly ScheduleBlock[]): ScheduleProblem[] {
  const problems: ScheduleProblem[] = []

  const pozaSiatka = week.some(
    (block) =>
      !Number.isInteger(block.startMinute) ||
      block.startMinute < 0 ||
      block.startMinute >= MINUTES_IN_DAY ||
      block.startMinute % SLOT_MINUTES !== 0,
  )
  if (pozaSiatka) problems.push('poza-siatka')

  // Blok dłuższy od doby zachodziłby sam na siebie w tygodniowym rytmie —
  // a zarazem nie jest niczym, co Strzelnica sprzedaje.
  const zlaDlugosc = week.some(
    (block) =>
      !Number.isInteger(block.durationMinutes) ||
      block.durationMinutes <= 0 ||
      block.durationMinutes > MINUTES_IN_DAY ||
      block.durationMinutes % SLOT_MINUTES !== 0,
  )
  if (zlaDlugosc) problems.push('zla-dlugosc')

  // Bez Bloków trzymających się siatki nie ma czego ze sobą zestawiać:
  // „nachodzące Bloki" przy długości ujemnej byłoby zdaniem o niczym.
  if (problems.length > 0) return problems

  const nachodzace = week.some((block, i) =>
    week.slice(i + 1).some((inny) => collide(block, inny)),
  )
  if (nachodzace) problems.push('nachodzace-bloki')

  return problems
}

/**
 * Minuta rozkładu w zapisie „HH:MM" zegara Strzelnicy. Minuty ponad dobę
 * zawijają się do początku następnej: koniec Bloku 23:00 + 120 minut jest
 * pierwszą godziną dnia następnego, a nie „25:00". O tym, że to już jutro,
 * mówi ekran obok tej godziny — tutaj jest sama godzina.
 */
export function formatScheduleMinute(minute: number): string {
  const wDobie = ((minute % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY
  const godziny = Math.floor(wDobie / 60)
  const minuty = wDobie % 60
  return `${String(godziny).padStart(2, '0')}:${String(minuty).padStart(2, '0')}`
}

/**
 * Czy dwa tygodnie są tym samym rozkładem. Nieczułe na kolejność, bo kolejność
 * Bloków nie jest treścią rozkładu: ten sam tydzień wpisany od soboty jest tym
 * samym tygodniem.
 *
 * Reguła, a nie wygoda ekranu: to po niej Panel poznaje rozkład zmieniony od
 * ostatniego odczytu i to ona rozstrzyga, czy powiedzieć „niezapisane zmiany".
 */
export function sameWeek(a: readonly ScheduleBlock[], b: readonly ScheduleBlock[]): boolean {
  return odcisk(a) === odcisk(b)
}

/** Tydzień sprowadzony do napisu, w którym kolejność Bloków już nic nie znaczy. */
function odcisk(week: readonly ScheduleBlock[]): string {
  return week
    .map((block) => `${block.weekday}:${block.startMinute}:${block.durationMinutes}`)
    .sort()
    .join('|')
}

/** Porządek tygodnia: dzień po dniu, a w dniu — godzina po godzinie. */
function inWeekOrder(a: ScheduleBlock, b: ScheduleBlock): number {
  return a.weekday - b.weekday || a.startMinute - b.startMinute
}

/**
 * Tydzień wskazanej Osi, wyjęty z rozkładu całej Strzelnicy. Identyfikator
 * wiersza zostaje przy tym z tyłu i jest to cała różnica między `BlockSchedule`
 * a `ScheduleBlock`: przy zapisie w całości nie ma czego nim adresować.
 *
 * Tym samym wyrażeniem kopiuje się rozkład jednej Osi na drugą — tydzień
 * źródłowej jest tygodniem docelowej, bez żadnej przeróbki po drodze.
 */
export function laneWeek(
  schedules: readonly BlockSchedule[],
  laneId: string,
): ScheduleBlock[] {
  return schedules
    .filter((schedule) => schedule.laneId === laneId)
    .map(({ weekday, startMinute, durationMinutes }) => ({
      weekday,
      startMinute,
      durationMinutes,
    }))
    .sort(inWeekOrder)
}

export type CopyDayInput = {
  week: readonly ScheduleBlock[]
  /** Dzień, którego rozkład się przepisuje. */
  from: Weekday
  /** Dni, które mają wyglądać tak samo jak on. */
  to: readonly Weekday[]
}

/**
 * Tydzień po przepisaniu jednego dnia na wskazane inne. **Zastąpienie**, a nie
 * dołożenie: dzień docelowy ma po tym wyglądać tak samo jak źródłowy, a nie
 * jak suma obu — suma nachodziłaby sama na siebie przy pierwszym rozkładzie
 * o tych samych godzinach. Dzień źródłowy pusty czyści więc docelowy, i to też
 * jest przepisaniem: Strzelnica tego dnia nie wystawia nic.
 *
 * Dzień źródłowy wskazany zarazem jako docelowy zostaje nietknięty — kopiowanie
 * czegokolwiek na siebie samo nie jest zmianą.
 */
export function copyDay({ week, from, to }: CopyDayInput): ScheduleBlock[] {
  const cele = to.filter((weekday) => weekday !== from)
  const zrodlo = week.filter((block) => block.weekday === from)

  return [
    ...week.filter((block) => !cele.includes(block.weekday)),
    ...cele.flatMap((weekday) => zrodlo.map((block) => ({ ...block, weekday }))),
  ].sort(inWeekOrder)
}

/**
 * Żądanie zapisu rozkładu: Oś i cały jej tydzień. Tydzień pusty jest żądaniem
 * poprawnym — tak zdejmuje się Oś z oferty terminów, nie wyłączając jej samej.
 *
 * O tym, czy Oś jest tej Strzelnicy, rozstrzyga baza po numerze konta
 * (ADR 0010), tak samo jak przy Blokadzie. Identyfikator podstawiony z palca
 * nie otwiera więc niczego, choć w żądaniu stoi wprost.
 */
export type ScheduleRequest = {
  laneId: string
  week: readonly ScheduleBlock[]
}

export class MalformedScheduleRequestError extends Error {
  constructor(message: string) {
    super(`Żądanie rozkładu ma zły kształt: ${message}`)
    this.name = 'MalformedScheduleRequestError'
  }
}

/** Liczba całkowita z żądania albo wyjątek. */
function integer(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MalformedScheduleRequestError(`pole ${key} nie jest liczbą całkowitą`)
  }
  return value
}

/**
 * Blok odczytany z sieci albo wyjątek. Dzień tygodnia sprawdzamy tutaj, bo jest
 * **kształtem**: dnia ósmego nie ma czym wyrazić, więc nie ma o co pytać
 * `scheduleProblems`. Minuty przechodzą stąd dalej byle całkowite — początek
 * poza siatką jest liczbą minut, tyle że złą, i orzeka o nim zastrzeżenie, to
 * samo, które pokazuje Panel.
 */
function readBlock(value: unknown): ScheduleBlock {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedScheduleRequestError('pozycja tygodnia nie jest obiektem')
  }
  const source = value as Record<string, unknown>

  const weekday = integer(source, 'weekday')
  if (weekday < 1 || weekday > 7) {
    throw new MalformedScheduleRequestError('pole weekday nie jest dniem tygodnia')
  }

  return {
    weekday: weekday as Weekday,
    startMinute: integer(source, 'startMinute'),
    durationMinutes: integer(source, 'durationMinutes'),
  }
}

/**
 * Żądanie odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie kształt —
 * czy da się z tego zbudować `ScheduleRequest`. O tym, czy wolno je przyjąć,
 * orzeka `scheduleProblems`, tak samo jak `closureProblems` przy Blokadzie.
 */
export function readScheduleRequest(value: unknown): ScheduleRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedScheduleRequestError('treść żądania nie jest obiektem')
  }

  const source = value as Record<string, unknown>

  const laneId = source.laneId
  if (typeof laneId !== 'string' || laneId.trim() === '') {
    throw new MalformedScheduleRequestError('pole laneId nie jest wypełnionym napisem')
  }

  const week = source.week
  if (!Array.isArray(week)) {
    throw new MalformedScheduleRequestError('pole week nie jest listą Bloków')
  }

  return { laneId: laneId.trim(), week: week.map(readBlock) }
}

/**
 * Wynik próby zapisu rozkładu. Bez numeru, inaczej niż przy Blokadzie: rozkład
 * nie jest jednym wierszem, który dałoby się nim wskazać, a Panel i tak czyta
 * po zapisie dane od nowa.
 */
export type ScheduleOutcome = { ok: true } | { ok: false; problem: ScheduleProblem }
