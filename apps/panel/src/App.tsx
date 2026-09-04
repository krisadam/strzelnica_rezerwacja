import type { BookingFilter, CalendarDay, Environment } from '@strzelnica/shared'
import { dayIn, MissingSupabaseConfigError, readSupabaseConfig } from '@strzelnica/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dane } from './dane.js'
import { BrakStrzelnicyError, wczytajDane } from './dane.js'
import { Kalendarz } from './Kalendarz.js'
import { Lista } from './Lista.js'
import { Logowanie } from './Logowanie.js'
import type { Sesja } from './sesja.js'
import { obserwujSesje, wyloguj } from './sesja.js'
import type { PanelClient } from './supabase.js'
import { panelClient } from './supabase.js'
import { Szczegoly } from './Szczegoly.js'
import { teksty } from './teksty.js'

/**
 * Obsłudze należy się zdanie po polsku, a nie komunikat PostgREST-a. Własną
 * treść pokazują wyłącznie błędy, które sami nazwaliśmy; reszta ląduje
 * w konsoli i zostaje ogólnym komunikatem.
 */
function komunikatBledu(powod: unknown): string {
  if (powod instanceof BrakStrzelnicyError || powod instanceof MissingSupabaseConfigError) {
    return powod.message
  }
  console.error(powod)
  return teksty.bladWczytywania
}

function Komunikat({ powod }: { powod: string }) {
  return (
    <p className="komunikat komunikat--blad" role="alert">
      {powod}
    </p>
  )
}

type Stan =
  | { faza: 'wczytywanie' }
  | { faza: 'gotowe'; dane: Dane }
  | { faza: 'blad'; powod: string }

/**
 * Jak często Panel pyta bazę na nowo. Rezerwacje przychodzą z Widgetu przez
 * cały dzień, a obsługa trzyma ten ekran otwarty od rana — kalendarz, który
 * pokazuje stan sprzed czterech godzin, jest gorszy niż żaden, bo wygląda tak
 * samo jak prawdziwy. Tą samą drogą gasną Rezerwacje oczekujące: `holds_term`
 * liczy zegar bazy w chwili odczytu, więc odświeżenie jest tu jedynym sposobem,
 * żeby wygasła zeszła z Osi.
 */
const ODSWIEZANIE_MS = 60_000

/**
 * Panel zalogowanego Użytkownika: kalendarz dnia, lista z filtrami i szczegóły
 * pojedynczej Rezerwacji. Wszystkie trzy pokazują ten sam zbiór, pobrany raz —
 * trzy odczyty rozjechałyby się między sobą, a obsługa czytałaby na jednym
 * ekranie Rezerwację, której na drugim już nie ma.
 *
 * Wybrana Rezerwacja przesłania oba widoki, zamiast otwierać się obok nich:
 * szczegóły są tym, po co obsługa przyszła, i mają dostać cały ekran. Pamiętamy
 * jej **identyfikator**, a nie ją samą: odświeżenie ma zmienić także ten ekran,
 * a zapamiętany obiekt zostałby na nim taki, jaki był o poranku.
 */
