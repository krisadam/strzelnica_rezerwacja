import type { Database, SupabaseConfig } from '@strzelnica/shared'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type StrzelnicaClient = SupabaseClient<Database>

/**
 * Klient PostgREST z kluczem anonimowym. Czyta wyłącznie dane publiczne
 * Strzelnicy — resztę odcina RLS, więc klucz w kodzie Widgetu nie jest
 * sekretem. Rezerwacji tym klientem nie da się zapisać; do tego jest Edge
 * Function w `zapis.ts`. Zobacz ADR 0003.
 */
export function createStrzelnicaClient({ url, anonKey }: SupabaseConfig): StrzelnicaClient {
  return createClient<Database>(url, anonKey, { auth: { persistSession: false } })
}
