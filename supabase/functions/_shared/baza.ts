/**
 * Połączenie z bazą rolą serwisową. Jedna kopia dla wszystkich Edge Functions:
 * rola, z jaką łączy się moduł zapisujący Rezerwacje, jest decyzją
 * bezpieczeństwa (ADR 0003), a decyzja powtórzona w każdej funkcji z osobna
 * daje się w jednej z nich po cichu zmienić.
 *
 * Jedna rola dla wszystkich czterech dróg zapisu — także dla odwołania, o które
 * prosi konto Panelu: jego tożsamość potwierdza GoTrue, a numer konta jedzie do
 * bazy parametrem (ADR 0010). Połączenia prawami zalogowanego konta nie ma tu
 * więc wcale, bo prawa zapisu nie ma żadna publiczna rola (ADR 0009).
 */
import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import type { Database } from '../../../packages/shared/src/index.ts'

export type Client = ReturnType<typeof createClient<Database>>

/**
 * Kody, którymi baza odmawia zapisu terminu — jedna kopia dla wszystkich
 * funkcji zapisujących. Każda z nich musi je rozpoznać i nazwać po swojemu
 * (ADR 0011), więc trzy kopie tej samej trójki rozjechałyby się przy pierwszym
 * kodzie dołożonym do schematu — a rozjazd znaczyłby odmowę bazy pokazaną jako
 * awaria serwera.
 *
 * Naruszenie ograniczenia wyłączności Osi; własny kod Postgresa.
 */
export const EXCLUSION_VIOLATION = '23P01'

/** Naruszenie Puli sztuk Typu broni; własny SQLSTATE `place_booking`. */
export const WEAPON_POOL_VIOLATION = 'WP001'

/**
 * Zderzenie Rezerwacji z Blokadą — w którąkolwiek stronę; własny SQLSTATE
 * wyzwalaczy wyłączności. Ograniczenie wykluczające obejmuje jedną tabelę,
 * więc kolizja **między** tabelami przychodzi innym kodem niż kolizja w obrębie
 * jednej (ADR 0011).
 */
export const CLOSURE_CONFLICT = 'LC001'

/**
 * Naruszenie jedyności — nazwy Osi w obrębie Strzelnicy; własny kod Postgresa.
 * Odmowa, a nie awaria: dwie Osie o jednej nazwie znaczą telefon do koleżanki
 * przy każdym polu wyboru w Panelu, a obsługa ma o tym usłyszeć zdaniem.
 */
export const UNIQUE_VIOLATION = '23505'

export function connect(): Client {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w środowisku funkcji.')
  }
  return createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } })
}

