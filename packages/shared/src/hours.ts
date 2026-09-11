/**
 * Godziny otwarcia Strzelnicy i Wyjątki kalendarzowe — kiedy Strzelnica
 * w ogóle jest czynna, zanim ktokolwiek zapyta o konkretny Blok.
 *
 * Dwie rzeczy w jednym pliku, bo są jedną sprawą oglądaną z dwóch stron:
 * tydzień mówi o **rytmie**, wyjątek o **dacie**, a dzień ma z nich obu jedną
 * odpowiedź — i tę jedną odpowiedź daje `hoursForDay`. Rozdzielone dałyby się
 * zapytać osobno, a wtedy kalendarz Widgetu i formularz Panelu rozstrzygałyby
 * o Wigilii każdy po swojemu.
 *
 * Wyjątek **zastępuje** tydzień w całości, a nie poprawia go: dzień objęty
 * wyjątkiem jest albo zamknięty, albo otwarty dokładnie w godzinach wyjątku —
 * także wtedy, gdy tydzień tego dnia w ogóle nie wymienia. Dzień bez godzin,
 * z tygodnia czy z wyjątku, nie ma ani jednego Bloku do wzięcia.
 *
 * Rezerwacji żadna z tych zmian nie rusza i nie ma czym: Rezerwacja niesie
 * własny termin i o godziny nie pyta nikogo po tym, jak powstała. Kolizję —
 * Rezerwację stojącą poza godzinami, które Strzelnica właśnie ustawiła —
 * `hoursConflicts` **wskazuje**, a rozstrzyga ją człowiek: odwołaniem z powodem
 * albo pozostawieniem, bo klient i tak przyjedzie.
 *
 * Czyste funkcje, jak przy Blokadzie i przy rozkładzie: ta sama kopia orzeka
 * w Panelu, zanim pokaże się przycisk, i w Edge Function, zanim cokolwiek
 * trafi do bazy.
 */
import type { CalendarDay, Weekday } from './calendar.ts'
import {
  dayIn,
  isCalendarDay,
  MINUTES_IN_DAY,
  weekdayOf,
  zonedMinuteToInstant,
} from './calendar.ts'

/**
 * Najpóźniejsze zamknięcie: doba po północy dnia, o którym mowa. Dzień
 * kończący się później niż nazajutrz o tej samej porze nie jest dniem, tylko
 * dwoma — a Blok i tak nie trwa dłużej niż dobę.
 */
export const MAX_CLOSES_MINUTE = 2 * MINUTES_IN_DAY

/**
 * Godziny jednego dnia, w minutach od północy dnia Strzelnicy. Zamknięcie po
 * północy zapisuje się wartością powyżej doby — inaczej soboty kończącej się
 * o 01:00 nie dałoby się wyrazić wcale, a to w niej stoi najdłuższy Blok seeda.
 */
export type DayHours = {
  opensMinute: number
  closesMinute: number
}

/** Godziny otwarcia Strzelnicy w jednym dniu tygodnia. */
export type OpeningHours = DayHours & {
  weekday: Weekday
}

/**
 * Wyjątek kalendarzowy: jedna data, która nie idzie rytmem tygodnia. Godziny
 * puste znaczą dzień zamknięty w całości — ta sama konwencja, co przy tygodniu,
 * w którym dnia zamkniętego po prostu nie ma.
 *
 * Powód jest opisem dla obsługi, a nie regułą: „Boże Narodzenie" przy zamkniętej
 * dacie oszczędza następnej zmianie telefonu z pytaniem, czy to pomyłka.
 * Do Osoby rezerwującej nie wychodzi — ona widzi dzień bez terminów.
 */
export type CalendarException = {
  day: CalendarDay
  reason: string
  /** Godziny na ten jeden dzień; puste znaczy dzień zamknięty w całości. */
  hours: DayHours | null
}

/** Dlaczego godziny albo wyjątek nie wchodzą. */
export type HoursProblem =
  /** Zamknięcie przed otwarciem, godzina poza dobą albo liczba niecałkowita. */
  | 'zle-godziny'
  /** Ten sam dzień tygodnia wypisany dwa razy. */
  | 'powtorzony-dzien'
  /** Data, której nie ma w kalendarzu. */
  | 'zla-data'
  /** Konto bez Strzelnicy. Odpowiedź bazy, nie formularza. */
  | 'nieznana-strzelnica'

