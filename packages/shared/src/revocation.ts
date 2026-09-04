/**
 * Odwołanie Rezerwacji przez Strzelnicę: żądanie, jego reguła i odpowiedź
 * bazy przetłumaczona na zdanie dla obsługi.
 *
 * Odrębne od anulowania przez klienta, choć skutek dla terminu jest ten sam.
 * Tamto zna Okno anulowania i po jego upływie odmawia; to nie zna żadnego
 * okna, bo istnieje właśnie dla chwili, w której klient sam już nie może,
 * a Strzelnica musi — awaria, zawody, zamknięty obiekt. Za to wymaga powodu,
 * którego tamto nie ma o co pytać: klient wie, dlaczego anulował, a Strzelnica
 * musi mu to powiedzieć.
 *
 * Czyste funkcje, jak przy zgłoszeniu Rezerwacji: ta sama kopia orzeka
 * w Panelu, zanim pokaże się przycisk, i w Edge Function, zanim cokolwiek
 * trafi do bazy.
 */
import type { Database } from './database.types.ts'

type BookingStatus = Database['public']['Enums']['booking_status']

/**
 * Żądanie odwołania. Identyfikator Rezerwacji, a nie token: upoważnieniem
 * jest tu konto Panelu, a o tym, czy Rezerwacja jest jego Strzelnicy,
 * rozstrzyga baza (ADR 0010). Numer podstawiony z palca nie otwiera więc
 * niczego, choć wprost tu stoi.
 */
export type RevocationRequest = {
  bookingId: string
  reason: string
}

export class MalformedRevocationRequestError extends Error {
  constructor(message: string) {
    super(`Żądanie odwołania ma zły kształt: ${message}`)
    this.name = 'MalformedRevocationRequestError'
  }
}

/**
 * Żądanie odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie kształt —
 * czy da się z tego zbudować `RevocationRequest`. O tym, czy wolno je przyjąć,
 * orzeka `revocationProblem`, tak samo jak `bookingProblems` przy zgłoszeniu.
 */
export function readRevocationRequest(value: unknown): RevocationRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedRevocationRequestError('treść żądania nie jest obiektem')
  }

  const source = value as Record<string, unknown>

  // Pole adresujące żądanie: bez niego nie ma czego szukać w bazie.
  const bookingId = source.bookingId
  if (typeof bookingId !== 'string' || bookingId.trim() === '') {
    throw new MalformedRevocationRequestError('pole bookingId nie jest wypełnionym napisem')
  }

  // Powód wolno tu przepuścić pusty — orzeka o nim zastrzeżenie niżej, ta sama
  // funkcja, którą pyta Panel. Odsianie go już tutaj czyniłoby „brak-powodu"
  // odpowiedzią, której serwer nigdy nie udziela.
  const reason = source.reason
  if (typeof reason !== 'string') {
    throw new MalformedRevocationRequestError('pole reason nie jest napisem')
  }

  return { bookingId: bookingId.trim(), reason: reason.trim() }
}

/** Dlaczego odwołanie nie doszło do skutku. */
export type RevocationProblem =
  /**
   * Powód nie został podany. Jest on całą treścią listu do klienta: bez niego
   * zostałoby mu zdanie „odwołana" i telefon do Strzelnicy, po który i tak
   * sięgnie — a wtedy odwołanie w Panelu byłoby zadaniem tej rozmowy, nie jej
   * uniknięciem.
   */
  | 'brak-powodu'
  /** Rezerwacja, której ta Strzelnica nie ma: cudza albo już nieistniejąca. */
  | 'nieznana-rezerwacja'
  /** Rezerwacja terminu nie trzyma albo czeka na potwierdzenie adresu. */
  | 'nie-do-odwolania'

/**
 * Zastrzeżenie do powodu albo `null`. Jedno pole, więc jedna wartość, a nie
 * lista jak przy zgłoszeniu Rezerwacji: formularz odwołania ma dokładnie
 * jedno pole i dokładnie jedną rzecz, którą da się w nim zrobić źle.
 */
export function revocationProblem(reason: string): RevocationProblem | null {
  return reason.trim() === '' ? 'brak-powodu' : null
}

/**
 * Czy tę Rezerwację Strzelnica ma jeszcze co odwoływać. Wyłącznie potwierdzona:
 * oczekująca zniknie sama po Czasie na potwierdzenie, a listu z powodem nie ma
 * gdzie wysłać, bo adres nie został potwierdzony i bywa zmyślony. Pozostałe
 * stany terminu już nie trzymają.
 *
 * Ta sama granica stoi w warunku `revoke_booking` — tam rozstrzyga, tutaj
 * mówi Panelowi, czy pokazać przycisk.
 */
export function revocable(status: BookingStatus): boolean {
  return status === 'potwierdzona'
}

/**
 * Odpowiedź funkcji bazodanowej `revoke_booking`: stan Rezerwacji po jej
 * przejściu i to, czy odwołanie weszło właśnie teraz. `null` znaczy
 * Rezerwację, której baza tej Strzelnicy nie przypisuje.
 */
export type RevocationResult = {
  status: BookingStatus
  justRevoked: boolean
}

/**
 * Wynik próby odwołania. `alreadyRevoked` odróżnia pierwsze kliknięcie od
 * kolejnego — jedno i drugie zostawia Rezerwację odwołaną, ale tylko pierwsze
 * cokolwiek zmieniło, więc tylko po nim wychodzi list do klienta.
 */
export type RevocationOutcome =
  | { ok: true; alreadyRevoked: boolean }
  | { ok: false; problem: RevocationProblem }

/**
 * Co powiedzieć obsłudze po kliknięciu „Odwołaj". Stan czyta się z bazy, a nie
 * z ekranu: między wczytaniem Panelu a kliknięciem klient mógł anulować
 * Rezerwację sam, a Panel odświeża się raz na minutę.
 */
export function revocationOutcome(result: RevocationResult | null): RevocationOutcome {
  if (!result) return { ok: false, problem: 'nieznana-rezerwacja' }

  // Odwołana — czy to teraz, czy wcześniej. Baza odmawia z jednego powodu, bo
  // jednego pilnuje: stanu Rezerwacji.
  if (result.status === 'odwolana-przez-strzelnice') {
    return { ok: true, alreadyRevoked: !result.justRevoked }
  }
  return { ok: false, problem: 'nie-do-odwolania' }
}
