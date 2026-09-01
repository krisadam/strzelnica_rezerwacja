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

/**
 * Zwraca konfigurację albo tłumaczy, czego brakuje. Aplikacja bez tych dwóch
 * zmiennych nie ma jak odpytać bazy, więc lepiej padnie przy starcie niż
 * przy pierwszym kliknięciu Osoby rezerwującej.
 */
export function readSupabaseConfig(env: Environment): SupabaseConfig {
  const url = required(env, 'VITE_SUPABASE_URL')
  const anonKey = required(env, 'VITE_SUPABASE_ANON_KEY')

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new MissingSupabaseConfigError(`VITE_SUPABASE_URL nie jest adresem URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MissingSupabaseConfigError(`VITE_SUPABASE_URL musi być adresem http(s): ${url}`)
  }

  return { url, anonKey }
}
