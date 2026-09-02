/**
 * Wysłanie zgłoszenia do Edge Function. Rezerwacja nie powstaje zapisem
 * z klienta — klucz anonimowy nie ma do tabeli żadnej polityki (ADR 0003) —
 * więc jedyne, co Widget potrafi zrobić z Rezerwacją, jest tutaj.
 */
import type { BookingOutcome, BookingRequest, SupabaseConfig } from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'

const FUNKCJA = 'zloz-rezerwacje'

export function zlozRezerwacje(
  config: SupabaseConfig,
  request: BookingRequest,
): Promise<BookingOutcome> {
  return wolajFunkcje<BookingOutcome>(config, FUNKCJA, request)
}
