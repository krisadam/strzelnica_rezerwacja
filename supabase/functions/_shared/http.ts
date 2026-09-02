/**
 * Odpowiedzi HTTP Edge Functions — jedna kopia dla wszystkich.
 *
 * Nagłówki CORS nie są tu żadnym zabezpieczeniem i nie należy ich za takie
 * brać: brama Supabase i tak dokłada własne `Access-Control-Allow-Origin: *`,
 * więc zawężanie ich tutaj niczego by nie zamknęło. Bramką jest sprawdzenie
 * wykonane w funkcji, zanim cokolwiek zostanie zapisane. CORS jest po to, żeby
 * żądanie Widgetu w ogóle ruszyło.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

/**
 * Wynik dziedzinowy — przyjęto albo odmówiono z powodu, który Osoba
 * rezerwująca może naprawić — jedzie zawsze z kodem 200. Kody spoza dwustu
 * zostają dla sytuacji, w których w ogóle nie doszło do rozpatrzenia żądania.
 */
export function outcome<T>(value: T, origin: string | null): Response {
  return json(value, 200, origin)
}
