/**
 * Wejście w link potwierdzający adres. Tą samą drogą, co zapis (`zapis.ts`),
 * i z tego samego powodu: przeglądarka nie umie zmienić stanu Rezerwacji
 * inaczej niż prosząc o to serwer (ADR 0003).
 */
import type { ConfirmationOutcome, SupabaseConfig } from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'

const FUNKCJA = 'potwierdz-rezerwacje'

export function potwierdzRezerwacje(
  config: SupabaseConfig,
  token: string,
): Promise<ConfirmationOutcome> {
  return wolajFunkcje<ConfirmationOutcome>(config, FUNKCJA, { token })
}
