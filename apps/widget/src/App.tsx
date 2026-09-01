import { MissingSupabaseConfigError } from '@strzelnica/shared'
import { useCallback, useEffect, useState } from 'react'
import type { Gospodarz } from './gospodarz.js'
import { polaczZGospodarzem } from './gospodarz.js'
import type { Grafik } from './grafik.js'
import { loadGrafik, UnknownFacilityError } from './grafik.js'
import { Kalendarz } from './Kalendarz.js'
import { createStrzelnicaClient } from './supabase.js'
import { teksty } from './teksty.js'

/**
 * Identyfikator Strzelnicy przychodzi z adresu ramki; wpisuje go tam skrypt
 * osadzający na podstawie atrybutu `data-strzelnica` (ADR 0002). Ten sam adres
 * otwarty wprost w przeglądarce działa tak samo — na tym stoi praca lokalna.
 */
function slugStrzelnicy(search: string): string | null {
  return new URLSearchParams(search).get('strzelnica')
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

type Stan =
  | { faza: 'wczytywanie' }
  | { faza: 'gotowe'; grafik: Grafik }
  | { faza: 'blad'; powod: string }

export function App() {
  const slug = slugStrzelnicy(window.location.search)
  const [stan, setStan] = useState<Stan>({ faza: 'wczytywanie' })
  const [now, setNow] = useState(() => new Date())
  const [gospodarz, setGospodarz] = useState<Gospodarz | null>(null)

  useEffect(() => {
    if (!slug) {
      setStan({ faza: 'blad', powod: teksty.brakParametru })
      return
    }

    let aktualne = true
    const env = import.meta.env as unknown as Record<string, string | undefined>

    Promise.resolve()
      .then(() => loadGrafik(createStrzelnicaClient(env), slug))
      .then((grafik) => {
        if (aktualne) setStan({ faza: 'gotowe', grafik })
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

  return (
    <main className="widget">
      <h1>{teksty.tytul}</h1>
      {stan.faza === 'wczytywanie' && <p className="komunikat">{teksty.wczytywanie}</p>}
      {stan.faza === 'blad' && (
        <p className="komunikat komunikat--blad" role="alert">
          {stan.powod}
        </p>
      )}
      {stan.faza === 'gotowe' && (
        <Kalendarz grafik={stan.grafik} now={now} onZmianaWidoku={zmianaWidoku} />
      )}
    </main>
  )
}
