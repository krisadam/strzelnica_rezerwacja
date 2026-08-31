/**
 * Wyznaczanie Bloków wybranej Osi w wybranym dniu. Czysta funkcja: rozkład,
 * godziny otwarcia, wyjątki i „teraz" są parametrami. Ta sama kopia obsługuje
 * Widget, Panel i Edge Function — kalendarz nie może pokazywać czegoś innego,
 * niż przyjmuje serwer.
 *
 * Na tym etapie Rezerwacje jeszcze nie istnieją, więc niedostępność wynika
 * wyłącznie z rozkładu, godzin otwarcia, wyjątków i upływu czasu. Kolejne
 * powody (zajęta Oś, Blokada, wyczerpana Pula instruktorów, brak sztuk broni)
 * dochodzą jako kolejne wartości `Unavailability`.
 */
import type { CalendarDay, Weekday } from './calendar.js'
import { weekdayOf, zonedMinuteToInstant } from './calendar.js'

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

/** Powód, dla którego Bloku nie da się zarezerwować. */
export type Unavailability = 'poza-godzinami-otwarcia' | 'przeszlosc'

export type Block = {
  scheduleId: string
  laneId: string
  startMinute: number
  startsAt: Date
  endsAt: Date
  available: boolean
  unavailableBecause?: Unavailability
}

export type DayAvailabilityInput = {
  day: CalendarDay
  /** Strefa Strzelnicy; pole jej konfiguracji, nie stała w kodzie. */
  timeZone: string
  laneId: string
  schedules: readonly BlockSchedule[]
  openingHours: readonly OpeningHours[]
  /** Daty objęte wyjątkiem kalendarzowym — Strzelnica jest wtedy zamknięta. */
  closedDates: readonly CalendarDay[]
  now: Date
}

function reasonFor(
  schedule: BlockSchedule,
  hours: OpeningHours,
  startsAt: Date,
  now: Date,
): Unavailability | undefined {
  const endMinute = schedule.startMinute + schedule.durationMinutes
  if (schedule.startMinute < hours.opensMinute || endMinute > hours.closesMinute) {
    return 'poza-godzinami-otwarcia'
  }
  // Blok, który się zaczął, przestaje być do wzięcia — także w trakcie trwania.
  if (startsAt.getTime() <= now.getTime()) return 'przeszlosc'
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
      const unavailableBecause = reasonFor(schedule, hours, startsAt, input.now)

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
