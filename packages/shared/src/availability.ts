/**
 * Wyznaczanie Bloków wybranej Osi w wybranym dniu. Czysta funkcja: rozkład,
 * godziny otwarcia, wyjątki i „teraz" są parametrami. Ta sama kopia obsługuje
 * Widget, Panel i Edge Function — kalendarz nie może pokazywać czegoś innego,
 * niż przyjmuje serwer.
 *
 * Niedostępność wynika z rozkładu, godzin otwarcia, wyjątków, reguł czasowych
 * Strzelnicy — horyzontu i minimalnego wyprzedzenia — z zajętości Osi oraz
 * z Puli instruktorów. Kolejne powody (brak sztuk broni) dochodzą jako kolejne
 * wartości `Unavailability`.
 *
 * Termin jest dostępny dla konkretnego kształtu Rezerwacji, nie bezwzględnie:
 * ten sam Blok bywa wolny dla Osoby rezerwującej z Pozwoleniem na broń
 * i niedostępny dla tej bez niego. Dlatego wejściem są także jej zamierzenia.
 */
import type { CalendarDay, Weekday } from './calendar.ts'
import { addDays, dayIn, weekdayOf, zonedMinuteToInstant } from './calendar.ts'

/** Pozycja rozkładu: jeden Blok Osi w jednym dniu tygodnia. */
export type BlockSchedule = {
  id: string
  laneId: string
  weekday: Weekday
  /** Początek w minutach od północy dnia Strzelnicy, na siatce Slotów. */
  startMinute: number
  /** Długość Bloku; wielokrotność Slotu. */
  durationMinutes: number
}

/** Godziny otwarcia Strzelnicy w jednym dniu tygodnia. */
export type OpeningHours = {
  weekday: Weekday
  opensMinute: number
  /** Domknięcie po północy zapisuje się wartością powyżej 1440. */
  closesMinute: number
}

/**
 * Reguły czasowe Strzelnicy — jak daleko w przód wolno rezerwować, jak blisko
 * terminu jeszcze wolno i do kiedy wolno anulować. Strzelnica ustala je sama
 * (spec, historia 55), więc są jej konfiguracją, nie stałą w kodzie.
 */
export type TimeRules = {
  /** Ile dni w przód sięga rezerwacja, licząc od dzisiejszego dnia Strzelnicy. */
  horizonDays: number
  /** Ile minut przed początkiem Bloku zamyka się rezerwacja. */
  minLeadMinutes: number
  /**
   * Do ilu godzin przed terminem Osoba rezerwująca może anulować sama.
   * Dostępności nie dotyczy — czyta go anulowanie Rezerwacji.
   */
  cancellationWindowHours: number
}

/**
 * Zajęcie Osi na wyłączność w konkretnym czasie. Rezerwacja i Blokada
 * (ticket #16) różnią się wszystkim poza tym jednym — dla dostępności są tym
 * samym, więc dostają jeden kształt i jedną regułę kolizji.
 */
export type Occupancy = {
  laneId: string
  startsAt: Date
  endsAt: Date
  /**
   * Czy zajmuje miejsce w Puli instruktorów. Blokada (ticket #16) nie zajmuje
   * go nigdy — nie ma przy niej nikogo do nadzorowania.
   */
  withInstructor: boolean
}

/**
 * Zamierzenia Osoby rezerwującej, od których zależy dostępność terminu. Dziś
 * mówią o Instruktorze; zamawiane Typy broni (ticket #8) dojdą tutaj, bo pytają
 * o dokładnie to samo — czy Strzelnica ma czym obsłużyć właśnie tę Rezerwację.
 */
export type Intent = {
  /** Deklaracja Pozwolenia na broń; jej brak wymusza obecność Instruktora. */
  hasPermit: boolean
  /** Instruktor zamówiony dobrowolnie mimo Pozwolenia. */
  wantsInstructor: boolean
}

/**
 * Czy przy Rezerwacji o takich zamierzeniach będzie Instruktor. Powód —
 * wymagany czy zamówiony — nie zmienia niczego ani dla Puli, ani dla Kwoty
 * do zapłaty (ticket #7), więc jedna funkcja odpowiada obu.
 */
export function instructorAttends(intent: Intent): boolean {
  return !intent.hasPermit || intent.wantsInstructor
}

