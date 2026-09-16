/**
 * Konfiguracja połączenia z Supabase, czytana ze zmiennych środowiskowych
 * przez Widget, Panel i skrypty. Czysta funkcja — środowisko jest
 * parametrem, nie odczytem `process.env` w środku.
 */
/** Zmienne środowiskowe w postaci, w jakiej podaje je Vite i Node. */
export type Environment = Record<string, string | undefined>

export type SupabaseConfig = {
  url: string
  anonKey: string
}

export class MissingSupabaseConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingSupabaseConfigError'
  }
}

function required(env: Environment, name: string): string {
  const value = env[name]?.trim()
  if (!value) {
    throw new MissingSupabaseConfigError(
      `Brak zmiennej ${name}. Uruchom \`pnpm db:start && pnpm db:env\`, żeby ją zapisać do .env.`,
    )
  }
  return value
}

/** Adres Supabase albo wyjątek mówiący, co z nim nie tak. */
function supabaseUrl(env: Environment): string {
  const url = required(env, 'VITE_SUPABASE_URL')

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new MissingSupabaseConfigError(`VITE_SUPABASE_URL nie jest adresem URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MissingSupabaseConfigError(`VITE_SUPABASE_URL musi być adresem http(s): ${url}`)
  }

  return url
}

/**
 * Zwraca konfigurację albo tłumaczy, czego brakuje. Aplikacja bez tych dwóch
 * zmiennych nie ma jak odpytać bazy, więc lepiej padnie przy starcie niż
 * przy pierwszym kliknięciu Osoby rezerwującej.
 */
export function readSupabaseConfig(env: Environment): SupabaseConfig {
  return { url: supabaseUrl(env), anonKey: required(env, 'VITE_SUPABASE_ANON_KEY') }
}

/**
 * To samo połączenie, ale rolą serwisową — dla skryptu operatora platformy,
 * który zakłada Strzelnicę (`tools/zaloz-strzelnice.ts`). Klucz anonimowy nie
 * ma prawa zapisać do `facilities` ani jednego wiersza i mieć go nie będzie
 * (ADR 0009), a rejestracji nie ma wcale, więc pierwsze konto Panelu też
 * powstaje tędy.
 *
 * Osobny kształt, a nie pole doklejone do `SupabaseConfig`: klucz serwisowy
 * omija RLS w całości, więc nie ma go dostać nikt, kto prosił o konfigurację
 * przeglądarki. Ten sam podział, co w testach przeglądarkowych.
 */
export type ServiceConfig = {
  url: string
  serviceRoleKey: string
}

export function readServiceConfig(env: Environment): ServiceConfig {
  return { url: supabaseUrl(env), serviceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY') }
}

/**
 * Zmienne odczytane z pliku `.env` — tego, który pisze `pnpm db:env`. Czysta
 * zamiana tekstu na zmienne: czytanie pliku należy do wołającego, bo `fs` ma
 * wyłącznie Node, a ten moduł czyta także przeglądarka.
 *
 * Wąsko i bez ambicji bycia `dotenv`: rozpoznaje `NAZWA=wartość` i zdejmuje
 * cudzysłowy, którymi Supabase CLI otacza klucze. Wiersz, którego nie rozumie,
 * pomija — plik pisze narzędzie, a nie człowiek, więc nie ma tu czego ratować
 * zgadywaniem.
 */
export function readEnvFile(content: string): Environment {
  const env: Environment = {}

  for (const linia of content.split(/\r?\n/)) {
    const dopasowanie = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/.exec(linia)
    if (!dopasowanie) continue
    const [, nazwa, wartosc] = dopasowanie
    if (nazwa && wartosc !== undefined) env[nazwa] = wartosc
  }

  return env
}
