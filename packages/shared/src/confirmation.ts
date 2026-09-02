/**
 * Potwierdzenie adresu e-mail. Rezerwacja powstaje oczekująca i trzyma termin
 * tak samo jak potwierdzona — ale tylko przez chwilę: zmyślony adres nie ma
 * blokować soboty. Czysta funkcja orzeka, co znaczy odpowiedź bazy; sama
 * zmiana stanu należy do bazy, bo tylko tam jest jeden zegar i jedna kolejka.
 */
import type { Database } from './database.types.ts'
import { widgetLink } from './links.ts'
import type { WidgetLinkInput } from './links.ts'

/**
 * Ile czasu Rezerwacja czeka na potwierdzenie adresu. Nie jest polem
 * konfiguracji Strzelnicy — spec podaje jedną liczbę dla całego modułu, a
 * Strzelnica, która chciałaby innej, chciałaby też innej reguły wygasania.
 *
 * Stąd jedziemy z tą liczbą do bazy przy każdym zapisie, zamiast wpisywać ją
 * drugi raz w SQL-u: termin liczy się zegarem bazy, ale długość czekania
 * należy do domeny i ma jedną kopię.
 */
export const HOLD_MINUTES = 30

/** Parametr adresu, którym Widget poznaje wejście z linku potwierdzającego. */
export const CONFIRMATION_PARAM = 'potwierdzenie'

type BookingStatus = Database['public']['Enums']['booking_status']

/** Dlaczego link nie potwierdził Rezerwacji. */
export type ConfirmationProblem =
  | 'link-nieznany'
  | 'rezerwacja-wygasla'
  /** Rezerwacja odwołana albo w stanie, którego link nie dotyczy. */
  | 'rezerwacja-nieaktualna'

/**
 * Wynik wejścia w link. `alreadyConfirmed` odróżnia pierwsze wejście od
 * kolejnego: jedno i drugie zostawia Rezerwację potwierdzoną, ale tylko
 * pierwsze cokolwiek zmieniło — i tylko o pierwszym wolno powiedzieć
 * „potwierdziliśmy".
 */
export type ConfirmationOutcome =
  | { ok: true; alreadyConfirmed: boolean }
  | { ok: false; problem: ConfirmationProblem }

/**
 * Odpowiedź funkcji bazodanowej `confirm_booking`: stan Rezerwacji po jej
 * przejściu i to, czy potwierdzenie weszło właśnie teraz. `null` znaczy token,
 * którego baza nie zna.
 */
export type ConfirmationResult = {
  status: BookingStatus
  justConfirmed: boolean
}

/**
 * Co powiedzieć Osobie rezerwującej po wejściu w link. Stan czyta się z bazy,
 * a nie liczy z zegara przeglądarki: to baza rozstrzyga, czy zdążyła.
 */
export function confirmationOutcome(result: ConfirmationResult | null): ConfirmationOutcome {
  if (!result) return { ok: false, problem: 'link-nieznany' }

  switch (result.status) {
    case 'potwierdzona':
      return { ok: true, alreadyConfirmed: !result.justConfirmed }
    case 'wygasla':
      return { ok: false, problem: 'rezerwacja-wygasla' }
    // Rezerwacja oczekująca po przejściu przez `confirm_booking` znaczy, że
    // potwierdzenie nie weszło mimo żywego terminu — nie ma czego ogłaszać.
    default:
      return { ok: false, problem: 'rezerwacja-nieaktualna' }
  }
}

/** Wejście `confirmationUrl` — kształt wspólny wszystkim linkom Widgetu. */
export type ConfirmationUrlInput = WidgetLinkInput

/**
 * Link z e-maila. Prowadzi do Widgetu podanego wprost, a nie do ramki na
 * stronie Strzelnicy: e-mail otwiera się poza jej witryną, a Widget umie stanąć
 * samodzielnie — na tym samym adresie stoi praca lokalna.
 *
 * Działa raz i nie robi nic więcej: potwierdza Rezerwację oczekującą. Powrót do
 * własnej Rezerwacji ma osobny link i osobny token — zobacz `managementUrl`.
 */
export function confirmationUrl(input: ConfirmationUrlInput): string {
  return widgetLink(CONFIRMATION_PARAM, input)
}

/** Token z adresu Widgetu; `null` znaczy zwykłe wejście do kalendarza. */
export function readConfirmationToken(search: string): string | null {
  return new URLSearchParams(search).get(CONFIRMATION_PARAM)
}

/** Ile bajtów losowości niesie token. 32 bajty to 256 bitów — nie do zgadnięcia. */
const TOKEN_BYTES = 32

/**
 * Nowy token potwierdzający. Losowany, a nie podpisany i nie wyprowadzany
 * z identyfikatora Rezerwacji — zobacz ADR 0007. W skrócie: identyfikator
 * wraca do przeglądarki na potwierdzeniu, więc link liczony z niego każdy
 * klient umiałby sobie podrobić, a podpis oszczędzałby odczyt z bazy, którego
 * i tak nie da się pominąć.
 */
export function newConfirmationToken(): string {
  const bajty = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  return Array.from(bajty, (bajt) => bajt.toString(16).padStart(2, '0')).join('')
}
