import type {
  AmmunitionDemand,
  AmmunitionKind,
  BookingDraft,
  CalendarDay,
  LimitOverride,
  ManualBookingOutcome,
  ManualBookingProblem,
  WeaponAvailability,
  WeaponRental,
} from '@strzelnica/shared'
import {
  dayIn,
  formatAmount,
  formatTimeRange,
  manualBookingReview,
  panelOccupancy,
  priceBooking,
  ratesFor,
  remainingWeapons,
  scheduleForDay,
} from '@strzelnica/shared'
import { useCallback, useMemo, useState } from 'react'
import type { Dane } from './dane.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'
import { wpiszRezerwacje } from './wpisywanie.js'

/** Identyfikatory list wyboru; wiążą je z etykietami stojącymi obok. */
const POLE_OSI = 'wpis-os'
const POLE_TERMINU = 'wpis-termin'

/**
 * Wybór Typów broni i liczby sztuk. Ile sztuk zostało, liczy `remainingWeapons`
 * z `@strzelnica/shared` — ta sama funkcja, która orzeka o dostępności Bloku
 * i którą pyta serwer. Górna granica jest tu prawdziwa i **nie** podlega
 * przekroczeniu, więc stoi w polu jako `max`: Pula sztuk mówi, ile sztuk
 * Strzelnica ma, a nie ile zwykle wydaje (ADR 0012).
 *
 * Siostrzane wobec `apps/widget/src/Wypozyczenia.tsx` i świadomie osobne: to
 * dwie aplikacje z dwoma słownikami, a wspólnego pakietu komponentów ten moduł
 * nie ma — jedną kopię mają tu reguły (`packages/shared`), nie kontrolki.
 * Zachowaniem różni się jedną rzeczą: Typ wyczerpany zostaje na liście z polem,
 * bo obsługa ma zobaczyć, że Strzelnica go dziś nie wyda, a nie nie znaleźć go
 * wcale.
 */
function Wypozyczenia({
  dostepne,
  rentals,
  onRentals,
}: {
  dostepne: readonly WeaponAvailability[]
  rentals: readonly WeaponRental[]
  onRentals: (rentals: WeaponRental[]) => void
}) {
  const zamowione = (weaponTypeId: string) =>
    rentals.find((pozycja) => pozycja.weaponTypeId === weaponTypeId)?.quantity ?? 0

  const zmien = (weaponTypeId: string, quantity: number) => {
    const bez = rentals.filter((pozycja) => pozycja.weaponTypeId !== weaponTypeId)
    // Zero sztuk zdejmuje pozycję z Rezerwacji, zamiast zapisywać ją na zero:
    // własna broń i brak zamówienia wyglądają w systemie tak samo.
    onRentals(quantity > 0 ? [...bez, { weaponTypeId, quantity }] : bez)
  }

  return (
    <fieldset className="pozycje">
      <legend>{teksty.recznyWpis.wypozyczenie}</legend>
      {dostepne.map(({ type, remaining }) => (
        <label key={type.id} className="pole">
          <span>{type.name}</span>
          <input
            type="number"
            min={0}
            max={remaining}
            value={zamowione(type.id)}
            // Puste pole daje `NaN`; traktujemy je jak zero, bo znaczy „nie biorę".
            onChange={(zdarzenie) => zmien(type.id, zdarzenie.target.valueAsNumber || 0)}
          />
          <small>{teksty.recznyWpis.pozostalo(remaining)}</small>
        </label>
      ))}
    </fieldset>
  )
}

/**
 * Zamówienie amunicji: Rodzaj i liczba sztuk. Uboższe od Wypożyczeń o górną
 * granicę i o zdanie „pozostało N", bo Rodzaj amunicji nie ma puli (ADR 0004) —
 * ograniczenie wpisane tutaj byłoby zmyślone.
 */
function Amunicja({
  kinds,
  ammunition,
  onAmmunition,
}: {
  kinds: readonly AmmunitionKind[]
  ammunition: readonly AmmunitionDemand[]
  onAmmunition: (ammunition: AmmunitionDemand[]) => void
}) {
  const zamowione = (ammunitionKindId: string) =>
    ammunition.find((pozycja) => pozycja.ammunitionKindId === ammunitionKindId)?.quantity ?? 0

  const zmien = (ammunitionKindId: string, quantity: number) => {
    const bez = ammunition.filter((pozycja) => pozycja.ammunitionKindId !== ammunitionKindId)
    onAmmunition(quantity > 0 ? [...bez, { ammunitionKindId, quantity }] : bez)
  }

  return (
    <fieldset className="pozycje">
      <legend>{teksty.recznyWpis.amunicja}</legend>
      {kinds.map((kind) => (
        <label key={kind.id} className="pole">
          <span>{kind.name}</span>
          <input
            type="number"
            min={0}
            value={zamowione(kind.id)}
            onChange={(zdarzenie) => zmien(kind.id, zdarzenie.target.valueAsNumber || 0)}
          />
        </label>
      ))}
    </fieldset>
  )
}

