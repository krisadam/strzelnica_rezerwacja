import type { Database, SupabaseConfig } from '@strzelnica/shared'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type PanelClient = SupabaseClient<Database>

let klient: PanelClient | null = null

/**
 * Klient PostgREST Panelu. Ten sam klucz anonimowy, co w Widgecie — sam z siebie
 * nie otwiera niczego — i ta sama RLS. Różnicę robi dopiero token zalogowanego
 * Użytkownika panelu, który klient dokłada do każdego żądania po zalogowaniu:
 * dopiero on wpuszcza do widoku `panel_bookings` i do pozycji Rezerwacji.
 *
 * Sesja jest zapamiętywana — inaczej niż w Widgecie, gdzie żadnej nie ma.
 * Obsługa trzyma Panel otwarty przez cały dzień i przeładowanie strony nie ma
 * jej wyrzucać do formularza logowania.
 *
 * Jeden klient na kartę, stąd zapamiętanie w module: sesja stoi pod jednym
 * kluczem w `localStorage`, więc dwa klienty odświeżałyby ten sam token dwiema
 * rękami — i Supabase mówi o tym wprost ostrzeżeniem. Drugie wywołanie bierze
 * się z trybu ścisłego Reacta, który każdy render wykonuje dwa razy.
 */
export function panelClient({ url, anonKey }: SupabaseConfig): PanelClient {
  klient ??= createClient<Database>(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return klient
}
