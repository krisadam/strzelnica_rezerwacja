/**
 * Okno anulowania: ile czasu przed terminem Osoba rezerwująca może anulować
 * Rezerwację sama. Po jego upływie zostaje jej kontakt do Strzelnicy — bo
 * termin, na który obsługa już przygotowała stanowisko, przestaje być sprawą
 * między klientem a formularzem.
 *
 * Okno jest ustawieniem Strzelnicy (spec, historia 55), tak samo jak Horyzont
 * rezerwacji i Minimalne wyprzedzenie, więc przychodzi tu parametrem razem
 * z „teraz". Czysta funkcja liczy chwilę domknięcia i orzeka, czy jeszcze
 * wolno; samą zmianę stanu wykonuje baza — tam jest jeden zegar i jedna
 * kolejka.
 */
import type { Database } from './database.types.ts'

type BookingStatus = Database['public']['Enums']['booking_status']

const GODZINA_MS = 60 * 60_000

/**
 * Chwila, do której Osoba rezerwująca może anulować sama. Okno zerowe sięga
 * samego początku Bloku — Strzelnica, która nie chce anulowań w ostatniej
 * chwili, ustawia je na godziny, a nie na zero.
 */
export function cancellationDeadline(startsAt: Date, cancellationWindowHours: number): Date {
  return new Date(startsAt.getTime() - cancellationWindowHours * GODZINA_MS)
}

/**
 * Czy tę Rezerwację wolno teraz anulować. Chwila domknięcia jedzie razem
 * z odmową „po-oknie", bo to ona tłumaczy odmowę Osobie rezerwującej —
 * a przy odmowie z innego powodu nie mówi nic i jej nie ma.
 */
export type CancellationState =
  | { possible: true; deadline: Date }
  | { possible: false; reason: 'po-oknie'; deadline: Date }
  | { possible: false; reason: 'nie-do-anulowania' }

export type CancellationStateInput = {
  status: BookingStatus
  startsAt: Date
  cancellationWindowHours: number
  now: Date
}

export function cancellationState({
  status,
  startsAt,
  cancellationWindowHours,
  now,
}: CancellationStateInput): CancellationState {
  // Anulować da się wyłącznie Rezerwację potwierdzoną. Oczekująca zniknie sama
  // po Czasie na potwierdzenie, a reszta stanów terminu już nie trzyma — nie ma
  // czego zwalniać, więc nie ma też czego odmawiać zegarem.
  if (status !== 'potwierdzona') return { possible: false, reason: 'nie-do-anulowania' }

  const deadline = cancellationDeadline(startsAt, cancellationWindowHours)
  // Granica należy do klienta: „do upływu okna" znaczy, że w ostatniej jego
  // sekundzie anulowanie jeszcze wchodzi.
  if (now.getTime() > deadline.getTime()) {
    return { possible: false, reason: 'po-oknie', deadline }
  }
  return { possible: true, deadline }
}

/** Dlaczego kliknięcie „Anuluj" niczego nie anulowało. */
export type CancellationProblem =
  /** Token, którego baza nie zna. */
  | 'link-nieznany'
  /** Okno domknięte — termin jest wciąż Rezerwacji, ale zwolnić go może już tylko Strzelnica. */
  | 'po-oknie'
  /** Rezerwacja terminu nie trzyma: anulowana, odwołana, wygasła albo jeszcze niepotwierdzona. */
  | 'nie-do-anulowania'

/**
 * Wynik próby anulowania. `alreadyCancelled` odróżnia pierwsze kliknięcie od
 * kolejnego — jedno i drugie zostawia Rezerwację anulowaną, ale tylko pierwsze
 * cokolwiek zmieniło, więc tylko po nim wychodzi list do Strzelnicy.
 */
export type CancellationOutcome =
  | { ok: true; alreadyCancelled: boolean }
  | { ok: false; problem: CancellationProblem }

/**
 * Odpowiedź funkcji bazodanowej `cancel_booking`: stan Rezerwacji po jej
 * przejściu i to, czy anulowanie weszło właśnie teraz. `null` znaczy token,
 * którego baza nie zna.
 */
export type CancellationResult = {
  status: BookingStatus
  justCancelled: boolean
}

/**
 * Co powiedzieć Osobie rezerwującej po kliknięciu „Anuluj". Stan czyta się
 * z bazy, a nie z zegara przeglądarki: to baza rozstrzyga, czy zdążyła.
 */
export function cancellationOutcome(result: CancellationResult | null): CancellationOutcome {
  if (!result) return { ok: false, problem: 'link-nieznany' }

  switch (result.status) {
    case 'anulowana-przez-klienta':
      return { ok: true, alreadyCancelled: !result.justCancelled }
    // Rezerwacja pozostawiona potwierdzoną znaczy, że baza odmówiła — a odmawia
    // z jednego powodu, bo jednego pilnuje: chwili domknięcia okna.
    case 'potwierdzona':
      return { ok: false, problem: 'po-oknie' }
    default:
      return { ok: false, problem: 'nie-do-anulowania' }
  }
}
