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

/**
 * To samo zapytanie kluczem anonimowym — tym, który stoi w kodzie Widgetu
 * i w każdej przeglądarce świata. Zwraca surową odpowiedź, a nie wiersze, bo
 * właśnie o odmowę tu chodzi: test pyta, czy klucz publiczny czegoś **nie**
 * dostaje, a odmowa nie jest tu awarią do rzucenia wyjątkiem.
 */
export function bazaAnonimowo(sciezka: string, init: RequestInit = {}): Promise<Response> {
  const klucz = wymagana('VITE_SUPABASE_ANON_KEY')
  return fetch(new URL(`/rest/v1/${sciezka}`, wymagana('VITE_SUPABASE_URL')), {
    ...init,
    headers: { apikey: klucz, Authorization: `Bearer ${klucz}`, ...init.headers },
  })
}

/**
 * Tokeny kont Panelu, jeden na parę adres–hasło. Logowanie hasłem jest tu wejściem do
 * bazy, a nie przedmiotem testu — ten należy do `podglad-w-panelu` — a testy
 * izolacji zadają kontem kilkadziesiąt pytań. Bez tej pamięci każde z nich
 * byłoby osobnym logowaniem: wolniej i pod limitem żądań, który Supabase Auth
 * nakłada na wystawianie tokenów.
 *
 * Token żyje godzinę, a przebieg testów minuty, więc odświeżania nie ma.
 * Pamięć jest własnością procesu, więc każdy `worker` Playwrighta loguje się
 * raz na konto.
 */
const tokeny = new Map<string, Promise<string>>()

/** Klucz pamięci: adres **i** hasło, bo tokenu nie wystawia sam adres. */
const kluczTokenu = (email: string, haslo: string): string => `${email}\n${haslo}`

async function tokenKonta(email: string, haslo: string): Promise<string> {
  const klucz = wymagana('VITE_SUPABASE_ANON_KEY')
  const logowanie = await fetch(
    new URL('/auth/v1/token?grant_type=password', wymagana('VITE_SUPABASE_URL')),
    {
      method: 'POST',
      headers: { apikey: klucz, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: haslo }),
    },
  )
  if (!logowanie.ok) {
    throw new Error(`Logowanie ${email} nie powiodło się: ${await logowanie.text()}`)
  }
  const { access_token: token } = (await logowanie.json()) as { access_token: string }
  return token
}

/** Token konta, z pamięci albo z logowania. */
async function tokenPanelu(email: string, haslo: string): Promise<string> {
  // Nieudane logowanie nie zostaje w pamięci: zapamiętana odrzucona obietnica
  // zamieniłaby jedno potknięcie sieci w komplet padniętych testów.
  const kluczPamieci = kluczTokenu(email, haslo)
  let token = tokeny.get(kluczPamieci)
  if (!token) {
    token = tokenKonta(email, haslo)
    tokeny.set(kluczPamieci, token)
    token.catch(() => tokeny.delete(kluczPamieci))
  }
  return token
}

/**
 * Zapytanie kluczem anonimowym, ale z tokenem zalogowanego Użytkownika panelu
 * — czyli dokładnie tym, czym pyta Panel w przeglądarce. Zwraca surową
 * odpowiedź z tego samego powodu, co wyżej: sprawdzamy tu odmowy.
 */
export async function bazaJakoUzytkownikPanelu(
  email: string,
  haslo: string,
  sciezka: string,
  init: RequestInit = {},
): Promise<Response> {
  const klucz = wymagana('VITE_SUPABASE_ANON_KEY')
  const adres = wymagana('VITE_SUPABASE_URL')
  const token = await tokenPanelu(email, haslo)

  return fetch(new URL(`/rest/v1/${sciezka}`, adres), {
    ...init,
    headers: { apikey: klucz, Authorization: `Bearer ${token}`, ...init.headers },
  })
}

/**
 * Wołanie Edge Function tokenem Użytkownika panelu — tą samą drogą, którą woła
 * ją Panel w przeglądarce, i z tym samym nagłówkiem. Potrzebne tam, gdzie
 * granica Strzelnicy stoi **za** funkcją, a nie przed nią: prawa do funkcji
 * bazodanowej konto Panelu nie ma wcale (ADR 0003), więc pytanie „czy odwołam
 * cudzą Rezerwację" trzeba zadać tędy.
 *
 * Zwraca surową odpowiedź, bo o nią tu chodzi: wynik dziedzinowy i odmowa są
 * jednakowo odpowiedzią.
 */
export async function funkcjaJakoUzytkownikPanelu(
  email: string,
  haslo: string,
  nazwa: string,
  zadanie: unknown,
): Promise<Response> {
  const klucz = wymagana('VITE_SUPABASE_ANON_KEY')
  const adres = wymagana('VITE_SUPABASE_URL')
  const token = await tokenPanelu(email, haslo)

  return fetch(new URL(`/functions/v1/${nazwa}`, adres), {
    method: 'POST',
    headers: {
      apikey: klucz,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(zadanie),
  })
}
