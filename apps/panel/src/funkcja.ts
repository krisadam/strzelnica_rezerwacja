/**
 * Wołanie Edge Function z Panelu. Jedna kopia dla obu rzeczy, które Panel
 * w bazie zmienia — odwołania Rezerwacji i Blokady Osi — bo obie idą tak samo:
 * POST z tokenem zalogowanego konta, wynik dziedzinowy z kodem 200, wszystko
 * inne wyjątkiem.
 *
 * Wołanie przez klienta Supabase, a nie przez własny `fetch` jak w Widgecie:
 * tam żądanie niesie sam klucz anonimowy, a tu upoważnieniem jest token konta
 * — `functions.invoke` dokłada go tym samym nasłuchem sesji, którym dokłada go
 * do zapytań PostgREST-a. Token przepisywany z ręki byłby drugą kopią tej samej
 * rzeczy, tą, która zostaje po wygaśnięciu sesji.
 *
 * Asymetria wobec `dane.ts`, który czyta z bazy wprost, jest zamierzona
 * i nie należy jej „ujednolicać": prawa zapisu nie ma tu żadna publiczna rola
 * (ADR 0009), a walidacja i poczta dzieją się w funkcjach (ADR 0003) — więc
 * wszystko, co Panel potrafi zmienić, przechodzi tędy.
 */
import type { PanelClient } from './supabase.js'

export class BrakOdpowiedziError extends Error {
  constructor(nazwa: string) {
    super(`Funkcja ${nazwa} nie odpowiedziała wynikiem.`)
    this.name = 'BrakOdpowiedziError'
  }
}

/**
 * Wynik funkcji albo wyjątek. Wynik dziedzinowy — odmowa z powodem, o którym
 * da się obsłudze powiedzieć zdaniem — przychodzi z kodem 200 i trafia do
 * `data`. `error` znaczy żądanie, którego w ogóle nie rozpatrzono: wygasłą
 * sesję, awarię funkcji, sieć — i nie ma czego pokazywać poza ogólnym błędem.
 */
export async function wolajFunkcje<T>(
  client: PanelClient,
  nazwa: string,
  // Treść żądania jako zwykły obiekt, bo `functions.invoke` sam ją serializuje
  // — i tylko obiekt przyjmuje. Kształt zna wołający: po drugiej stronie
  // odczyta go `read…Request` z `packages/shared`.
  zadanie: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.functions.invoke<T>(nazwa, { body: zadanie })

  if (error) throw error
  if (!data) throw new BrakOdpowiedziError(nazwa)
  return data
}
