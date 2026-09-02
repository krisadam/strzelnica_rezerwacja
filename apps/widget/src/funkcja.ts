/**
 * Wołanie Edge Function. Jedna kopia dla wszystkich, bo wszystkie idą tak samo:
 * POST z kluczem anonimowym, wynik dziedzinowy z kodem 200, wszystko inne
 * wyjątkiem.
 *
 * Asymetria wobec `grafik.ts`, który czyta z bazy wprost, jest zamierzona
 * i nie należy jej „ujednolicać": Rezerwacja nie powstaje i nie zmienia stanu
 * zapisem z klienta — klucz anonimowy nie ma do tabeli żadnej polityki
 * (ADR 0003) — więc wszystko, co Widget potrafi z nią zrobić, przechodzi tędy.
 */
import type { SupabaseConfig } from '@strzelnica/shared'

export class EdgeFunctionFailedError extends Error {
  constructor(nazwa: string, status: number) {
    super(`Edge Function ${nazwa} odpowiedziała kodem ${status}.`)
    this.name = 'EdgeFunctionFailedError'
  }
}

/**
 * Odpowiedź funkcji albo wyjątek. Wynik dziedzinowy — przyjęto albo odmówiono
 * z powodu, który Osoba rezerwująca może naprawić — przychodzi z kodem 200.
 * Wszystko inne znaczy, że żądania w ogóle nie rozpatrzono, i nie ma czego
 * pokazywać poza ogólnym błędem.
 */
export async function wolajFunkcje<T>(
  config: SupabaseConfig,
  nazwa: string,
  zadanie: unknown,
): Promise<T> {
  const odpowiedz = await fetch(new URL(`/functions/v1/${nazwa}`, config.url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
    body: JSON.stringify(zadanie),
  })

  if (!odpowiedz.ok) throw new EdgeFunctionFailedError(nazwa, odpowiedz.status)
  return (await odpowiedz.json()) as T
}
