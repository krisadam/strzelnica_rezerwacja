import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Dostęp do bazy rolą serwisową — wyłącznie dla testów.
 *
 * Testy przeglądarkowe potrzebują dwóch rzeczy, których Osoba rezerwująca nie
 * widzi i widzieć nie ma: przechwyconej poczty (tabela `mail_outbox`, bez
 * jednej polityki RLS) i możliwości przesunięcia terminu wygaśnięcia, bo
 * czekania trzydziestu minut nie da się w teście odbyć. Jedno i drugie idzie
 * kluczem serwisowym, tym samym, którym łączą się Edge Functions.
 *
 * Klucz i adres bierzemy z `.env` w korzeniu repozytorium — pliku, który pisze
 * `pnpm db:env`. Ta sama droga, co dla Widgetu; tylko zmienna inna.
 */
const KORZEN_ENV = fileURLToPath(new URL('../../.env', import.meta.url))

let wczytane: Record<string, string> | null = null

/**
 * Zmienne z pliku `.env`. Czytane raz i zapamiętane. Zmienna podana
 * w środowisku procesu wygrywa z plikiem — tak, jak dzieje się na CI.
 */
function srodowisko(): Record<string, string> {
  if (wczytane) return wczytane

  const plik: Record<string, string> = {}
  try {
    for (const linia of readFileSync(KORZEN_ENV, 'utf8').split(/\r?\n/)) {
      const dopasowanie = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/.exec(linia)
      if (!dopasowanie) continue
      const [, nazwa, wartosc] = dopasowanie
      if (nazwa && wartosc !== undefined) plik[nazwa] = wartosc
    }
  } catch {
    // Brak pliku nie jest tu błędem — zmienne mogą stać w środowisku procesu.
  }

  wczytane = { ...plik, ...(process.env as Record<string, string>) }
  return wczytane
}

function wymagana(nazwa: string): string {
  const wartosc = srodowisko()[nazwa]?.trim()
  if (!wartosc) {
    throw new Error(`Brak zmiennej ${nazwa}. Uruchom \`pnpm db:start && pnpm db:env\`.`)
  }
  return wartosc
}

/**
 * Zapytanie do PostgREST-a rolą serwisową. Zwraca wiersze albo rzuca — test,
 * który nie doczytał, ma paść tam, gdzie nie doczytał.
 */
export async function baza<T>(
  sciezka: string,
  init: RequestInit = {},
): Promise<T> {
  const klucz = wymagana('SUPABASE_SERVICE_ROLE_KEY')
  const odpowiedz = await fetch(new URL(`/rest/v1/${sciezka}`, wymagana('VITE_SUPABASE_URL')), {
    ...init,
    headers: {
      apikey: klucz,
      Authorization: `Bearer ${klucz}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  })

  if (!odpowiedz.ok) {
    throw new Error(`PostgREST odpowiedział kodem ${odpowiedz.status}: ${await odpowiedz.text()}`)
  }
  return (await odpowiedz.json()) as T
}
