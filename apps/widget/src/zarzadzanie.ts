/**
 * Rezerwacja spod linku do zarządzania: odczyt i anulowanie. Jedno i drugie
 * przez Edge Function — odczyt też, choć nie zmienia stanu: tabela `bookings`
 * niesie dane osobowe i nie ma żadnej polityki RLS (ADR 0003), a Osoba
 * rezerwująca nie ma konta, którym dałoby się jej pokazać własny wiersz
 * i tylko własny. Upoważnieniem jest token z adresu.
 */
import type { CancellationOutcome, ManagementOutcome, SupabaseConfig } from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'

const POKAZ = 'pokaz-rezerwacje'
const ANULUJ = 'anuluj-rezerwacje'

export function pokazRezerwacje(
  config: SupabaseConfig,
  token: string,
): Promise<ManagementOutcome> {
  return wolajFunkcje<ManagementOutcome>(config, POKAZ, { token })
}

export function anulujRezerwacje(
  config: SupabaseConfig,
  token: string,
): Promise<CancellationOutcome> {
  return wolajFunkcje<CancellationOutcome>(config, ANULUJ, { token })
}
