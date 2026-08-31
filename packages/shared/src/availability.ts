/**
 * Wyznaczanie Bloków wybranej Osi w wybranym dniu. Czysta funkcja: rozkład,
 * godziny otwarcia, wyjątki i „teraz" są parametrami. Ta sama kopia obsługuje
 * Widget, Panel i Edge Function — kalendarz nie może pokazywać czegoś innego,
 * niż przyjmuje serwer.
 *
 * Na tym etapie Rezerwacje jeszcze nie istnieją, więc niedostępność wynika
 * z rozkładu, godzin otwarcia, wyjątków oraz reguł czasowych Strzelnicy —
 * horyzontu i minimalnego wyprzedzenia. Kolejne powody (zajęta Oś, Blokada,
 * wyczerpana Pula instruktorów, brak sztuk broni) dochodzą jako kolejne
 * wartości `Unavailability`.
 */
import type { CalendarDay, Weekday } from './calendar.js'
import { addDays, dayIn, weekdayOf, zonedMinuteToInstant } from './calendar.js'

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

/** Powód, dla którego Bloku nie da się zarezerwować. */
export type Unavailability =
  | 'poza-godzinami-otwarcia'
  | 'poza-horyzontem'
  | 'przeszlosc'
  | 'ponizej-wyprzedzenia'

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

/** Rozszerza wejście horyzontu, więc `bookingHorizon` przyjmuje je wprost. */
export type DayAvailabilityInput = BookingHorizonInput & {
  day: CalendarDay
  laneId: string
  schedules: readonly BlockSchedule[]
  openingHours: readonly OpeningHours[]
  /** Daty objęte wyjątkiem kalendarzowym — Strzelnica jest wtedy zamknięta. */
  closedDates: readonly CalendarDay[]
}

/** Wszystko, czego trzeba, żeby orzec o jednym Bloku wybranego dnia. */
type BlockContext = {
  hours: OpeningHours
  /** Wyznaczony raz dla całego dnia — horyzont nie zależy od Bloku. */
  beyondHorizon: boolean
  minLeadMinutes: number
  now: Date
}

function reasonFor(
  schedule: BlockSchedule,
  startsAt: Date,
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
      const unavailableBecause = reasonFor(schedule, startsAt, context)

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
