/**
 * Logowanie do Panelu. Supabase Auth robi tu całą pracę, a ten moduł sprowadza
 * ją do trzech zdań, którymi mówi o niej reszta Panelu: kto jest zalogowany,
 * jak się zalogować i jak wyjść.
 *
 * Rejestracji nie ma i nie będzie w tej fazie (spec, historia 60: Strzelnice
 * zakłada operator platformy skryptem), więc nie ma tu ani `signUp`, ani
 * odzyskiwania hasła. Konto powstaje razem ze Strzelnicą.
 */
import type { PanelClient } from './supabase.js'

/** Zalogowany Użytkownik panelu. Strzelnicę mówi baza, nie token. */
export type Sesja = {
  userId: string
  /** Adres, którym się zalogował — stoi w nagłówku, żeby wiadomo było, kto patrzy. */
  email: string | null
}

/** Nieudane logowanie. Powód jest jeden, bo jedna jest odpowiedź: nie wpuszczamy. */
export type Logowanie = { ok: true } | { ok: false }

export async function zaloguj(
  client: PanelClient,
  email: string,
  haslo: string,
): Promise<Logowanie> {
  const { error } = await client.auth.signInWithPassword({ email, password: haslo })
  // Rozróżnienie „nie ma takiego konta" od „złe hasło" powiedziałoby
  // zgadującemu, które adresy w tej Strzelnicy istnieją. Jedna odpowiedź na oba.
  return error ? { ok: false } : { ok: true }
}

export async function wyloguj(client: PanelClient): Promise<void> {
  await client.auth.signOut()
}

/**
 * Kto jest zalogowany — teraz i po każdej zmianie. Supabase odpowiada na to
 * zdarzeniem także przy starcie (`INITIAL_SESSION`), więc jedna subskrypcja
 * wystarcza za odczyt i za nasłuch; osobne pytanie na starcie ścigałoby się
 * z nią o pierwszą odpowiedź.
 *
 * Zwraca funkcję odłączającą — tak samo jak `polaczZGospodarzem` w Widgecie.
 */
export function obserwujSesje(
  client: PanelClient,
  onZmiana: (sesja: Sesja | null) => void,
): () => void {
  const { data } = client.auth.onAuthStateChange((_zdarzenie, session) => {
    onZmiana(session ? { userId: session.user.id, email: session.user.email ?? null } : null)
  })

  return () => data.subscription.unsubscribe()
}
