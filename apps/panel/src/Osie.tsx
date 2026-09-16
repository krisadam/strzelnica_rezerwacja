import type { Lane, LaneDraft, LaneProblem } from '@strzelnica/shared'
import { laneProblems, MAX_LANE_CAPACITY, parseAmount, writeAmount } from '@strzelnica/shared'
import { useCallback, useId, useState } from 'react'
import { zapiszOs } from './konfiguracja.js'
import { czytajLiczbe, PoleKwoty, PoleLiczby } from './Pola.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'

/**
 * Jedna Oś do opisania: nazwa, pojemność, stawka za Blok i to, czy jest w ofercie. Ten sam
 * formularz dodaje Oś i poprawia istniejącą, bo wypełnia się w obu przypadkach
 * dokładnie te same pola — różnicą jest wyłącznie to, czy Oś już jest.
 *
 * Pól nie odświeżamy z danych przychodzących co minutę: obsługa bywa w połowie
 * wpisywania nazwy, a odczyt z bazy podmieniłby jej literę w trakcie. Cudza
 * zmiana wygra i tak przy zapisie — o nazwie rozstrzyga ograniczenie
 * w schemacie, nie ten ekran.
 *
 * Kasowania Osi tu nie ma i nie będzie (ADR 0013): Oś skasowana zabrałaby ze
 * sobą Rezerwacje, które na niej stoją, a te znikają wyłącznie odwołaniem —
 * z powodem wysłanym klientowi. Wyłączenie robi to, po co sięga się po
 * kasowanie: zdejmuje Oś ze sprzedaży, zostawiając jej przeszłość.
 */