/** Czy para godzin opisuje dzień, który da się otworzyć. */
function poprawneGodziny(hours: DayHours): boolean {
  return (
    Number.isInteger(hours.opensMinute) &&
    Number.isInteger(hours.closesMinute) &&
    hours.opensMinute >= 0 &&
    hours.opensMinute < MINUTES_IN_DAY &&
    hours.closesMinute > hours.opensMinute &&
    hours.closesMinute <= MAX_CLOSES_MINUTE
  )
}

/**
 * Wszystkie zastrzeżenia do tygodnia naraz, w kolejności czytania — tak samo
 * jak przy rozkładzie Bloków: obsługa ma zobaczyć całą listę poprawek za jednym
 * razem, a nie odkrywać je pojedynczo przy każdym kliknięciu. Każde stoi tu
 * raz, choćby dotyczyło kilku dni.
 *
 * Tydzień pusty jest poprawny i jest to odpowiedź, a nie przeoczenie:
 * Strzelnica zamknięta przez siedem dni nie ma po prostu żadnego terminu — tak
 * samo jak Oś bez ani jednego Bloku.
 */
export function weekHoursProblems(week: readonly OpeningHours[]): HoursProblem[] {
  const problems: HoursProblem[] = []

  if (week.some((hours) => !poprawneGodziny(hours))) problems.push('zle-godziny')

  // Dzień o dwóch parach godzin nie ma ich wcale: nie ma jak orzec, która z nich
  // mierzy Bloki — a `hoursForDay` wzięłaby pierwszą z brzegu i milczała o tym.
  const dni = week.map((hours) => hours.weekday)
  if (new Set(dni).size !== dni.length) problems.push('powtorzony-dzien')

  return problems
}

/**
 * Czy dwa tygodnie są tymi samymi godzinami. Nieczułe na kolejność, bo
 * kolejność dni nie jest treścią tygodnia: ten sam tydzień wpisany od soboty
 * jest tym samym tygodniem.
 *
 * Reguła, a nie wygoda ekranu — tak samo jak `sameWeek` przy rozkładzie: to po
 * niej Panel poznaje godziny zmienione od ostatniego odczytu i to ona
 * rozstrzyga, czy powiedzieć „niezapisane zmiany".
 */
export function sameOpeningHours(
  a: readonly OpeningHours[],
  b: readonly OpeningHours[],
): boolean {
  return odcisk(a) === odcisk(b)
}

/** Tydzień sprowadzony do napisu, w którym kolejność dni już nic nie znaczy. */
function odcisk(week: readonly OpeningHours[]): string {
  return week
    .map((hours) => `${hours.weekday}:${hours.opensMinute}:${hours.closesMinute}`)
    .sort()
    .join('|')
}

/**
 * Żądanie wyjątku: data i to, co ma się na niej znaleźć. Wyjątek pusty znaczy
 * wyjątek **zdjęty** — data wraca do rytmu tygodnia. Jedno żądanie na dopisanie,
 * poprawkę i zdjęcie, bo różnią się wyłącznie tym, co na dacie zostaje; trzy
 * osobne byłyby tą samą datą przepisaną trzy razy.
 *
 * Strzelnicy tu nie ma i nie ma jej czym podstawić: baza pyta o nią po numerze
 * konta (ADR 0010), tak samo jak przy Osi i przy rozkładzie.
 */
export type ExceptionRequest = {
  day: CalendarDay
  exception: { reason: string; hours: DayHours | null } | null
}

/**
 * Wszystkie zastrzeżenia do wyjątku naraz. Godziny sprawdza ta sama reguła, co
 * w tygodniu — druga jej kopia przepuszczałaby na Wigilię to, czego na środę
 * nie wolno.
 *
 * Wyjątek zdejmowany ma do sprawdzenia samą datę: nie ma tam godzin, o których
 * dałoby się cokolwiek orzec.
 */
export function exceptionProblems({ day, exception }: ExceptionRequest): HoursProblem[] {
  const problems: HoursProblem[] = []

  if (!isCalendarDay(day)) problems.push('zla-data')
  if (exception?.hours && !poprawneGodziny(exception.hours)) problems.push('zle-godziny')

  return problems
}

