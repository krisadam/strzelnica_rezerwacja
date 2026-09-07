/**
 * Odwołanie Rezerwacji przez Strzelnicę — jedna z dwóch rzeczy, które Panel
 * w bazie **zmienia**, i dlatego jedna z dwóch, które nie idą zapytaniem
 * PostgREST-a. Rezerwacja zmienia stan wyłącznie przez Edge Functions
 * (ADR 0003), a prawa zapisu nie ma tu żadna publiczna rola (ADR 0009): Panel
 * czyta bazę wprost, a pisze do niej tą jedną drogą — `wolajFunkcje`.
 */
import type { RevocationOutcome, RevocationRequest } from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'
import type { PanelClient } from './supabase.js'

const ODWOLAJ = 'odwolaj-rezerwacje'

export function odwolajRezerwacje(
  client: PanelClient,
  // Całe żądanie, a nie numer i powód osobno: `RevocationRequest` jest tym, co
  // po drugiej stronie odczyta `readRevocationRequest`, więc rozłożenie go tu
  // na dwa napisy byłoby rozłożeniem, które trzeba złożyć z powrotem wiersz
  // niżej.
  request: RevocationRequest,
): Promise<RevocationOutcome> {
  return wolajFunkcje<RevocationOutcome>(client, ODWOLAJ, request)
}