function FormularzOsi({
  client,
  lane,
  lanes,
  onZapisano,
}: {
  client: PanelClient
  /** Oś do poprawienia albo `null` — wtedy formularz zakłada nową. */
  lane: Lane | null
  /** Wszystkie Osie Strzelnicy; po nie sięga wyłącznie sprawdzenie nazwy. */
  lanes: readonly Lane[]
  /** Oś zapisana — ekran wyżej czyta dane od nowa. */
  onZapisano: () => void
}) {
  const polaId = useId()
  const [nazwa, setNazwa] = useState(lane?.name ?? '')
  const [pojemnosc, setPojemnosc] = useState(String(lane?.capacity ?? 1))
  // Stawka trzymana tak, jak stoi w polu — w złotych. Na grosze przelicza ją
  // `parseAmount`, ta sama para funkcji, co przy cenach katalogu: pole pyta
  // o złote, bo w złotych czyta się cennik, a baza trzyma grosze.
  const [stawka, setStawka] = useState(writeAmount(lane?.blockRate ?? 0))
  const [czynna, setCzynna] = useState(lane?.active ?? true)
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly LaneProblem[]>([])
  const [udane, setUdane] = useState(false)
  const [blad, setBlad] = useState(false)

  // Stawka z pola albo `null`, gdy to, co w nim stoi, ceną nie jest. Osąd
  // należy do `parseAmount`, a nie do tego ekranu: pole cenowe jest jedno,
  // a złote na grosze przelicza się w jednym miejscu.
  const stawkaGr = parseAmount(stawka)

  const zapisz = useCallback(() => {
    const draft: LaneDraft = {
      id: lane?.id ?? null,
      name: nazwa,
      capacity: czytajLiczbe(pojemnosc),
      // Stawka nie do odczytania jedzie do zastrzeżeń jako nie-liczba, zamiast
      // zamieniać się po cichu w zero: zero jest stawką, a nie brakiem stawki.
      blockRate: stawkaGr ?? Number.NaN,
      active: czynna,
    }
    // Zastrzeżenia liczone tą samą czystą funkcją, którą serwer sprawdza je po
    // raz drugi. Rozstrzyga i tak zapis: nazwę zajętą w międzyczasie widzi
    // dopiero ograniczenie w schemacie.
    const problemy = laneProblems({ draft, lanes })
    if (problemy.length > 0) {
      setZastrzezenia(problemy)
      setUdane(false)
      return
    }

    setWysylanie(true)
    setBlad(false)
    setZastrzezenia([])
    setUdane(false)

    zapiszOs(client, draft)
      .then((wynik) => {
        setZastrzezenia(wynik.ok ? [] : [wynik.problem])
        setUdane(wynik.ok)
        if (!wynik.ok) return
        // Pola wracają do pustych wyłącznie w formularzu nowej Osi: przy Osi
        // istniejącej opisują dalej ją samą, więc czyszczenie zostawiłoby na
        // ekranie pustą ramkę zamiast tego, co właśnie zapisano.
        if (!lane) {
          setNazwa('')
          setPojemnosc('1')
          setStawka(writeAmount(0))
          setCzynna(true)
        }
        onZapisano()
      })
      .catch((przyczyna: unknown) => {
        console.error(przyczyna)
        setBlad(true)
      })
      .finally(() => setWysylanie(false))
  }, [client, czynna, lane, lanes, nazwa, onZapisano, pojemnosc, stawkaGr])

  return (
    <div className="os-konfiguracja">
      <h3>
        {lane ? lane.name : teksty.osie.nowa}
        {lane && !lane.active && (
          <span className="os-konfiguracja__znacznik"> — {teksty.osie.wylaczona}</span>
        )}
      </h3>
      {!lane && <p className="komunikat">{teksty.osie.wstepNowej}</p>}

      <div className="filtry">
        <label className="pole">
          <span>{teksty.osie.nazwa}</span>
          <input
            type="text"
            value={nazwa}
            onChange={(zdarzenie) => setNazwa(zdarzenie.target.value)}
          />
        </label>

        <PoleLiczby
          etykieta={teksty.osie.pojemnosc}
          opis={teksty.osie.pojemnoscOpis}
          max={MAX_LANE_CAPACITY}
          wartosc={pojemnosc}
          onZmien={setPojemnosc}
        />

        <PoleKwoty
          etykieta={teksty.osie.stawka}
          opis={teksty.osie.stawkaOpis}
          podglad={teksty.osie.stawkaPodglad}
          wartosc={stawka}
          onZmien={setStawka}
        />
      </div>

      {/* Pole zaznaczane czyta się w poprzek: kwadracik i zdanie obok niego są
          jedną rzeczą. Etykieta wskazuje pole przez `for`, bo obejmująca je
          sobą brałaby nazwę z całej swojej treści. */}
      <div className="pole pole--zaznaczane">
        <input
          id={`${polaId}-czynna`}
          type="checkbox"
          checked={czynna}
          onChange={(zdarzenie) => setCzynna(zdarzenie.target.checked)}
        />
        <label htmlFor={`${polaId}-czynna`}>{teksty.osie.czynna}</label>
      </div>

      {zastrzezenia.map((problem) => (
        <p key={problem} className="komunikat komunikat--blad" role="alert">
          {teksty.osie.problem[problem]}
        </p>
      ))}
      {udane && (
        <p className="komunikat" role="status">
          {lane ? teksty.osie.zapisano : teksty.osie.dodano}
        </p>
      )}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.osie.blad}
        </p>
      )}

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={zapisz} disabled={wysylanie}>
          {lane
            ? wysylanie
              ? teksty.osie.zapisywanie
              : teksty.osie.zapisz
            : wysylanie
              ? teksty.osie.dodawanie
              : teksty.osie.dodaj}
        </button>
      </div>
    </div>
  )
}

/**
 * Osie Strzelnicy — czym dysponuje i ile osób wolno na tym postawić. Jedyny
 * ekran Panelu, którego treść nie zmienia się od tego, co przyniesie poranek:
 * stoi więc pod tym wszystkim, co mówi o dniu dzisiejszym.
 *
 * Osie wyłączone stoją tu razem z czynnymi, a nie osobno: obsługa szuka Osi po
 * nazwie, a nie po tym, czy akurat jest w sprzedaży — a druga lista kazałaby
 * jej zgadywać, w której szukać. Znacznik przy nazwie mówi resztę.
 */
export function Osie({
  client,
  lanes,
  onZapisano,
}: {
  client: PanelClient
  lanes: readonly Lane[]
  onZapisano: () => void
}) {
  return (
    <section className="konfiguracja">
      <h2>{teksty.osie.naglowek}</h2>
      <p className="komunikat">{teksty.osie.wstep}</p>

      {lanes.map((lane) => (
        <FormularzOsi
          key={lane.id}
          client={client}
          lane={lane}
          lanes={lanes}
          onZapisano={onZapisano}
        />
      ))}

      <FormularzOsi client={client} lane={null} lanes={lanes} onZapisano={onZapisano} />
    </section>
  )
}
