import type {
  ClosureProblem,
  Lane,
  LaneClosure,
  PanelBooking,
} from '@strzelnica/shared'
import { closureProblems, localMomentToInstant, panelOccupancy } from '@strzelnica/shared'
import { useCallback, useState } from 'react'
import { zablokujOs } from './blokowanie.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'

/** Identyfikator listy wyboru Osi; wiąże ją z jej etykietą. */
const POLE_OSI = 'blokada-os'

/**
 * Wyłączenie Osi ze sprzedaży na wskazany czas — jedyny ekran, którym Blokada
 * powstaje. Zakres jest dowolny i pola są tu po to, żeby to powiedzieć: dwie
 * chwile wpisywane wprost, a nie Blok wybierany z rozkładu. Blokada bywa
 * krótsza od Slotu (kwadrans na wymianę tarczy) i dłuższa od doby (zawody na
 * weekend), i wolno jej wyjść za horyzont rezerwacji — zawody bywają
 * zaplanowane wcześniej, niż Strzelnica przyjmuje Rezerwacje. Kalendarz wyżej
 * pokaże ją, gdy wejdzie w jego okno; zapisana jest od razu.
 *
 * Chwile czytamy zegarem **Strzelnicy**, a nie przeglądarki: pole
 * `datetime-local` podaje ścianę zegara bez strefy, a obsługa wpisuje w nim
 * godzinę obiektu — Panel bywa otwarty gdzie indziej niż on.
 *
 * Pytania o pewność nie ma, inaczej niż przy odwołaniu Rezerwacji: Blokada nie
 * wysyła listu i nie zabiera nikomu terminu, bo na termin czyjś nie wchodzi
 * wcale. Odmowę na taki termin pokazujemy wprost — razem ze zdaniem, co z nią
 * zrobić.
 */