/** Powód, dla którego Bloku nie da się zarezerwować. */
export type Unavailability =
  | 'poza-godzinami-otwarcia'
  | 'poza-horyzontem'
  | 'przeszlosc'
  | 'ponizej-wyprzedzenia'
  | 'termin-zajety'
  | 'brak-instruktora'

export type Block = {
  scheduleId: string
  laneId: string
  startMinute: number
  startsAt: Date
  endsAt: Date
  available: boolean
  unavailableBecause?: Unavailability
}

export type BookingHorizonInput = {
  /** Strefa Strzelnicy; pole jej konfiguracji, nie stała w kodzie. */
  timeZone: string
  timeRules: TimeRules
  now: Date
}

/**
 * Ostatni dzień, na który Strzelnica przyjmuje Rezerwacje; sam jeszcze mieści
 * się w horyzoncie. Ta sama granica rozstrzyga o powodzie „poza-horyzontem"
 * w `scheduleForDay`, żeby nawigacja kalendarza i dostępność nie mogły się
 * rozjechać.
 */
export function bookingHorizon(input: BookingHorizonInput): CalendarDay {
  return addDays(dayIn(input.timeZone, input.now), input.timeRules.horizonDays)
}

/**
 * Najwcześniejszy i najpóźniejszy moment, w jaki może sięgnąć Blok wskazanego
 * dnia. Blok zaczyna się w obrębie doby i wolno mu trwać dalej, więc okno
 * kończy się dobę po jej końcu. Zajętość spoza tego okna nie ma z czym
 * kolidować — i tylko dlatego wolno jej nie pobierać.
 *
 * Reguła mieszka tutaj, a nie w zapytaniu Edge Function, bo wynika z tego
 * samego kształtu Bloku, co `scheduleForDay`. Wyliczona osobno w zapytaniu
 * byłaby drugą kopią, która milczkiem gubiłaby kolizje.
 */
export function occupancyWindow(day: CalendarDay, timeZone: string): { from: Date; to: Date } {
  return {
    from: zonedMinuteToInstant(day, 0, timeZone),
    to: zonedMinuteToInstant(day, 2 * 1440, timeZone),
  }
}

/** Rozszerza wejście horyzontu, więc `bookingHorizon` przyjmuje je wprost. */
export type DayAvailabilityInput = BookingHorizonInput & {
  day: CalendarDay
  laneId: string
  schedules: readonly BlockSchedule[]
  openingHours: readonly OpeningHours[]
  /** Daty objęte wyjątkiem kalendarzowym — Strzelnica jest wtedy zamknięta. */
  closedDates: readonly CalendarDay[]
  /**
   * Rezerwacje i Blokady trzymające Osie. Cudze Osie są tu potrzebne, a nie
   * tylko dopuszczalne: Pula instruktorów liczy się po całej Strzelnicy, więc
   * lista zawężona do jednej Osi zaniżałaby ją po cichu.
   */
  occupancies: readonly Occupancy[]
  /** Ilu Instruktorów Strzelnica zapewnia w tym samym czasie. */
  instructorPool: number
  intent: Intent
}

/** Wszystko, czego trzeba, żeby orzec o jednym Bloku wybranego dnia. */
type BlockContext = {
  hours: OpeningHours
  /** Wyznaczony raz dla całego dnia — horyzont nie zależy od Bloku. */
  beyondHorizon: boolean
  minLeadMinutes: number
  now: Date
  /** Zawężone do Osi, o którą pytamy — kolizja i tak sprawdza tylko ją. */
  occupancies: readonly Occupancy[]
  /** Czy pytający potrzebuje Instruktora; jeśli nie, Pula go nie dotyczy. */
  needsInstructor: boolean
  instructorPool: number
  /** Wszystkie Rezerwacje Strzelnicy trzymające Instruktora, z każdej Osi. */
  instructorOccupancies: readonly Occupancy[]
}

/**
 * Przedziały są domknięte od początku i otwarte od końca: Rezerwacja kończąca
 * się o 12:00 nie zajmuje Bloku zaczynającego się o 12:00. Inaczej rozkład ze
 * stykającymi się Blokami sprzedawałby co drugi.
 */
function overlaps(occupancy: Occupancy, startsAt: Date, endsAt: Date): boolean {
  return occupancy.startsAt < endsAt && occupancy.endsAt > startsAt
}

