/**
 * Wysłanie zgłoszenia do Edge Function. Rezerwacja nie powstaje zapisem
 * z klienta — klucz anonimowy nie ma do tabeli żadnej polityki (ADR 0003) —
 * więc jedyne, co Widget potrafi zrobić z Rezerwacją, jest tutaj.
 *
 * Asymetria wobec `grafik.ts`, który czyta z bazy wprost, jest zamierzona
 * i nie należy jej „ujednolicać".
 */
import type { BookingOutcome, BookingRequest, SupabaseConfig } from '@strzelnica/shared'

const FUNKCJA = 'zloz-rezerwacje'

export class BookingFailedError extends Error {
  constructor(status: number) {
    super(`Edge Function odpowiedziała kodem ${status}.`)
    this.name = 'BookingFailedError'
  }
}

/**
 * Wynik dziedzinowy — przyjęto albo odmówiono z powodu — przychodzi z kodem
 * 200. Wszystko inne znaczy, że zgłoszenie w ogóle nie zostało rozpatrzone,
 * i nie ma czego pokazywać Osobie rezerwującej poza ogólnym błędem.
 */
export async function zlozRezerwacje(
  config: SupabaseConfig,
  request: BookingRequest,
): Promise<BookingOutcome> {
  const odpowiedz = await fetch(new URL(`/functions/v1/${FUNKCJA}`, config.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify(request),
  })

  if (!odpowiedz.ok) throw new BookingFailedError(odpowiedz.status)
  return (await odpowiedz.json()) as BookingOutcome
}