/**
 * Ręczna Rezerwacja telefoniczna — pełne zgłoszenie wpisywane przez obsługę
 * w trakcie rozmowy, razem ze sprzętem i Kwotą.
 *
 * Formularz jest bliźniakiem tego z Widgetu i różni się od niego trzema
 * rzeczami, a wszystkie trzy biorą się z tego, kto go wypełnia:
 *
 * — Termin wybiera się z **całego** rozkładu Osi, nie tylko z wolnych Bloków.
 *   Termin, który klientowi nie jest dostępny, obsłudze bywa dostępny — bo
 *   o szóstym stanowisku, zostaniu po godzinach i Instruktorze wracającym ze
 *   zmiany system nie wie. Powód, przez który termin nie jest wolny, stoi
 *   przy nim wypisany.
 * — Trzy limity Strzelnicy wolno przekroczyć, ale wyłącznie po jawnym
 *   potwierdzeniu: pytanie o pewność wymienia każdy z nich osobno. Odnotowuje
 *   je potem serwer — tą samą czystą funkcją, którą ten ekran właśnie pokazał
 *   pytanie.
 * — Wyłączności Osi nie przekroczy tu nikt i nie ma na to przycisku: termin
 *   czyjś jest odmową, a nie odstępstwem (ADR 0012).
 *
 * Kwota liczy się na bieżąco tą samą funkcją, którą przelicza ją serwer —
 * obsługa ma podać klientowi w rozmowie tę Kwotę, która za chwilę stanie przy
 * Rezerwacji.
 */