/** Wejście `hoursForDay`; rozszerza je `DayAvailabilityInput`, więc idzie wprost. */
export type DayHoursInput = {
  day: CalendarDay
  /** Tydzień Strzelnicy; dzień, którego nie wymienia, jest zamknięty. */
  openingHours: readonly OpeningHours[]
  /** Wyjątki kalendarzowe — każdy zastępuje tydzień na swojej dacie. */
  exceptions: readonly CalendarException[]
}

/**
 * Godziny otwarcia wskazanego dnia albo `null`, gdy Strzelnica jest wtedy
 * zamknięta. Jedna odpowiedź z dwóch źródeł i jedyne miejsce, w którym wyjątek
 * spotyka się z tygodniem: dostępność Bloku, kalendarz Panelu i sprawdzenie
 * kolizji pytają tą samą funkcją, więc nie mają jak orzec inaczej.
 *
 * Wyjątek wygrywa z tygodniem zawsze — także wtedy, gdy dzień otwiera, a tydzień
 * go nie wymienia. Data jest konkretniejsza od rytmu i po to właśnie jest.
 */
export function hoursForDay({ day, openingHours, exceptions }: DayHoursInput): DayHours | null {
  const wyjatek = exceptions.find((exception) => exception.day === day)
  if (wyjatek) return wyjatek.hours

  const dzien = openingHours.find((hours) => hours.weekday === weekdayOf(day))
  // Same godziny, bez dnia tygodnia: odpowiedź o **dacie** ma wyglądać tak
  // samo, skądkolwiek przyszła — a wyjątek dnia tygodnia nie niesie wcale.
  if (!dzien) return null
  return { opensMinute: dzien.opensMinute, closesMinute: dzien.closesMinute }
}

/**
 * Rezerwacja sprowadzona do samego terminu — tyle, ile trzeba, żeby orzec
 * o kolizji z godzinami. Bez Osoby rezerwującej, Osi i Kwoty: Panel ma po nich
 * własny kształt (`PanelBooking`), a ta reguła nie pyta o żadną z tych rzeczy.
 */
export type BookedTerm = {
  id: string
  startsAt: Date
  endsAt: Date
}

export type HoursConflictInput = {
  /** Strefa Strzelnicy: godziny są jej zegarem, a Rezerwacje chwilami w UTC. */
  timeZone: string
  /** Tydzień **po** zmianie — pytamy o to, co zostanie, a nie o to, co było. */
  openingHours: readonly OpeningHours[]
  /** Wyjątki po zmianie, z tego samego powodu. */
  exceptions: readonly CalendarException[]
  /** Rezerwacje trzymające termin; wygasła i odwołana nie kolidują z niczym. */
  bookings: readonly BookedTerm[]
}

/**
 * Rezerwacje, które po tej zmianie stoją poza godzinami otwarcia — w dniu
 * zamkniętym albo wystające poza skrócony dzień. Wszystkie, a nie pierwsza
 * z brzegu: obsługa ma je rozstrzygnąć co do jednej, a lista urwana po
 * pierwszej zostawiłaby klienta pod zamkniętą bramą.
 *
 * Zmiany **nie blokują**: godziny wchodzą i tak, a Rezerwacja zostaje na Osi
 * (AC ticketu #20). Wyjątek mówi, czego Strzelnica nie sprzedaje, a nie komu
 * odbiera termin — tak samo jak zdjęcie Bloku z rozkładu. Rezerwacja znika
 * wyłącznie Odwołaniem, z powodem wysłanym klientowi, a tej decyzji nie
 * podejmuje formularz godzin.
 *
 * Dzień Rezerwacji liczy się od jej **początku**: Rezerwacja 23:00–01:00 należy
 * do soboty, która domyka się o 01:00, a nie do niedzieli, która wtedy jeszcze
 * nie jest otwarta.
 */
export function hoursConflicts(input: HoursConflictInput): BookedTerm[] {
  return input.bookings.filter((booking) => {
    const day = dayIn(input.timeZone, booking.startsAt)
    const hours = hoursForDay({ ...input, day })
    if (!hours) return true

    const otwarcie = zonedMinuteToInstant(day, hours.opensMinute, input.timeZone)
    const zamkniecie = zonedMinuteToInstant(day, hours.closesMinute, input.timeZone)
    return booking.startsAt < otwarcie || booking.endsAt > zamkniecie
  })
}