function Rezerwacje({ client, sesja }: { client: PanelClient; sesja: Sesja }) {
  const [stan, setStan] = useState<Stan>({ faza: 'wczytywanie' })
  const [dzien, setDzien] = useState<CalendarDay | null>(null)
  const [filtr, setFiltr] = useState<BookingFilter>({ day: null, laneId: null })
  const [wybraneId, setWybraneId] = useState<string | null>(null)
  /**
   * Licznik wymuszonych odczytów. Odwołanie Rezerwacji zmienia to, co Panel
   * właśnie pokazuje, a czekanie do najbliższego tiku zostawiłoby na ekranie
   * Rezerwację potwierdzoną razem z formularzem, którym się ją odwołuje.
   *
   * Licznikiem, a nie funkcją wyniesioną z efektu: droga do danych zostaje
   * jedna, razem ze strażą nad odpowiedzią, która przyszła po zmianie ekranu
   * (`aktualne`). Ubocznie odsuwa to najbliższy tik o pełną minutę — i tak ma
   * być, bo minuta liczy się od ostatniego odczytu.
   */
  const [odswiezenia, setOdswiezenia] = useState(0)

  useEffect(() => {
    let aktualne = true

    const odczyt = () =>
      wczytajDane(client, new Date())
        .then((dane) => {
          if (!aktualne) return
          setStan({ faza: 'gotowe', dane })
          // Kalendarz wstaje na dniu Strzelnicy, a nie na dniu przeglądarki:
          // obsługa patrzy na zegar obiektu, a Panel bywa otwarty gdzie indziej.
          setDzien((dotad) => dotad ?? dayIn(dane.facility.timeZone, new Date()))
        })
        .catch((powod: unknown) => {
          // Nieudane **odświeżenie** nie zdejmuje z ekranu tego, co już na nim
          // stoi: dane sprzed minuty są bliższe prawdy niż komunikat o błędzie.
          // Pierwszy odczyt jest inny — po nim nie ma czego zostawić.
          if (aktualne) {
            setStan((dotad) =>
              dotad.faza === 'gotowe' ? dotad : { faza: 'blad', powod: komunikatBledu(powod) },
            )
          }
          console.error(powod)
        })

    void odczyt()
    const tik = setInterval(() => void odczyt(), ODSWIEZANIE_MS)

    return () => {
      aktualne = false
      clearInterval(tik)
    }
  }, [client, odswiezenia])

  const wyjscie = useCallback(() => {
    wyloguj(client).catch((powod: unknown) => console.error(powod))
  }, [client])

  const odswiez = useCallback(() => setOdswiezenia((ile) => ile + 1), [])

  if (stan.faza === 'wczytywanie') return <p className="komunikat">{teksty.wczytywanie}</p>
  if (stan.faza === 'blad') {
    return (
      <>
        <Komunikat powod={stan.powod} />
        <button type="button" className="przycisk" onClick={wyjscie}>
          {teksty.sesja.wyloguj}
        </button>
      </>
    )
  }

  const { dane } = stan
  // Rezerwacja odszukiwana w świeżych danych, a nie pamiętana z chwili
  // kliknięcia. Anulowana w międzyczasie — choćby przez klienta jego własnym
  // linkiem — znika z okna i ekran wraca do listy zamiast pokazywać nieprawdę.
  const wybrana = dane.bookings.find((wpis) => wpis.id === wybraneId) ?? null

  return (
    <>
      <header className="naglowek">
        <div>
          <strong>{dane.facility.name}</strong>
          {sesja.email && <span className="naglowek__konto">{sesja.email}</span>}
        </div>
        <button type="button" className="przycisk" onClick={wyjscie}>
          {teksty.sesja.wyloguj}
        </button>
      </header>

      {wybrana ? (
        <Szczegoly
          client={client}
          wpis={wybrana}
          onWroc={() => setWybraneId(null)}
          onOdswiez={odswiez}
        />
      ) : (
        <>
          <Kalendarz
            day={dzien ?? dayIn(dane.facility.timeZone, new Date())}
            lanes={dane.lanes}
            bookings={dane.bookings}
            okno={dane.okno}
            timeZone={dane.facility.timeZone}
            onDzien={setDzien}
            onWybierz={(wpis) => setWybraneId(wpis.id)}
          />
          <Lista
            bookings={dane.bookings}
            lanes={dane.lanes}
            okno={dane.okno}
            filtr={filtr}
            onFiltr={setFiltr}
            onWybierz={(wpis) => setWybraneId(wpis.id)}
          />
        </>
      )}
    </>
  )
}

type Polaczenie = { client: PanelClient } | { powod: string }

function srodowisko(): Environment {
  return import.meta.env as unknown as Environment
}

/**
 * Klient albo powód, dla którego go nie ma. Liczony raz i zapamiętany: od
 * klienta zależy nasłuch sesji, więc nowy przy każdym renderze wpadałby
 * w pętlę. Jedyności samego klienta pilnuje `panelClient`, nie ten `useMemo` —
 * tryb ścisły Reacta i tak woła go dwa razy.
 */
function usePolaczenie(): Polaczenie {
  return useMemo<Polaczenie>(() => {
    try {
      return { client: panelClient(readSupabaseConfig(srodowisko())) }
    } catch (powod: unknown) {
      return { powod: komunikatBledu(powod) }
    }
  }, [])
}

/**
 * Kto patrzy — i tylko od tego zależy, co widać. Osoba niezalogowana dostaje
 * formularz i nic poza nim; danych Strzelnicy nie ma tu nawet czym pobrać, bo
 * bez tokenu RLS nie wypuszcza z bazy ani jednego wiersza.
 */
export function App() {
  const polaczenie = usePolaczenie()
  const client = 'client' in polaczenie ? polaczenie.client : null
  const [sesja, setSesja] = useState<Sesja | null>(null)
  const [sprawdzona, setSprawdzona] = useState(false)

  useEffect(() => {
    if (!client) return
    return obserwujSesje(client, (nowa) => {
      setSesja(nowa)
      setSprawdzona(true)
    })
  }, [client])

  return (
    <main className="panel">
      <h1>{teksty.tytul}</h1>
      {!client ? (
        <Komunikat powod={'powod' in polaczenie ? polaczenie.powod : teksty.bladWczytywania} />
      ) : !sprawdzona ? (
        // Sesja bywa zapamiętana, więc do pierwszej odpowiedzi Supabase nie
        // wiemy jeszcze, czy ktoś jest zalogowany. Formularz mignięty w tym
        // czasie wyglądałby na wylogowanie.
        <p className="komunikat">{teksty.wczytywanie}</p>
      ) : sesja ? (
        <Rezerwacje client={client} sesja={sesja} />
      ) : (
        <Logowanie client={client} />
      )}
    </main>
  )
}