function reasonFor(
  schedule: BlockSchedule,
  startsAt: Date,
  endsAt: Date,
  context: BlockContext,
): Unavailability | undefined {
  const endMinute = schedule.startMinute + schedule.durationMinutes
  // Najpierw powód trwały: Blok poza godzinami otwarcia nie stanie się dostępny
  // z upływem czasu, więc mówi o sobie prawdziwiej niż horyzont czy wyprzedzenie.
  if (schedule.startMinute < context.hours.opensMinute || endMinute > context.hours.closesMinute) {
    return 'poza-godzinami-otwarcia'
  }
  if (context.beyondHorizon) return 'poza-horyzontem'
  // Blok, który się zaczął, przestaje być do wzięcia — także w trakcie trwania.
  const leadMinutes = (startsAt.getTime() - context.now.getTime()) / 60_000
  if (leadMinutes <= 0) return 'przeszlosc'
  if (leadMinutes < context.minLeadMinutes) return 'ponizej-wyprzedzenia'
  // Powód ostatni, bo jedyny mówiący o kimś innym niż sam Blok. Blok, którego
  // Strzelnica i tak nie sprzedaje, ma o tym powiedzieć wprost — a nie zwalać
  // na Osobę rezerwującą, która akurat wpisała go ręcznie w Panelu.
  if (context.occupancies.some((occupancy) => overlaps(occupancy, startsAt, endsAt))) {
    return 'termin-zajety'
  }
  // Powód wychodzący poza sam termin: mówi nie o Bloku, tylko o tym, kto pyta.
  // Stoi po zajętej Osi, bo Osoby rezerwującej nie ma po co zachęcać do zmiany
  // deklaracji, skoro Blok i tak jest czyjś.
  if (context.needsInstructor) {
    const zajete = context.instructorOccupancies.filter((occupancy) =>
      overlaps(occupancy, startsAt, endsAt),
    ).length
    if (zajete >= context.instructorPool) return 'brak-instruktora'
  }
  return undefined
}

/**
 * Grafik Osi w jednym dniu. Dzień zamknięty — wyjątkiem kalendarzowym albo
 * brakiem godzin otwarcia — nie ma żadnych Bloków i mówi o tym wprost, żeby
 * nikt nie musiał tego wnioskować z pustej listy po raz drugi.
 */
export type DaySchedule =
  | { open: false; blocks: readonly [] }
  | { open: true; blocks: Block[] }

const ZAMKNIETE: DaySchedule = { open: false, blocks: [] }

/**
 * Bloki wskazanej Osi w wskazanym dniu, w kolejności rozpoczęcia. Blok nie
 * mieszczący się w godzinach otwarcia jest widoczny, ale niedostępny — inaczej
 * niż cały dzień zamknięty, którego w ogóle nie ma na grafiku.
 */
export function scheduleForDay(input: DayAvailabilityInput): DaySchedule {
  if (input.closedDates.includes(input.day)) return ZAMKNIETE

  const weekday = weekdayOf(input.day)
  const hours = input.openingHours.find((entry) => entry.weekday === weekday)
  if (!hours) return ZAMKNIETE

  const context: BlockContext = {
    hours,
    // Zapis dnia jest sortowalny, więc porównanie tekstów porównuje daty.
    beyondHorizon: input.day > bookingHorizon(input),
    minLeadMinutes: input.timeRules.minLeadMinutes,
    now: input.now,
    occupancies: input.occupancies.filter((occupancy) => occupancy.laneId === input.laneId),
    needsInstructor: instructorAttends(input.intent),
    instructorPool: input.instructorPool,
    instructorOccupancies: input.occupancies.filter((occupancy) => occupancy.withInstructor),
  }

  const blocks = input.schedules
    .filter((schedule) => schedule.laneId === input.laneId && schedule.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((schedule) => {
      const startsAt = zonedMinuteToInstant(input.day, schedule.startMinute, input.timeZone)
      const endsAt = zonedMinuteToInstant(
        input.day,
        schedule.startMinute + schedule.durationMinutes,
        input.timeZone,
      )
      const unavailableBecause = reasonFor(schedule, startsAt, endsAt, context)

      return {
        scheduleId: schedule.id,
        laneId: schedule.laneId,
        startMinute: schedule.startMinute,
        startsAt,
        endsAt,
        available: unavailableBecause === undefined,
        ...(unavailableBecause ? { unavailableBecause } : {}),
      }
    })

  return { open: true, blocks }
}
