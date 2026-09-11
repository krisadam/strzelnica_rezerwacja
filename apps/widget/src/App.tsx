import type { Environment, SupabaseConfig } from '@strzelnica/shared'
import {
  MissingSupabaseConfigError,
  readConfirmationToken,
  readManagementToken,
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
import { MojaRezerwacja } from './MojaRezerwacja.js'

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

/**
 * Odświeżanie „teraz", żeby Blok mijający przy otwartej stronie zgasł sam —
 * i zarazem odczytu grafiku, żeby rozkład zmieniony w Panelu zszedł na ekran
 * klienta bez czekania na przeładowanie strony. Jedno z drugim chodzi w parze,
 * bo oba odpowiadają na to samo pytanie: co jest do wzięcia **teraz**.
 */
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
 * Wejścia z linków w e-mailach nie przechodzą tędy — tam nie ma czego
 * pokazywać w kalendarzu, a niepotrzebny odczyt grafiku mógłby przesłonić
 * sprawę, po którą klient przyszedł, własnym błędem.
 */
function Rezerwowanie({ slug }: { slug: string }) {
  const [stan, setStan] = useState<Stan>({ faza: 'wczytywanie' })
  const [now, setNow] = useState(() => new Date())
  const [gospodarz, setGospodarz] = useState<Gospodarz | null>(null)

  /**
   * Połączenie z bazą albo powód, dla którego go nie ma. Liczone raz
   * i zapamiętane: od niego zależy odczyt grafiku, więc nowy klient przy każdym
   * odświeżeniu byłby nowym połączeniem co minutę.
   */
  const polaczenie = useMemo<Polaczenie | { powod: string }>(() => {
    try {
      const config = readSupabaseConfig(srodowisko())
      return { client: createStrzelnicaClient(config), config }
    } catch (powod: unknown) {
      return { powod: komunikatBledu(powod) }
    }
  }, [])

  // Grafik czytany od nowa razem z „teraz", a nie tylko przy wejściu: rozkład
  // Bloków zmienia się w Panelu przez cały dzień, a ramka bywa otwarta
  // godzinami. Bez tego kalendarz oferowałby terminy, których Strzelnica już
  // nie sprzedaje — i dowiadywałby się o tym dopiero odmową przy zapisie.
  // Ta sama droga, co przy zajętości i z tego samego powodu.
  useEffect(() => {
    if (!('client' in polaczenie)) {
      setStan({ faza: 'blad', powod: polaczenie.powod })
      return
    }

    let aktualne = true

    loadGrafik(polaczenie.client, slug)
      .then((grafik) => {
        if (aktualne) setStan({ faza: 'gotowe', polaczenie, grafik })
      })
      // Nieudane **odświeżenie** nie zdejmuje z ekranu tego, co już na nim
      // stoi: grafik sprzed minuty jest bliższy prawdy niż komunikat o błędzie.
      // Pierwszy odczyt jest inny — po nim nie ma czego zostawić.
      .catch((powod: unknown) => {
        if (!aktualne) return
        setStan((dotad) =>
          dotad.faza === 'gotowe' ? dotad : { faza: 'blad', powod: komunikatBledu(powod) },
        )
      })

    return () => {
      aktualne = false
    }
  }, [polaczenie, slug, now])

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
 * Połączenie z bazą dla ekranów otwieranych linkiem z e-maila. Resztę wie
 * token, więc grafiku tu nie czytamy — niepotrzebny odczyt mógłby przesłonić
 * sprawę, po którą klient przyszedł, własnym błędem.
 *
 * Konfiguracja czytana raz i zapamiętana: wpadłaby w pętlę, gdyby przy każdym
 * renderze była nowym obiektem, bo od niej zależą same żądania.
 */
function useKonfiguracja(): Konfiguracja {
  return useMemo<Konfiguracja>(() => {
    try {
      return { config: readSupabaseConfig(srodowisko()) }
    } catch (powod: unknown) {
      return { powod: komunikatBledu(powod) }
    }
  }, [])
}

/** Wejście z linku potwierdzającego adres. Działa raz i nie robi nic więcej. */
function Potwierdzanie({ slug, token }: { slug: string; token: string }) {
  const konfiguracja = useKonfiguracja()

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

/**
 * Wejście z linku do zarządzania Rezerwacją. Odrębne od potwierdzania, bo
 * odrębne są uprawnienia: tamten token działa raz, ten żyje tak długo jak
 * Rezerwacja i to nim się ją anuluje.
 */
function SwojaRezerwacja({ token }: { token: string }) {
  const konfiguracja = useKonfiguracja()

  if ('powod' in konfiguracja) return <Komunikat powod={konfiguracja.powod} />

  return <MojaRezerwacja config={konfiguracja.config} token={token} />
}

/**
 * Po co Osoba rezerwująca weszła — poznaje się to po parametrze adresu, bo
 * Widget stoi pod jednym źródłem. Trzy zupełnie różne sprawy, więc trzy
 * niezależne poddrzewa, a nie jedno ze wspólnym stanem.
 *
 * Link potwierdzający ma pierwszeństwo, gdyby oba tokeny trafiły do jednego
 * adresu: bez potwierdzenia nie ma czym zarządzać.
 */
function Wejscie({ slug, search }: { slug: string; search: string }) {
  const potwierdzenie = readConfirmationToken(search)
  if (potwierdzenie) return <Potwierdzanie slug={slug} token={potwierdzenie} />

  const rezerwacja = readManagementToken(search)
  if (rezerwacja) return <SwojaRezerwacja token={rezerwacja} />

  return <Rezerwowanie slug={slug} />
}

export function App() {
  const search = window.location.search
  const slug = slugStrzelnicy(search)

  return (
    <main className="widget">
      <h1>{teksty.tytul}</h1>
      {slug ? <Wejscie slug={slug} search={search} /> : <Komunikat powod={teksty.brakParametru} />}
    </main>
  )
}
