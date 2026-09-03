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

/**
 * Token ze zgłoszenia albo `null`, gdy żądanie w ogóle go nie niesie. Wszystkie
 * funkcje otwierane linkiem z e-maila przyjmują go jednym polem `token`, więc
 * czyta go jedna kopia — a to, którego tokenu brak, mówi już sama funkcja.
 */
function readToken(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const token = (value as Record<string, unknown>).token
  if (typeof token !== 'string' || token.trim() === '') return null
  return token.trim()
}

/** Zdania, którymi funkcja odmawia — jedyne, co różni jedną skorupę od drugiej. */
export type TokenEndpointTexts = {
  /** Żądanie bez tokenu; nie przyszło z linku, więc nie ma o co pytać bazy. */
  brakTokenu: string
  /** Cokolwiek padło po drodze. Powód idzie do dziennika, nie do klienta. */
  awaria: string
}

/**
 * Skorupa funkcji otwieranej linkiem z e-maila. Wszystkie trzy — potwierdzenie,
 * podgląd Rezerwacji i anulowanie — mają ten sam kształt: `OPTIONS` na zapytanie
 * wstępne, `POST` z jednym polem `token`, wynik dziedzinowy z kodem 200 i nic
 * poza tym. Trzy kopie tego kształtu rozjechałyby się przy pierwszej poprawce
 * nagłówków, a poprawka nagłówków CORS pominięta w jednej z nich znaczy
 * funkcję, do której Widget nie dojdzie.
 *
 * Czego tu **nie ma**: sprawdzenia nagłówka `Origin`. Przy zapisie jest ono
 * bramką, bo tam o zapis prosi cudza strona w imieniu swojego gościa. Tutaj
 * jedynym upoważnieniem jest token z e-maila — nie ma ciasteczka ani sesji,
 * które dałoby się wykorzystać z obcej strony, więc lista domen zamknęłaby
 * najwyżej klienta poczty otwierającego link bez nagłówka. Zobacz ADR 0007.
 */
export function tokenEndpoint(
  texts: TokenEndpointTexts,
  handle: (token: string, origin: string | null) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const origin = req.headers.get('Origin')

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (req.method !== 'POST') return json({ error: 'Metoda nieobsługiwana.' }, 405, origin)

    const token = readToken(await req.json().catch(() => null))
    if (!token) return json({ error: texts.brakTokenu }, 400, origin)

    try {
      return await handle(token, origin)
    } catch (powod) {
      console.error(powod)
      return json({ error: texts.awaria }, 500, origin)
    }
  }
}
