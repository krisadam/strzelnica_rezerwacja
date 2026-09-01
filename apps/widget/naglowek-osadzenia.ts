/**
 * Nagłówek `frame-ancestors` dla dokumentu Widgetu, budowany z listy domen
 * dozwolonych przez konkretną Strzelnicę. Bez niego lista z Panelu byłaby
 * deklaracją bez skutku — osadzenie na obcej domenie blokuje przeglądarka,
 * a nie nasz kod. Zobacz ADR 0002 i spec, historia 56.
 *
 * Wtyczka obsługuje serwer deweloperski i `vite preview`; produkcyjny hosting
 * statyczny musi wystawiać ten sam nagłówek, licząc go tą samą funkcją
 * `frameAncestors` z `@strzelnica/shared`.
 */
// Import po ścieżce, nie po nazwie pakietu: plik konfiguracyjny Vite jest
// sklejany esbuildem, który wciąga importy względne, a pakiety robocze
// zostawia Node'owi — a ten nie rozwiąże wewnętrznych ścieżek `@strzelnica/shared`.
// Reguła i tak zostaje w jednej kopii; zmienia się wyłącznie sposób sięgnięcia
// po nią.
import type { Environment } from '../../packages/shared/src/config.js'
import { readSupabaseConfig } from '../../packages/shared/src/config.js'
import { frameAncestors } from '../../packages/shared/src/embedding.js'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'

/** Strzelnica, której nie znamy albo nie umiemy odpytać, nie zgodziła się na nic. */
const BRAK_ZGODY = "frame-ancestors 'none'"

async function dozwoloneDomeny(env: Environment, slug: string): Promise<string[]> {
  const { url, anonKey } = readSupabaseConfig(env)

  const adres = new URL('/rest/v1/facilities', url)
  adres.searchParams.set('slug', `eq.${slug}`)
  adres.searchParams.set('select', 'allowed_origins')

  const odpowiedz = await fetch(adres, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  if (!odpowiedz.ok) throw new Error(`PostgREST odpowiedział ${odpowiedz.status}.`)

  const wiersze = (await odpowiedz.json()) as { allowed_origins: string[] }[]
  return wiersze[0]?.allowed_origins ?? []
}

async function naglowek(env: Environment, slug: string): Promise<string> {
  try {
    return frameAncestors(await dozwoloneDomeny(env, slug))
  } catch (powod) {
    // Nieosiągalna baza czy błędny wpis w liście nie mogą otworzyć osadzania
    // wszystkim — awaria zamyka, nie otwiera.
    console.warn(`Nie udało się ustalić domen osadzenia dla „${slug}".`, powod)
    return BRAK_ZGODY
  }
}

export function naglowekOsadzenia(): Plugin {
  let env: Environment = {}

  // Nagłówek idzie na każdą ścieżkę, nie tylko na `/`: dokument Widgetu podaje
  // się także spod adresów zmyślonych przez osadzającego, bo serwer statycznej
  // aplikacji wraca do `index.html` dla wszystkiego, czego nie zna. Warunek na
  // ścieżkę byłby furtką: `…/cokolwiek?strzelnica=…` dostawałby ten sam Widget
  // bez żadnego ograniczenia osadzania.
  const middleware = (
    req: { url?: string },
    res: { setHeader: (nazwa: string, wartosc: string) => void },
    next: (blad?: unknown) => void,
  ): void => {
    const zadanie = new URL(req.url ?? '/', 'http://widget.local')
    const slug = zadanie.searchParams.get('strzelnica')

    // Adres bez wskazania Strzelnicy nie należy do żadnej z nich, więc żadna
    // nie zgodziła się na jego osadzenie.
    if (!slug) {
      res.setHeader('Content-Security-Policy', BRAK_ZGODY)
      return next()
    }

    naglowek(env, slug)
      .then((wartosc) => {
        res.setHeader('Content-Security-Policy', wartosc)
        next()
      })
      .catch(next)
  }

  return {
    name: 'strzelnica:naglowek-osadzenia',
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir, 'VITE_')
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
