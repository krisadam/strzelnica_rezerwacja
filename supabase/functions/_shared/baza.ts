/**
 * Połączenie z bazą rolą serwisową. Jedna kopia dla wszystkich Edge Functions:
 * rola, z jaką łączy się moduł zapisujący Rezerwacje, jest decyzją
 * bezpieczeństwa (ADR 0003), a decyzja powtórzona w każdej funkcji z osobna
 * daje się w jednej z nich po cichu zmienić.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import type { Database } from '../../../packages/shared/src/index.ts'

export type Client = ReturnType<typeof createClient<Database>>

export function connect(): Client {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w środowisku funkcji.')
  }
  return createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } })
}
