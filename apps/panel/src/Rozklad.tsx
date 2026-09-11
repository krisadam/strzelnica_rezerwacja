import type { BlockSchedule, Lane, ScheduleBlock, ScheduleProblem, Weekday } from '@strzelnica/shared'
import {
  copyDay,
  formatScheduleMinute,
  laneWeek,
  MINUTES_IN_DAY,
  sameWeek,
  scheduleProblems,
  SLOT_MINUTES,
  WEEKDAYS,
} from '@strzelnica/shared'
import { useCallback, useId, useState } from 'react'
import { ustawRozklad } from './konfiguracja.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'

/** Identyfikatory pól wybieranych raz na cały ekran. */
const POLE_OSI = 'rozklad-os'
const POLE_ZRODLOWY_DZIEN = 'rozklad-zrodlowy-dzien'
const POLE_ZRODLOWA_OS = 'rozklad-zrodlowa-os'

/**
 * Wszystkie początki na siatce Slotów — od północy do ostatniej połowy godziny.
 * Liczone z dwóch stałych `packages/shared`, a nie z liczb wpisanych tutaj:
 * lista rozjechana z siatką oferowałaby godziny, które zastrzeżenie zaraz
 * odrzuci.
 */
const POCZATKI = Array.from(
  { length: MINUTES_IN_DAY / SLOT_MINUTES },
  (_, i) => i * SLOT_MINUTES,
)

/** Godziny, na których nowy Blok wstaje w polach: rytm typowego strzelania. */
const DOMYSLNY_POCZATEK = 600
const DOMYSLNA_DLUGOSC = 120

/** Blok wraz z miejscem w tygodniu — po nim, a nie po godzinie, poznaje się go przy kasowaniu. */
type Pozycja = { block: ScheduleBlock; index: number }

/** Oś w poprawianiu razem ze swoim tygodniem; jedno bez drugiego nic nie znaczy. */
type Wybor = { laneId: string; week: readonly ScheduleBlock[] }

/**
 * Zakres Bloku jednym napisem. Koniec wychodzący za dobę mówi o tym wprost:
 * „23:00–01:00" bez słowa o jutrze czytałoby się jak Blok trwający wstecz.
 */
function zakresBloku(block: ScheduleBlock): string {
  const koniec = block.startMinute + block.durationMinutes
  return teksty.rozklad.zakres(
    formatScheduleMinute(block.startMinute),
    formatScheduleMinute(koniec),
    koniec >= MINUTES_IN_DAY,
  )
}

/**
 * Jeden dzień tygodnia w rozkładzie Osi: Bloki, które w nim stoją, i pola,
 * którymi dokłada się następny. Pola nowego Bloku trzyma sam dzień, a nie ekran
 * nad nim — siedem par pól w jednym stanie wyżej znaczyłoby, że wpisanie
 * godziny w poniedziałek zmienia to, co widać przy sobocie.
 */
