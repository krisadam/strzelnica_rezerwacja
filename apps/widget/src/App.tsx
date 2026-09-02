import type { Environment, SupabaseConfig } from '@strzelnica/shared'
import {
  MissingSupabaseConfigError,
  readConfirmationToken,
  readSupabaseConfig,
} from '@strzelnica/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Gospodarz } from './gospodarz.js'
import { polaczZGospodarzem } from './gospodarz.js'
import type { Grafik } from './grafik.js'
import { loadGrafik, UnknownFacilityError } from './grafik.js'
import { PotwierdzenieAdresu } from './PotwierdzenieAdresu.js'
import { Rezerwacja } from './Rezerwacja.js'
import type { StrzelnicaClient } from './supabase.js'
import { createStrzelnicaClient } from './supabase.js'
import { teksty } from './teksty.js'

/**
 * Identyfikator Strzelnicy przychodzi z adresu ramki; wpisuje go tam skrypt
 * osadzający na podstawie atrybutu `data-strzelnica` (ADR 0002). Ten sam adres
 * otwarty wprost w przeglądarce działa tak samo — na tym stoi praca lokalna
 * i na tym stoi link z e-maila.
 */
function slugStrzelnicy(search: string): string | null {
  return new URLSearchParams(search).get('strzelnica')
}

function srodowisko(): Environment {
  return import.meta.env as unknown as Environment
}

/**
 * Osoba rezerwująca ma zobaczyć zdanie po polsku, a nie komunikat PostgREST.
 * Własną treść pokazują wyłącznie błędy, które sami nazwaliśmy; reszta ląduje
 * w konsoli i zostaje ogólnym komunikatem.
 */
function komunikatBledu(powod: unknown): string {
  if (powod instanceof UnknownFacilityError || powod instanceof MissingSupabaseConfigError) {
    return powod.message
  }
  console.error(powod)
  return teksty.bladWczytywania
}

/** Odświeżanie „teraz", żeby Blok mijający przy otwartej stronie zgasł sam. */
const ODSWIEZANIE_MS = 60_000

type Polaczenie = { client: StrzelnicaClient; config: SupabaseConfig }

type Stan =
  | { faza: 'wczytywanie' }
  | { faza: 'gotowe'; polaczenie: Polaczenie; grafik: Grafik }
  | { faza: 'blad'; powod: string }

function Komunikat({ powod }: { powod: string }) {
  return (
    <p className="komunikat komunikat--blad" role="alert">
      {powod}
    </p>
  )
}

/**
 * Ścieżka rezerwacji: grafik Strzelnicy i wszystko, co się z niego bierze.
 * Wejście z linku potwierdzającego nie przechodzi tędy — tam nie ma czego
 * pokazywać w kalendarzu, a niepotrzebny odczyt grafiku mógłby przesłonić
 * potwierdzenie własnym błędem.
 */
function Rezerwowanie({ slug }: { slug: string }) {
  const [stan, setStan] = useState<Stan>({ faza: 'wczytywanie' })
  const [now, setNow] = useState(() => new Date())
  const [gospodarz, setGospodarz] = useState<Gospodarz | null>(null)

  useEffect(() => {
    let aktualne = true

    Promise.resolve()
      .then(async () => {
        const config = readSupabaseConfig(srodowisko())
        const client = createStrzelnicaClient(config)
        return { polaczenie: { client, config }, grafik: await loadGrafik(client, slug) }
      })
      .then(({ polaczenie, grafik }) => {
        if (aktualne) setStan({ faza: 'gotowe', polaczenie, grafik })
      })
      .catch((powod: unknown) => {
        if (aktualne) setStan({ faza: 'blad', powod: komunikatBledu(powod) })
      })

    return () => {
      aktualne = false
    }
  }, [slug])

  useEffect(() => {
    const tik = setInterval(() => setNow(new Date()), ODSWIEZANIE_MS)
    return () => clearInterval(tik)
  }, [])

  useEffect(() => {
    const polaczenie = polaczZGospodarzem()
    setGospodarz(polaczenie)
    return () => polaczenie?.rozlacz()
  }, [])

  const zmianaWidoku = useCallback(() => gospodarz?.zazadajPrzewiniecia(), [gospodarz])

  if (stan.faza === 'wczytywanie') return <p className="komunikat">{teksty.wczytywanie}</p>
  if (stan.faza === 'blad') return <Komunikat powod={stan.powod} />

  return (
    <Rezerwacja
      client={stan.polaczenie.client}
      config={stan.polaczenie.config}
      slug={slug}
      grafik={stan.grafik}
      now={now}
      onZmianaWidoku={zmianaWidoku}
    />
  )
}

type Konfiguracja = { config: SupabaseConfig } | { powod: string }

/**
 * Wejście z linku z e-maila. Potrzebuje samego połączenia — resztę wie token.
 * Konfiguracja czytana raz i zapamiętana: wpadłaby w pętlę, gdyby przy każdym
 * renderze była nowym obiektem, bo od niej zależy samo potwierdzenie.
 */
function Potwierdzanie({ slug, token }: { slug: string; token: string }) {
  const konfiguracja = useMemo<Konfiguracja>(() => {
    try {
      return { config: readSupabaseConfig(srodowisko()) }
    } catch (powod: unknown) {
      return { powod: komunikatBledu(powod) }
    }
  }, [])

  const doKalendarza = useCallback(() => {
    // Ten sam Widget, ta sama Strzelnica, tylko bez tokenu — czyli zwyczajny
    // kalendarz. Pełne przeładowanie, bo do tej pory nie wczytaliśmy grafiku.
    window.location.assign(`?strzelnica=${encodeURIComponent(slug)}`)
  }, [slug])

  if ('powod' in konfiguracja) return <Komunikat powod={konfiguracja.powod} />

  return (
    <PotwierdzenieAdresu
      config={konfiguracja.config}
      token={token}
      onDoKalendarza={doKalendarza}
    />
  )
}

export function App() {
  const search = window.location.search
  const slug = slugStrzelnicy(search)
  // Token w adresie znaczy wejście ze skrzynki, a nie ze strony Strzelnicy.
  // To jedyne rozgałęzienie Widgetu — dwie zupełnie różne sprawy, więc dwa
  // niezależne poddrzewa, a nie jedno ze wspólnym stanem.
  const token = readConfirmationToken(search)

  return (
    <main className="widget">
      <h1>{teksty.tytul}</h1>
      {!slug && <Komunikat powod={teksty.brakParametru} />}
      {slug && (token ? <Potwierdzanie slug={slug} token={token} /> : <Rezerwowanie slug={slug} />)}
    </main>
  )
}