export function Blokada({
  client,
  lanes,
  bookings,
  closures,
  timeZone,
  onZablokowano,
}: {
  client: PanelClient
  /** Osie Strzelnicy — pierwsza z nich stoi w polu od początku. */
  lanes: readonly Lane[]
  /** Rezerwacje i Blokady okna: z nich liczy się zajętość dla sprawdzenia. */
  bookings: readonly PanelBooking[]
  closures: readonly LaneClosure[]
  /** Strefa Strzelnicy: jej zegarem czyta się wpisane chwile. */
  timeZone: string
  /** Blokada weszła — ekran wyżej czyta dane od nowa. */
  onZablokowano: () => void
}) {
  const [laneId, setLaneId] = useState(lanes[0]?.id ?? '')
  const [od, setOd] = useState('')
  const [doKiedy, setDoKiedy] = useState('')
  const [powod, setPowod] = useState('')
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly ClosureProblem[]>([])
  const [udane, setUdane] = useState(false)
  const [blad, setBlad] = useState(false)

  const zablokuj = useCallback(() => {
    // Chwile czytane zegarem Strzelnicy — pole podaje ścianę zegara bez strefy.
    const startsAt = localMomentToInstant(od, timeZone)
    const endsAt = localMomentToInstant(doKiedy, timeZone)
    // Zastrzeżenia liczone tą samą czystą funkcją, którą serwer sprawdza je po
    // raz drugi — razem z zajętością złożoną z tego, co Panel ma pod ręką.
    // Rozstrzyga i tak zapis: między wczytaniem ekranu a kliknięciem klient
    // bywa szybszy, a Panel odświeża się raz na minutę.
    const problemy = closureProblems({
      draft: { laneId, startsAt, endsAt, reason: powod },
      occupancies: panelOccupancy({ bookings, closures }),
    })
    // Warunek na chwile powtarza to, co `closureProblems` właśnie orzekło —
    // bez niego kontrola typów nie wie, że dalej zakres na pewno jest. Tak samo
    // jak warunek na Blok w `zloz-rezerwacje`.
    if (problemy.length > 0 || !startsAt || !endsAt) {
      setZastrzezenia(problemy.length > 0 ? problemy : ['zly-zakres'])
      setUdane(false)
      return
    }

    setWysylanie(true)
    setBlad(false)
    setZastrzezenia([])
    setUdane(false)

    zablokujOs(client, { laneId, startsAt, endsAt, reason: powod })
      .then((wynik) => {
        // Odmowa serwera jest jednym zastrzeżeniem, bo baza odmawia z jednego
        // powodu naraz: tym, który zobaczyła pierwszy.
        setZastrzezenia(wynik.ok ? [] : [wynik.problem])
        setUdane(wynik.ok)
        if (!wynik.ok) return
        // Pola wracają do pustych wyłącznie po Blokadzie, która weszła:
        // wyczyszczone po odmowie kazałyby wpisywać wszystko od nowa, żeby
        // poprawić jedną rzecz.
        setOd('')
        setDoKiedy('')
        setPowod('')
        onZablokowano()
      })
      .catch((przyczyna: unknown) => {
        // Żądanie, które nie doszło, nie zmienia ekranu — bez tego zdania
        // kliknięcie wyglądałoby na zignorowane.
        console.error(przyczyna)
        setBlad(true)
      })
      .finally(() => setWysylanie(false))
  }, [bookings, client, closures, doKiedy, laneId, od, onZablokowano, powod, timeZone])

  return (
    <section className="blokada">
      <h2>{teksty.blokada.naglowek}</h2>
      <p className="komunikat">{teksty.blokada.wstep}</p>

      <div className="filtry">
        {/* Etykieta wskazuje pole przez `for`, a nie obejmuje go sobą: etykieta
            obejmująca listę wyboru bierze nazwę z całej swojej treści — razem
            z nazwami wszystkich Osi. */}
        <div className="pole">
          <label htmlFor={POLE_OSI}>{teksty.blokada.os}</label>
          <select
            id={POLE_OSI}
            value={laneId}
            onChange={(zdarzenie) => setLaneId(zdarzenie.target.value)}
          >
            {lanes.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.name}
              </option>
            ))}
          </select>
        </div>

        {/* Bez granic z okna odczytu, inaczej niż pola filtrów: tam okno jest
            granicą pytania, a tu byłoby granicą **zapisu** — a Blokada obejmuje
            dowolny zakres czasu, także dalszy niż horyzont Strzelnicy. */}
        <label className="pole">
          <span>{teksty.blokada.od}</span>
          <input
            type="datetime-local"
            value={od}
            onChange={(zdarzenie) => setOd(zdarzenie.target.value)}
          />
        </label>

        <label className="pole">
          <span>{teksty.blokada.do}</span>
          <input
            type="datetime-local"
            value={doKiedy}
            onChange={(zdarzenie) => setDoKiedy(zdarzenie.target.value)}
          />
        </label>
      </div>

      <label className="pole">
        <span>{teksty.blokada.powod}</span>
        <textarea
          rows={2}
          value={powod}
          placeholder={teksty.blokada.podpowiedz}
          onChange={(zdarzenie) => setPowod(zdarzenie.target.value)}
        />
      </label>

      {/* Wszystkie zastrzeżenia naraz, w kolejności czytania formularza — tak
          samo jak przy zgłoszeniu Rezerwacji: obsługa ma zobaczyć całą listę
          poprawek za jednym razem, a nie odkrywać je po jednym na kliknięcie. */}
      {zastrzezenia.map((problem) => (
        <p key={problem} className="komunikat komunikat--blad" role="alert">
          {teksty.blokada.problem[problem]}
        </p>
      ))}
      {udane && (
        <p className="komunikat" role="status">
          {teksty.blokada.zablokowano}
        </p>
      )}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.blokada.blad}
        </p>
      )}

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={zablokuj} disabled={wysylanie}>
          {wysylanie ? teksty.blokada.blokowanie : teksty.blokada.zablokuj}
        </button>
      </div>
    </section>
  )
}