export function RecznyWpis({
  client,
  dane,
  onOdswiez,
}: {
  client: PanelClient
  /**
   * Wszystko, co Panel wczytał. Cała Strzelnica, bo dostępność terminu zależy
   * od wszystkiego naraz: rozkładu, godzin, wyjątków, Zajętości, Puli
   * instruktorów i pul sztuk broni. Wypisanie tego prop po propie byłoby tą
   * samą listą napisaną dwa razy.
   */
  dane: Dane
  /**
   * Funkcja odpowiedziała — ekran wyżej czyta dane od nowa. Wołane po **każdej**
   * odpowiedzi, nie tylko po tej udanej: odmowa z bazy znaczy, że to, co ten
   * formularz miał pod ręką, jest już nieprawdą — ktoś wziął termin albo zajął
   * miejsce w Puli. Bez odczytu od nowa kolejne kliknięcie liczyłoby osąd
   * z tych samych nieaktualnych danych i dostawało tę samą odmowę do
   * najbliższego tiku odświeżania. Ten sam zwyczaj, co przy odwołaniu
   * Rezerwacji.
   */
  onOdswiez: () => void
}) {
  const { facility, lanes, weaponTypes, ammunitionKinds, teraz } = dane

  // „Teraz" przyjeżdża z odczytem danych, a nie z zegara czytanego tutaj:
  // grafik ma się przeliczać razem z nimi, raz na minutę, a nie przy każdym
  // naciśnięciu klawisza — i to na jeden czas, nie na dwa różne w jednym
  // renderze. Ostatnie słowo ma i tak zegar bazy, przy zapisie.
  const dzisiaj = dayIn(facility.timeZone, teraz)

  const [laneId, setLaneId] = useState(lanes[0]?.id ?? '')
  const [dzien, setDzien] = useState<CalendarDay>(dzisiaj)
  const [startMinute, setStartMinute] = useState<number | null>(null)
  const [uczestnicy, setUczestnicy] = useState(1)
  const [hasPermit, setHasPermit] = useState(false)
  const [wantsInstructor, setWantsInstructor] = useState(false)
  const [rentals, setRentals] = useState<readonly WeaponRental[]>([])
  const [ammunition, setAmmunition] = useState<readonly AmmunitionDemand[]>([])
  const [imie, setImie] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [zgoda, setZgoda] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly ManualBookingProblem[]>([])
  /** Limity, o które ekran właśnie pyta; puste znaczy, że nie pyta o nic. */
  const [pyta, setPyta] = useState<readonly LimitOverride[]>([])
  const [wysylanie, setWysylanie] = useState(false)
  const [wynik, setWynik] = useState<ManualBookingOutcome | null>(null)
  const [blad, setBlad] = useState(false)

  const lane = lanes.find((wpis) => wpis.id === laneId)

  // Zgłoszenie złożone z pól formularza — dokładnie to, co wypełnia sobie
  // klient w Widgecie. Zapamiętane, bo jedzie do funkcji wysyłającej: nowy
  // obiekt przy każdym renderze przestawiałby ją bez powodu.
  const draft: BookingDraft = useMemo(
    () => ({
      participants: uczestnicy,
      contact: { name: imie, email, phone: telefon },
      consent: zgoda,
      hasPermit,
      wantsInstructor,
      rentals,
      ammunition,
    }),
    [ammunition, email, hasPermit, imie, rentals, telefon, uczestnicy, wantsInstructor, zgoda],
  )

  // Grafik dnia liczony tą samą funkcją, co kalendarz klienta — razem
  // z zamierzeniami, bo od nich zależy dostępność. Zajętość składa się z tego,
  // co Panel ma pod ręką (`panelOccupancy`): widoków zajętości Widgetu nie
  // czyta wcale i nie ma do nich prawa (ADR 0009).
  const grafik = scheduleForDay({
    day: dzien,
    laneId,
    timeZone: facility.timeZone,
    timeRules: facility.timeRules,
    instructorPool: facility.instructorPool,
    intent: draft,
    schedules: dane.schedules,
    openingHours: dane.openingHours,
    closedDates: dane.closedDates,
    occupancies: panelOccupancy({ bookings: dane.bookings, closures: dane.closures }),
    weaponTypes,
    weaponOccupancies: dane.weaponOccupancies,
    now: teraz,
  })

  const block = grafik.blocks.find((kandydat) => kandydat.startMinute === startMinute)

  // Ile sztuk zostało — w wybranym terminie, a przed jego wybraniem cała Pula:
  // bez terminu nie ma z czym zestawiać cudzych Wypożyczeń.
  const dostepneSztuki: WeaponAvailability[] = block
    ? remainingWeapons({
        weaponTypes,
        weaponOccupancies: dane.weaponOccupancies,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
      })
    : weaponTypes.map((type) => ({ type, remaining: type.pool }))

  // Oś dopuszczalnie pusta i orzeka o tym `manualBookingReview`, a nie ten
  // ekran: „nie ma takiej Osi" jest odmową domeny, a odmowa napisana tutaj
  // byłaby drugą jej kopią — obok tej, którą na to samo odpowiada serwer.
  const osad = manualBookingReview({ draft, lane, block, ammunitionKinds })

  // Kwota z tego samego rachunku, który policzy serwer. Bez Osi nie ma stawki
  // za Blok, więc nie ma czego pokazać.
  const kwota = lane
    ? priceBooking({ rates: ratesFor(facility, lane), draft, weaponTypes, ammunitionKinds }).amount
        .total
    : null

  /** Zmiana Osi albo dnia unieważnia wybrany termin: rozkład jest inny. */
  const przestawTermin = useCallback((zmiana: () => void) => {
    zmiana()
    setStartMinute(null)
    setPyta([])
  }, [])

  const wyslij = useCallback(
    (overrides: readonly LimitOverride[]) => {
      if (!block) return

      setWysylanie(true)
      setBlad(false)
      setZastrzezenia([])
      setWynik(null)

      wpiszRezerwacje(client, {
        ...draft,
        laneId,
        day: dzien,
        startMinute: block.startMinute,
        overrides,
      })
        .then((odpowiedz) => {
          setPyta([])
          setWynik(odpowiedz)
          // Dane od nowa po każdej odpowiedzi — także po odmowie, i to wtedy
          // najbardziej: odmowa mówi, że termin albo Pula zmieniły się bez nas.
          onOdswiez()
          if (!odpowiedz.ok) return
          // Pola wracają do pustych wyłącznie po Rezerwacji, która weszła:
          // wyczyszczone po odmowie kazałyby wpisywać wszystko od nowa, żeby
          // poprawić jedną rzecz.
          setStartMinute(null)
          setUczestnicy(1)
          setHasPermit(false)
          setWantsInstructor(false)
          setRentals([])
          setAmmunition([])
          setImie('')
          setEmail('')
          setTelefon('')
          setZgoda(false)
          onOdswiez()
        })
        .catch((przyczyna: unknown) => {
          // Żądanie, które nie doszło, nie zmienia ekranu — bez tego zdania
          // kliknięcie wyglądałoby na zignorowane.
          console.error(przyczyna)
          setBlad(true)
        })
        .finally(() => setWysylanie(false))
    },
    [block, client, draft, dzien, laneId, onOdswiez],
  )

  /**
   * Kliknięcie „Wpisz Rezerwację". Trzy wyjścia: zastrzeżenia, o których wolno
   * powiedzieć od razu; pytanie o pewność, gdy wpis przekracza limity; i sam
   * zapis, gdy nie przekracza żadnego.
   *
   * Pytanie stoi **przed** wysłaniem, bo to ono jest jawnym potwierdzeniem —
   * a nie po, bo Rezerwacji nie da się odkliknąć: termin jest od tej chwili
   * zajęty.
   */
  const wpisz = () => {
    setWynik(null)
    if (osad.problems.length > 0) {
      setZastrzezenia(osad.problems)
      setPyta([])
      return
    }

    setZastrzezenia([])
    if (osad.exceeded.length > 0) {
      setPyta(osad.exceeded)
      return
    }

    wyslij([])
  }

  return (
    <section className="reczny-wpis">
      <h2>{teksty.recznyWpis.naglowek}</h2>
      <p className="komunikat">{teksty.recznyWpis.wstep}</p>

      <div className="filtry">
        {/* Etykieta wskazuje pole przez `for`, a nie obejmuje go sobą: etykieta
            obejmująca listę wyboru bierze nazwę z całej swojej treści — razem
            z nazwami wszystkich Osi. */}
        <div className="pole">
          <label htmlFor={POLE_OSI}>{teksty.recznyWpis.os}</label>
          <select
            id={POLE_OSI}
            value={laneId}
            onChange={(zdarzenie) => przestawTermin(() => setLaneId(zdarzenie.target.value))}
          >
            {lanes.map((wpis) => (
              <option key={wpis.id} value={wpis.id}>
                {wpis.name}
              </option>
            ))}
          </select>
        </div>

        {/* Dzień od dzisiaj po horyzont: wcześniej nie ma czego wpisywać —
            terminu, który minął, nie wolno przekroczyć — a dalej nie ma Bloków
            w rozkładzie do wzięcia. Górna granica jest tą samą, którą Panel
            czyta Rezerwacje, bo Rezerwacja wpisana za oknem nie stanęłaby
            w kalendarzu. */}
        <label className="pole">
          <span>{teksty.recznyWpis.dzien}</span>
          <input
            type="date"
            value={dzien}
            min={dzisiaj}
            max={dane.okno.to}
            onChange={(zdarzenie) =>
              przestawTermin(() => setDzien(zdarzenie.target.value || dzisiaj))
            }
          />
        </label>

        {/* Wszystkie Bloki dnia, nie tylko wolne — razem z powodem, przez który
            wolne nie są. To jest owo „obsługa wie więcej niż system": termin
            niedostępny dla klienta bywa dostępny dla niej. */}
        <div className="pole">
          <label htmlFor={POLE_TERMINU}>{teksty.recznyWpis.termin}</label>
          <select
            id={POLE_TERMINU}
            value={startMinute ?? ''}
            disabled={grafik.blocks.length === 0}
            onChange={(zdarzenie) => {
              setStartMinute(zdarzenie.target.value === '' ? null : Number(zdarzenie.target.value))
              setPyta([])
            }}
          >
            <option value="">{teksty.recznyWpis.wybierzTermin}</option>
            {grafik.blocks.map((kandydat) => (
              <option key={kandydat.scheduleId} value={kandydat.startMinute}>
                {formatTimeRange(kandydat.startsAt, kandydat.endsAt, facility.timeZone)}
                {' — '}
                {kandydat.available
                  ? teksty.wolnyTermin
                  : kandydat.refusals.map((powod) => teksty.powodTerminu[powod]).join(', ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {grafik.blocks.length === 0 && (
        <p className="komunikat">{teksty.recznyWpis.brakTerminow}</p>
      )}

      <div className="filtry">
        <label className="pole">
          <span>{teksty.recznyWpis.uczestnicy}</span>
          <input
            type="number"
            min={1}
            value={uczestnicy}
            onChange={(zdarzenie) => setUczestnicy(zdarzenie.target.valueAsNumber || 0)}
          />
          {/* Pojemność wypisana, a nie wpisana w `max`: skład liczniejszy jest
              tu limitem do przekroczenia, więc pole ma go przyjąć. */}
          {lane && <small>{teksty.recznyWpis.pojemnosc(lane.capacity)}</small>}
        </label>
      </div>

      <label className="pole pole--zaznaczane">
        <input
          type="checkbox"
          checked={hasPermit}
          onChange={(zdarzenie) => setHasPermit(zdarzenie.target.checked)}
        />
        <span>{teksty.recznyWpis.pozwolenie}</span>
      </label>

      {/* Bez Pozwolenia Instruktor jest wymagany, więc pole przestaje być
          pytaniem — a odpowiedź na nie i tak liczy `instructorAttends`, ta sama
          funkcja, którą pyta o niego dostępność i Kwota. */}
      {hasPermit ? (
        <label className="pole pole--zaznaczane">
          <input
            type="checkbox"
            checked={wantsInstructor}
            onChange={(zdarzenie) => setWantsInstructor(zdarzenie.target.checked)}
          />
          <span>{teksty.recznyWpis.instruktor}</span>
        </label>
      ) : (
        <p className="komunikat">{teksty.recznyWpis.instruktorWymagany}</p>
      )}

      <Wypozyczenia dostepne={dostepneSztuki} rentals={rentals} onRentals={setRentals} />
      <Amunicja kinds={ammunitionKinds} ammunition={ammunition} onAmmunition={setAmmunition} />

      <div className="filtry">
        <label className="pole">
          <span>{teksty.recznyWpis.imie}</span>
          <input value={imie} onChange={(zdarzenie) => setImie(zdarzenie.target.value)} />
        </label>

        <label className="pole">
          <span>{teksty.recznyWpis.email}</span>
          <input
            type="email"
            value={email}
            onChange={(zdarzenie) => setEmail(zdarzenie.target.value)}
          />
        </label>

        <label className="pole">
          <span>{teksty.recznyWpis.telefon}</span>
          <input value={telefon} onChange={(zdarzenie) => setTelefon(zdarzenie.target.value)} />
        </label>
      </div>

      <label className="pole pole--zaznaczane">
        <input
          type="checkbox"
          checked={zgoda}
          onChange={(zdarzenie) => setZgoda(zdarzenie.target.checked)}
        />
        <span>{teksty.recznyWpis.zgoda}</span>
      </label>

      {kwota !== null && (
        <p className="wpis-kwota">
          <strong>
            {teksty.recznyWpis.kwota}: {formatAmount(kwota)}
          </strong>
          <br />
          <span className="komunikat">{teksty.recznyWpis.kwotaUwaga}</span>
        </p>
      )}

      {/* Wszystkie zastrzeżenia naraz, w kolejności czytania formularza — tak
          samo jak przy zgłoszeniu z Widgetu: obsługa ma zobaczyć całą listę
          poprawek za jednym razem, a nie odkrywać je po jednym na kliknięcie. */}
      {zastrzezenia.map((problem) => (
        <p key={problem} className="komunikat komunikat--blad" role="alert">
          {teksty.recznyWpis.problem[problem]}
        </p>
      ))}

      {wynik &&
        (wynik.ok ? (
          <p className="komunikat" role="status">
            {teksty.recznyWpis.wpisano}
            {wynik.overrides.length > 0 && (
              <>
                {' '}
                {teksty.recznyWpis.wpisanoZPrzekroczeniem}{' '}
                {wynik.overrides.map((limit) => teksty.przekroczenie[limit]).join('; ')}.
              </>
            )}
          </p>
        ) : (
          <p className="komunikat komunikat--blad" role="alert">
            {teksty.recznyWpis.problem[wynik.problem]}
          </p>
        ))}

      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.recznyWpis.blad}
        </p>
      )}

      {pyta.length > 0 ? (
        <>
          <p>{teksty.recznyWpis.pewnie}</p>
          <ul className="przekroczenia">
            {pyta.map((limit) => (
              <li key={limit}>{teksty.przekroczenie[limit]}</li>
            ))}
          </ul>
          <p>{teksty.recznyWpis.pewnieOgon}</p>
          <div className="przyciski">
            <button type="button" className="przycisk" onClick={() => setPyta([])}>
              {teksty.recznyWpis.nie}
            </button>
            <button
              type="button"
              className="przycisk"
              onClick={() => wyslij(pyta)}
              disabled={wysylanie}
            >
              {wysylanie ? teksty.recznyWpis.wpisywanie : teksty.recznyWpis.tak}
            </button>
          </div>
        </>
      ) : (
        <div className="przyciski">
          <button type="button" className="przycisk" onClick={wpisz} disabled={wysylanie}>
            {wysylanie ? teksty.recznyWpis.wpisywanie : teksty.recznyWpis.wpisz}
          </button>
        </div>
      )}
    </section>
  )
}