/**
 * Żądanie zapisu godzin: cały tydzień naraz, tak samo jak przy rozkładzie
 * Bloków (ADR 0013). Dzień dopisany, dzień zamknięty i dzień poprawiony są
 * wtedy jednym i tym samym zapisem, a zastrzeżenia liczą się raz — na tym, co
 * po zapisie zostanie.
 */
export type HoursRequest = {
  week: readonly OpeningHours[]
}

export class MalformedHoursRequestError extends Error {
  constructor(message: string) {
    super(`Żądanie godzin ma zły kształt: ${message}`)
    this.name = 'MalformedHoursRequestError'
  }
}

/** Liczba całkowita z żądania albo wyjątek. */
function integer(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MalformedHoursRequestError(`pole ${key} nie jest liczbą całkowitą`)
  }
  return value
}

/** Obiekt z żądania albo wyjątek — `null` i lista obiektem nie są. */
function object(value: unknown, opis: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedHoursRequestError(`${opis} nie jest obiektem`)
  }
  return value as Record<string, unknown>
}

/**
 * Godziny odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie **kształt** —
 * liczby spoza zakresu przechodzą tędy bez słowa, bo mają wrócić nazwanym
 * zastrzeżeniem z `weekHoursProblems`, a nie odmową „zły kształt".
 */
function readHours(value: unknown): DayHours {
  const source = object(value, 'godziny')
  return {
    opensMinute: integer(source, 'opensMinute'),
    closesMinute: integer(source, 'closesMinute'),
  }
}

/**
 * Dzień tygodnia sprawdzamy przy odczycie, bo jest **kształtem**: dnia ósmego
 * nie ma czym wyrazić, więc nie ma o co pytać `weekHoursProblems`. Ta sama
 * granica, co przy Bloku rozkładu.
 */
function readOpeningHours(value: unknown): OpeningHours {
  const source = object(value, 'pozycja tygodnia')

  const weekday = integer(source, 'weekday')
  if (weekday < 1 || weekday > 7) {
    throw new MalformedHoursRequestError('pole weekday nie jest dniem tygodnia')
  }

  return { weekday: weekday as Weekday, ...readHours(source) }
}

export function readHoursRequest(value: unknown): HoursRequest {
  const source = object(value, 'treść żądania')

  const week = source.week
  if (!Array.isArray(week)) {
    throw new MalformedHoursRequestError('pole week nie jest listą dni')
  }

  return { week: week.map(readOpeningHours) }
}

/**
 * Żądanie wyjątku odczytane z sieci albo wyjątek. Pole `exception` musi być
 * **wpisane** — żądanie, które o nim milczy, byłoby nie do odróżnienia od
 * zdjęcia wyjątku, więc literówka w jego nazwie kasowałaby dzień zamknięty
 * zamiast go zapisać. Ta sama ostrożność, co przy polu `id` w żądaniu Osi.
 *
 * O tym, czy data istnieje w kalendarzu, orzeka `exceptionProblems`: data jest
 * napisem i tyle wie o niej kształt.
 */
export function readExceptionRequest(value: unknown): ExceptionRequest {
  const source = object(value, 'treść żądania')

  const day = source.day
  if (typeof day !== 'string') {
    throw new MalformedHoursRequestError('pole day nie jest napisem')
  }

  if (!('exception' in source)) {
    throw new MalformedHoursRequestError(
      'brak pola exception — zdjęcie wyjątku ma je puste, nie pominięte',
    )
  }
  if (source.exception === null) return { day: day.trim(), exception: null }

  const exception = object(source.exception, 'pole exception')

  const reason = exception.reason
  if (typeof reason !== 'string') {
    throw new MalformedHoursRequestError('pole reason nie jest napisem')
  }

  if (!('hours' in exception)) {
    throw new MalformedHoursRequestError(
      'brak pola hours — dzień zamknięty ma je puste, nie pominięte',
    )
  }

  return {
    day: day.trim(),
    exception: {
      reason: reason.trim(),
      hours: exception.hours === null ? null : readHours(exception.hours),
    },
  }
}

/**
 * Wynik próby zapisu godzin albo wyjątku. Bez numeru, tak samo jak przy
 * rozkładzie: ani tydzień, ani wyjątek nie jest wierszem, który dałoby się nim
 * wskazać, a Panel i tak czyta po zapisie dane od nowa.
 */
export type HoursOutcome = { ok: true } | { ok: false; problem: HoursProblem }
