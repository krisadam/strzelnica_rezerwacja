/**
 * Konfiguracja platformy czytana ze środowiska funkcji. Jedna kopia dla
 * wszystkich Edge Functions: brakująca zmienna ma padać jednym zdaniem, a nie
 * dwoma napisanymi osobno w każdej funkcji z osobna.
 */

/**
 * Źródło, spod którego serwowany jest sam Widget. Nie jest domeną osadzenia —
 * te wskazuje Strzelnica w `facilities.allowed_origins` — tylko domeną naszą,
 * jednakową dla wszystkich Strzelnic, więc mieszka w konfiguracji platformy,
 * a nie w jej danych.
 *
 * Prowadzą do niej także linki z e-maili: wiadomość otwiera się poza witryną
 * Strzelnicy, a Widget umie stanąć samodzielnie.
 */
export function widgetOrigin(): string {
  const origin = Deno.env.get('WIDGET_ORIGIN')
  if (!origin) throw new Error('Brak WIDGET_ORIGIN w środowisku funkcji.')
  return origin
}