function Dzien({
  weekday,
  pozycje,
  onDodaj,
  onUsun,
}: {
  weekday: Weekday
  /** Bloki tego dnia, w porządku godzin. */
  pozycje: readonly Pozycja[]
  onDodaj: (block: ScheduleBlock) => void
  onUsun: (index: number) => void
}) {
  const polaId = useId()
  const [poczatek, setPoczatek] = useState(DOMYSLNY_POCZATEK)
  const [dlugosc, setDlugosc] = useState(DOMYSLNA_DLUGOSC)

  return (
    <section className="rozklad__dzien" aria-labelledby={`${polaId}-naglowek`}>
      <h3 id={`${polaId}-naglowek`}>{teksty.rozklad.dzien[weekday]}</h3>

      {pozycje.length === 0 ? (
        <p className="komunikat">{teksty.rozklad.pustyDzien}</p>
      ) : (
        <ul className="rozklad__bloki">
          {pozycje.map(({ block, index }) => (
            <li key={index}>
              <span className="rozklad__zakres">{zakresBloku(block)}</span>
              <button
                type="button"
                className="przycisk"
                aria-label={teksty.rozklad.usunOpis(zakresBloku(block))}
                onClick={() => onUsun(index)}
              >
                {teksty.rozklad.usun}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="filtry">
        {/* Etykieta wskazuje listę wyboru przez `for`, a nie obejmuje jej sobą:
            obejmująca brałaby nazwę z całej swojej treści — razem z czterdziestoma
            ośmioma godzinami. */}
        <div className="pole">
          <label htmlFor={`${polaId}-poczatek`}>{teksty.rozklad.poczatek}</label>
          <select
            id={`${polaId}-poczatek`}
            value={poczatek}
            onChange={(zdarzenie) => setPoczatek(Number(zdarzenie.target.value))}
          >
            {POCZATKI.map((minuta) => (
              <option key={minuta} value={minuta}>
                {formatScheduleMinute(minuta)}
              </option>
            ))}
          </select>
        </div>

        {/* Długość polem liczbowym, a nie listą: Blok wolno przeciągnąć przez
            całą dobę, a lista czterdziestu ośmiu długości byłaby nie do
            przejrzenia. O tym, czy liczba trzyma się siatki, orzeka
            zastrzeżenie — to samo, którym sprawdza ją serwer. */}
        <label className="pole">
          <span>{teksty.rozklad.dlugosc}</span>
          <input
            type="number"
            min={SLOT_MINUTES}
            max={MINUTES_IN_DAY}
            step={SLOT_MINUTES}
            value={dlugosc}
            onChange={(zdarzenie) => setDlugosc(Number(zdarzenie.target.value))}
          />
        </label>
      </div>

      <div className="przyciski">
        <button
          type="button"
          className="przycisk"
          onClick={() => onDodaj({ weekday, startMinute: poczatek, durationMinutes: dlugosc })}
        >
          {teksty.rozklad.dodajBlok}
        </button>
      </div>
    </section>
  )
}

/**
 * Rozkład Bloków jednej Osi — tydzień, z którego bierze się cała jej oferta
 * terminów. Bloki wypisuje się ręcznie i nie generuje ich nic (ADR 0005), więc
 * ten ekran jest jedynym miejscem, w którym powstają.
 *
 * Zmiany żyją najpierw **na ekranie**, a do bazy idą dopiero przyciskiem —
 * inaczej niż Blokada, która wchodzi od razu. Powodem jest kopiowanie: dzień
 * przepisany na sześć innych to sześć zmian naraz, a rozkład zapisywany po
 * jednym Bloku pokazywałby Widgetowi każdy stan pośredni, w tym te, przez które
 * przechodzi się przez pomyłkę. Zapisuje się więc cały tydzień Osi jednym
 * żądaniem (ADR 0013) — a niezapisane zmiany ekran nazywa wprost, żeby nikt nie
 * wyszedł z Panelu przekonany, że zapisał.
 *
 * Rezerwacji ta zmiana nie rusza i nie ma czym: Rezerwacja niesie własny termin
 * i o rozkład nie pyta nikogo po tym, jak powstała. Blok zdjęty z rozkładu
 * znika ze sprzedaży, a nie z kalendarza.
 */
export function Rozklad({
  client,
  lanes,
  schedules,
  onZapisano,
}: {
  client: PanelClient
  /**
   * Wszystkie Osie — także wyłączone. Rozkład wyłączonej układa się przed jej
   * włączeniem, a nie po: Oś wracająca do sprzedaży ma mieć terminy od razu.
   */
  lanes: readonly Lane[]
  /** Rozkład całej Strzelnicy; tydzień wybranej Osi wyjmuje się z niego. */
  schedules: readonly BlockSchedule[]
  /** Rozkład zapisany — ekran wyżej czyta dane od nowa. */
  onZapisano: () => void
}) {
  /**
   * Wybrana Oś razem z jej tygodniem w poprawianiu — jednym stanem, bo są
   * jedną rzeczą: tydzień bez Osi nie ma czego opisywać, a Oś przełączona
   * z tygodniem poprzedniej pokazywałaby cudzy rozkład jako własny.
   *
   * Tydzień wstaje z odczytu i **nie odświeża się** razem z nim: dane
   * przychodzą co minutę, a podmiana rozkładu pod palcami zabrałaby obsłudze
   * pracę bez słowa. Cudza zmiana wygra przy zapisie i tak — rozkład zapisuje
   * się w całości.
   */
  const [wybor, setWybor] = useState<Wybor | null>(null)
  const [zrodlowyDzien, setZrodlowyDzien] = useState<Weekday>(1)
  const [doceloweDni, setDoceloweDni] = useState<readonly Weekday[]>([])
  const [zrodlowaOs, setZrodlowaOs] = useState('')
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly ScheduleProblem[]>([])
  const [udane, setUdane] = useState(false)
  const [blad, setBlad] = useState(false)

  /** Przełączenie Osi porzuca poprawki: tydzień jest tygodniem którejś z nich. */
  const wybierzOs = useCallback(
    (id: string) => {
      setWybor({ laneId: id, week: laneWeek(schedules, id) })
      // Oś źródłowa przepisania wraca do pustej: wskazana mogła być właśnie tą,
      // którą teraz się układa — a przepisanie Osi na nią samą skasowałoby
      // poprawki bez słowa.
      setZrodlowaOs('')
      setZastrzezenia([])
      setUdane(false)
      setBlad(false)
    },
    [schedules],
  )

  // Wybór odczytany przy renderze, a nie zapamiętany raz: Oś dodana albo
  // usunięta z listy między odczytami zostawiłaby stan wskazujący na Oś, której
  // w polu wyboru już nie ma — a pierwszy zapis poszedłby wtedy w próżnię.
  // Pusty wybór znaczy ekran otwarty po raz pierwszy.
  const wybrana = wybor && lanes.some((lane) => lane.id === wybor.laneId) ? wybor : null
  const laneId = wybrana?.laneId ?? lanes[0]?.id ?? ''
  const tydzien = wybrana?.week ?? laneWeek(schedules, laneId)
  const zmienTydzien = (nastepny: (dotad: readonly ScheduleBlock[]) => readonly ScheduleBlock[]) =>
    setWybor({ laneId, week: nastepny(tydzien) })

  const zapisz = () => {
    // Zastrzeżenia liczone tą samą czystą funkcją, którą serwer sprawdza je po
    // raz drugi — na całym tygodniu, a nie na zmienionym dniu: Blok
    // przeciągnięty przez północ zachodzi na dzień następny.
    const problemy = scheduleProblems(tydzien)
    if (problemy.length > 0) {
      setZastrzezenia(problemy)
      setUdane(false)
      return
    }

    setWysylanie(true)
    setBlad(false)
    setZastrzezenia([])
    setUdane(false)

    ustawRozklad(client, { laneId, week: tydzien })
      .then((wynik) => {
        setZastrzezenia(wynik.ok ? [] : [wynik.problem])
        setUdane(wynik.ok)
        if (wynik.ok) onZapisano()
      })
      .catch((przyczyna: unknown) => {
        console.error(przyczyna)
        setBlad(true)
      })
      .finally(() => setWysylanie(false))
  }

  if (lanes.length === 0) {
    return (
      <section className="konfiguracja">
        <h2>{teksty.rozklad.naglowek}</h2>
        <p className="komunikat">{teksty.rozklad.brakOsi}</p>
      </section>
    )
  }

  const niezapisane = !sameWeek(tydzien, laneWeek(schedules, laneId))
  // Oś do przepisania odczytana przy renderze, a nie wzięta ze stanu wprost:
  // wskazana Oś bywa tą, którą właśnie się układa, i wtedy nie ma jej w liście
  // — a przycisk czynny nad pustym polem przepisałby Oś na nią samą.
  const zrodlo = lanes.some((lane) => lane.id === zrodlowaOs && lane.id !== laneId)
    ? zrodlowaOs
    : ''
  const pozycjeDnia = (weekday: Weekday): Pozycja[] =>
    tydzien
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.weekday === weekday)
      .sort((a, b) => a.block.startMinute - b.block.startMinute)

  return (
    <section className="konfiguracja">
      <h2>{teksty.rozklad.naglowek}</h2>
      <p className="komunikat">{teksty.rozklad.wstep}</p>

      <div className="pole">
        <label htmlFor={POLE_OSI}>{teksty.rozklad.os}</label>
        <select
          id={POLE_OSI}
          value={laneId}
          onChange={(zdarzenie) => wybierzOs(zdarzenie.target.value)}
        >
          {lanes.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.name}
              {lane.active ? '' : ` — ${teksty.osie.wylaczona}`}
            </option>
          ))}
        </select>
      </div>

      <div className="rozklad__tydzien">
        {WEEKDAYS.map((weekday) => (
          <Dzien
            key={weekday}
            weekday={weekday}
            pozycje={pozycjeDnia(weekday)}
            onDodaj={(block) => zmienTydzien((dotad) => [...dotad, block])}
            onUsun={(index) => zmienTydzien((dotad) => dotad.filter((_, i) => i !== index))}
          />
        ))}
      </div>

      <p className="komunikat">{teksty.rozklad.kopiowanieWstep}</p>

      {/* Kopiowanie dnia: jedna para pól na cały tydzień, a nie sześć
          kwadracików przy każdym dniu z osobna — czterdzieści dwa pola wyboru
          na jednym ekranie są nie do przeczytania, a pytanie jest za każdym
          razem to samo. */}
      <fieldset className="rozklad__kopiowanie">
        <legend>{teksty.rozklad.kopiowanieDnia}</legend>

        <div className="pole">
          <label htmlFor={POLE_ZRODLOWY_DZIEN}>{teksty.rozklad.zrodlowyDzien}</label>
          <select
            id={POLE_ZRODLOWY_DZIEN}
            value={zrodlowyDzien}
            onChange={(zdarzenie) => setZrodlowyDzien(Number(zdarzenie.target.value) as Weekday)}
          >
            {WEEKDAYS.map((weekday) => (
              <option key={weekday} value={weekday}>
                {teksty.rozklad.dzien[weekday]}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="rozklad__dni">
          <legend>{teksty.rozklad.doceloweDni}</legend>
          {WEEKDAYS.filter((weekday) => weekday !== zrodlowyDzien).map((weekday) => (
            <div key={weekday} className="pole pole--zaznaczane">
              <input
                id={`${POLE_ZRODLOWY_DZIEN}-cel-${weekday}`}
                type="checkbox"
                checked={doceloweDni.includes(weekday)}
                onChange={(zdarzenie) =>
                  setDoceloweDni((dotad) =>
                    zdarzenie.target.checked
                      ? [...dotad, weekday]
                      : dotad.filter((wybrany) => wybrany !== weekday),
                  )
                }
              />
              <label htmlFor={`${POLE_ZRODLOWY_DZIEN}-cel-${weekday}`}>
                {teksty.rozklad.dzien[weekday]}
              </label>
            </div>
          ))}
        </fieldset>

        <div className="przyciski">
          <button
            type="button"
            className="przycisk"
            disabled={doceloweDni.length === 0}
            onClick={() =>
              zmienTydzien((dotad) => copyDay({ week: dotad, from: zrodlowyDzien, to: doceloweDni }))
            }
          >
            {teksty.rozklad.kopiujDzien}
          </button>
        </div>
      </fieldset>

      {/* Kopiowanie Osi bierze tydzień **zapisany**, a nie poprawiany na ekranie:
          poprawia się tu jedną Oś naraz, więc druga jest dokładnie tym, co
          w bazie. */}
      <fieldset className="rozklad__kopiowanie">
        <legend>{teksty.rozklad.kopiowanieOsi}</legend>

        <div className="pole">
          <label htmlFor={POLE_ZRODLOWA_OS}>{teksty.rozklad.zrodlowaOs}</label>
          <select
            id={POLE_ZRODLOWA_OS}
            value={zrodlo}
            onChange={(zdarzenie) => setZrodlowaOs(zdarzenie.target.value)}
          >
            <option value="">—</option>
            {lanes
              .filter((lane) => lane.id !== laneId)
              .map((lane) => (
                <option key={lane.id} value={lane.id}>
                  {lane.name}
                </option>
              ))}
          </select>
        </div>

        <div className="przyciski">
          <button
            type="button"
            className="przycisk"
            disabled={zrodlo === ''}
            onClick={() => zmienTydzien(() => laneWeek(schedules, zrodlo))}
          >
            {teksty.rozklad.kopiujOs}
          </button>
        </div>
      </fieldset>

      {niezapisane && (
        <p className="komunikat" role="status">
          {teksty.rozklad.niezapisane}
        </p>
      )}
      {zastrzezenia.map((problem) => (
        <p key={problem} className="komunikat komunikat--blad" role="alert">
          {teksty.rozklad.problem[problem]}
        </p>
      ))}
      {udane && (
        <p className="komunikat" role="status">
          {teksty.rozklad.zapisano}
        </p>
      )}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.rozklad.blad}
        </p>
      )}

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={zapisz} disabled={wysylanie}>
          {wysylanie ? teksty.rozklad.zapisywanie : teksty.rozklad.zapisz}
        </button>
      </div>
    </section>
  )
}
