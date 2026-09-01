import type { Block, BookingProblem, Lane, Occupancy, SupabaseConfig } from '@strzelnica/shared'
import { dayIn } from '@strzelnica/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Formularz } from './Formularz.js'
import type { Grafik } from './grafik.js'
import { loadZajetosc } from './grafik.js'
import { Kalendarz } from './Kalendarz.js'
import type { Krok, Wybor } from './krok.js'
import { PUSTY_DRAFT } from './krok.js'
import { Podsumowanie } from './Podsumowanie.js'
import { Potwierdzenie } from './Potwierdzenie.js'
import type { StrzelnicaClient } from './supabase.js'
import { teksty } from './teksty.js'
import { zlozRezerwacje } from './zapis.js'

/**
 * Przebieg rezerwacji: kalendarz → formularz → podsumowanie → potwierdzenie.
 * Stan mieszka tutaj w całości, bo każdy krok potrzebuje tego samego wyboru
 * i tego samego zgłoszenia — a Osoba rezerwująca, która cofnie się o krok, ma
 * zastać to, co wpisała.
 *
 * Zajętość Osi jest jedyną częścią grafiku zmieniającą się w trakcie: po
 * każdym zapisie i po każdym przegranym wyścigu o Blok pobieramy ją na nowo,
 * żeby kalendarz nie proponował terminu, którego już nie ma.
 */
export function Rezerwacja({
  client,
  config,
  slug,
  grafik,
  now,
  onZmianaWidoku,
}: {
  client: StrzelnicaClient
  config: SupabaseConfig
  /** Identyfikator Strzelnicy z adresu ramki; tym samym adresuje się zapis. */
  slug: string
  grafik: Grafik
  now: Date
  onZmianaWidoku: () => void
}) {
  const { facility, lanes } = grafik

  const [occupancies, setOccupancies] = useState<readonly Occupancy[]>([])
  const [lane, setLane] = useState<Lane | undefined>(lanes[0])
  const [day, setDay] = useState(() => dayIn(facility.timeZone, now))
  const [krok, setKrok] = useState<Krok>({ nazwa: 'kalendarz' })
  const [draft, setDraft] = useState(PUSTY_DRAFT)
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenie, setZastrzezenie] = useState<BookingProblem | null>(null)
  const [bladZapisu, setBladZapisu] = useState<string | null>(null)
  const [bladZajetosci, setBladZajetosci] = useState<string | null>(null)

  const pobierzZajetosc = useCallback(
    () => loadZajetosc(client, facility.id, new Date()),
    [client, facility.id],
  )

  // Zajętość odświeża się razem z „teraz", nie tylko przy wejściu: termin
  // zajęty przez kogoś innego ma zgasnąć także w kalendarzu otwartym od
  // godziny. Bez tego „natychmiast przestaje być wolny" byłoby prawdą
  // wyłącznie po stronie serwera.
  useEffect(() => {
    let aktualne = true
    pobierzZajetosc()
      .then((zajetosc) => {
        if (!aktualne) return
        setOccupancies(zajetosc)
        setBladZajetosci(null)
      })
      // Kalendarz bez zajętości pokazywałby zajęte terminy jako wolne. Lepiej
      // powiedzieć, że grafiku nie ma, niż zaprosić na termin, który przepadł.
      .catch((powod: unknown) => {
        console.error(powod)
        if (aktualne) setBladZajetosci(teksty.bladWczytywania)
      })
    return () => {
      aktualne = false
    }
  }, [pobierzZajetosc, now])

  // Widok to krok, wybrana Oś i wybrany dzień. Zgłaszamy jego zmianę w jednym
  // miejscu, a nie w każdym przycisku z osobna — kolejny sposób na zmianę
  // widoku nie może wtedy zapomnieć o zgłoszeniu. Pierwsze wejście zmianą nie jest.
  const pierwszyWidok = useRef(true)
  useEffect(() => {
    if (pierwszyWidok.current) {
      pierwszyWidok.current = false
      return
    }
    onZmianaWidoku()
  }, [krok.nazwa, day, lane, onZmianaWidoku])

  const doKalendarza = (powrot?: BookingProblem) => {
    setZastrzezenie(null)
    setBladZapisu(null)
    setKrok({ nazwa: 'kalendarz', ...(powrot ? { powrot } : {}) })
  }

  const wybierz = (block: Block) => {
    if (!lane) return
    setZastrzezenie(null)
    setBladZapisu(null)
    setKrok({ nazwa: 'formularz', wybor: { lane, day, block } })
  }

  async function wyslij(wybor: Wybor) {
    setWysylanie(true)
    setZastrzezenie(null)
    setBladZapisu(null)
    try {
      const wynik = await zlozRezerwacje(config, {
        facilitySlug: slug,
        laneId: wybor.lane.id,
        day: wybor.day,
        startMinute: wybor.block.startMinute,
        ...draft,
      })

      setOccupancies(await pobierzZajetosc())

      if (wynik.ok) {
        setKrok({ nazwa: 'potwierdzenie', wybor, draft, id: wynik.id })
      } else if (wynik.problem === 'termin-niedostepny') {
        // Jedyne zastrzeżenie, którego na podsumowaniu nie da się naprawić —
        // wraca się po nie do kalendarza, już bez tego Bloku.
        doKalendarza(wynik.problem)
      } else {
        setZastrzezenie(wynik.problem)
      }
    } catch (powod: unknown) {
      console.error(powod)
      setBladZapisu(teksty.bladZapisu)
    } finally {
      setWysylanie(false)
    }
  }

  if (!lane) return <p className="komunikat">{teksty.brakOsi}</p>

  if (krok.nazwa === 'formularz') {
    return (
      <Formularz
        wybor={krok.wybor}
        timeZone={facility.timeZone}
        draft={draft}
        onDraft={setDraft}
        onDalej={() => setKrok({ nazwa: 'podsumowanie', wybor: krok.wybor })}
        onZmienTermin={() => doKalendarza()}
      />
    )
  }

  if (krok.nazwa === 'podsumowanie') {
    return (
      <Podsumowanie
        wybor={krok.wybor}
        timeZone={facility.timeZone}
        draft={draft}
        wysylanie={wysylanie}
        zastrzezenie={zastrzezenie}
        blad={bladZapisu}
        onPopraw={() => setKrok({ nazwa: 'formularz', wybor: krok.wybor })}
        onWyslij={() => void wyslij(krok.wybor)}
      />
    )
  }

  if (krok.nazwa === 'potwierdzenie') {
    return (
      <Potwierdzenie
        wybor={krok.wybor}
        timeZone={facility.timeZone}
        draft={krok.draft}
        id={krok.id}
        onWroc={() => {
          setDraft(PUSTY_DRAFT)
          doKalendarza()
        }}
      />
    )
  }

  const komunikatKalendarza = krok.powrot ? teksty.zastrzezenie[krok.powrot] : bladZajetosci

  return (
    <>
      {komunikatKalendarza && (
        <p className="komunikat komunikat--blad" role="alert">
          {komunikatKalendarza}
        </p>
      )}
      <Kalendarz
        grafik={grafik}
        occupancies={occupancies}
        now={now}
        lane={lane}
        day={day}
        onLane={setLane}
        onDay={setDay}
        onWybierz={wybierz}
      />
    </>
  )
}
