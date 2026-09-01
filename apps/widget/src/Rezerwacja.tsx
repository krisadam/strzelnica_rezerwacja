import type {
  Block,
  BookingDraft,
  BookingProblem,
  Intent,
  Lane,
  SupabaseConfig,
} from '@strzelnica/shared'
import { dayIn, priceBooking, ratesFor } from '@strzelnica/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Formularz } from './Formularz.js'
import type { Grafik } from './grafik.js'
import { grafikDnia, loadZajetosc, PUSTA_ZAJETOSC } from './grafik.js'
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
 *
 * Wybrany Blok nie jest zapamiętywany takim, jakim był w chwili kliknięcia:
 * jego dostępność zależy od deklaracji, a te wolno zmienić jeszcze
 * w formularzu. Wybór niesie więc, który to Blok, a o to, czy wciąż jest wolny,
 * pyta się grafiku przy każdym renderze.
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

  const [zajetosc, setZajetosc] = useState(PUSTA_ZAJETOSC)
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
      .then((swieza) => {
        if (!aktualne) return
        setZajetosc(swieza)
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

  /**
   * Wybrany termin w kształcie, jaki ma teraz — po ewentualnej zmianie
   * deklaracji i po odświeżeniu zajętości. Zniknięcie z grafiku (dzień zamknięty
   * wyjątkiem, Blok zdjęty z rozkładu) zostawia sam wybór, już niedostępny:
   * `bookingProblems` odpowie wtedy tak samo, jak na termin, którego rozkład
   * Osi nie zna.
   */
  const odswiezony = (wybor: Wybor): Wybor => {
    const dzien = grafikDnia(grafik, zajetosc, draft, wybor.lane, wybor.day, now)
    const block = dzien.blocks.find((kandydat) => kandydat.scheduleId === wybor.block.scheduleId)
    return { ...wybor, block: block ?? { ...wybor.block, available: false } }
  }

  /**
   * Kwota do zapłaty dla wskazanego terminu i tego, co stoi w zgłoszeniu.
   * Liczona tutaj, a nie w każdym kroku z osobna: formularz i podsumowanie
   * pokazują jedną Kwotę, więc mają ją dostać z jednego wyliczenia. Stawka za
   * Blok należy do Osi, a Oś przychodzi z wyborem — stąd wybór na wejściu,
   * tak samo jak w `odswiezony`.
   *
   * Przelicza się przy każdym renderze, więc nadąża za każdą zmianą
   * formularza sama: zgłoszenie jest stanem tego komponentu.
   */
  const kwotaDla = (wybor: Wybor) =>
    priceBooking({
      rates: ratesFor(facility, wybor.lane),
      draft,
      weaponTypes: grafik.weaponTypes,
      ammunitionKinds: grafik.ammunitionKinds,
    }).amount

  const wybierz = (block: Block) => {
    if (!lane) return
    setZastrzezenie(null)
    setBladZapisu(null)
    setKrok({ nazwa: 'formularz', wybor: { lane, day, block } })
  }

  /**
   * Każda zmiana zgłoszenia zdejmuje zastrzeżenie zgłoszone przez serwer:
   * deklaracje i zamawiany sprzęt zmieniają dostępność, a liczba Uczestników
   * i kontakt — osąd o samym formularzu. Zastrzeżenie sprzed zmiany przestaje
   * więc opisywać cokolwiek. Jedno miejsce, a nie jedno pole po drugim: pole
   * dopisane do formularza nie ma jak o tym zapomnieć.
   */
  const zmienZgloszenie = (zgloszenie: BookingDraft) => {
    setZastrzezenie(null)
    setDraft(zgloszenie)
  }

  const zmienDeklaracje = (intent: Intent) => zmienZgloszenie({ ...draft, ...intent })

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

      setZajetosc(await pobierzZajetosc())

      if (wynik.ok) {
        setKrok({ nazwa: 'potwierdzenie', wybor, draft, id: wynik.id, amount: wynik.amount })
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
        wybor={odswiezony(krok.wybor)}
        timeZone={facility.timeZone}
        kwota={kwotaDla(krok.wybor)}
        weaponTypes={grafik.weaponTypes}
        weaponOccupancies={zajetosc.weapons}
        ammunitionKinds={grafik.ammunitionKinds}
        draft={draft}
        onDraft={zmienZgloszenie}
        onDalej={() => setKrok({ nazwa: 'podsumowanie', wybor: krok.wybor })}
        onZmienTermin={() => doKalendarza()}
      />
    )
  }

  if (krok.nazwa === 'podsumowanie') {
    return (
      <Podsumowanie
        wybor={odswiezony(krok.wybor)}
        timeZone={facility.timeZone}
        kwota={kwotaDla(krok.wybor)}
        weaponTypes={grafik.weaponTypes}
        ammunitionKinds={grafik.ammunitionKinds}
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
        weaponTypes={grafik.weaponTypes}
        ammunitionKinds={grafik.ammunitionKinds}
        draft={krok.draft}
        id={krok.id}
        amount={krok.amount}
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
        zajetosc={zajetosc}
        now={now}
        lane={lane}
        day={day}
        intent={draft}
        onLane={setLane}
        onDay={setDay}
        onIntent={zmienDeklaracje}
        onWybierz={wybierz}
      />
    </>
  )
}
