import type { Database } from '@strzelnica/shared'
import { readSupabaseConfig } from '@strzelnica/shared'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type StrzelnicaClient = SupabaseClient<Database>

/**
 * Klient PostgREST z kluczem anonimowym. Czyta wyłącznie dane publiczne
 * Strzelnicy — resztę odcina RLS, więc klucz w kodzie Widgetu nie jest
 * sekretem. Zobacz ADR 0003.
 */
export function createStrzelnicaClient(
  env: Record<string, string | undefined>,
): StrzelnicaClient {
  const { url, anonKey } = readSupabaseConfig(env)
  return createClient<Database>(url, anonKey, { auth: { persistSession: false } })
}
