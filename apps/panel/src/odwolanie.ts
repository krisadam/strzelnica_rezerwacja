/**
 * Odwołanie Rezerwacji przez Strzelnicę — jedyna rzecz, którą Panel w bazie
 * **zmienia**, i dlatego jedyna, która nie idzie zapytaniem PostgREST-a.
 * Rezerwacja zmienia stan wyłącznie przez Edge Functions (ADR 0003), a prawa
 * zapisu nie ma tu żadna publiczna rola (ADR 0009): Panel czyta bazę wprost,
 * a pisze do niej tą jedną drogą.
 *
 * Wołanie przez klienta, a nie przez własny `fetch` jak w Widgecie: tam
 * żądanie niesie sam klucz anonimowy, a tu upoważnieniem jest token
 * zalogowanego konta — `functions.invoke` dokłada go tym samym nasłuchem
 * sesji, którym dokłada go do zapytań PostgREST-a. Token przepisywany tutaj
 * z ręki byłby drugą kopią tej samej rzeczy, tą, która zostaje po wygaśnięciu
 * sesji.
 */
import type { RevocationOutcome, RevocationRequest } from '@strzelnica/shared'
import type { PanelClient } from './supabase.js'

const ODWOLAJ = 'odwolaj-rezerwacje'

export class BrakOdpowiedziError extends Error {
  constructor() {
    super('Funkcja odwołująca Rezerwację nie odpowiedziała wynikiem.')
    this.name = 'BrakOdpowiedziError'
  }
}

/**
 * Wynik odwołania albo wyjątek. Wynik dziedzinowy — odmowa z powodem, o którym
 * da się obsłudze powiedzieć zdaniem — przychodzi z kodem 200 i trafia do
 * `data`. `error` znaczy żądanie, którego w ogóle nie rozpatrzono: wygasłą
 * sesję, awarię funkcji, sieć — i nie ma czego pokazywać poza ogólnym błędem.
 */
export async function odwolajRezerwacje(
  client: PanelClient,
  // Całe żądanie, a nie numer i powód osobno: `RevocationRequest` jest tym, co
  // po drugiej stronie odczyta `readRevocationRequest`, więc rozłożenie go tu
  // na dwa napisy byłoby rozłożeniem, które trzeba złożyć z powrotem wiersz
  // niżej.
  request: RevocationRequest,
): Promise<RevocationOutcome> {
  const { data, error } = await client.functions.invoke<RevocationOutcome>(ODWOLAJ, {
    body: request,
  })

  if (error) throw error
  if (!data) throw new BrakOdpowiedziError()
  return data
}
