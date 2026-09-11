import type {
  CalendarDay,
  CalendarException,
  DayHours,
  ExceptionRequest,
  HoursProblem,
  OpeningHours,
  PanelBooking,
  Weekday,
} from '@strzelnica/shared'
import {
  dayIn,
  exceptionProblems,
  formatDayLabel,
  formatScheduleMinute,
  formatTimeRange,
  hoursConflicts,
  MAX_CLOSES_MINUTE,
  MINUTES_IN_DAY,
  sameOpeningHours,
  SLOT_MINUTES,
  weekHoursProblems,
  WEEKDAYS,
} from '@strzelnica/shared'
import { useCallback, useId, useState } from 'react'
import { ustawGodziny, ustawWyjatek } from './konfiguracja.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'

/** Identyfikator kwadracika wyjątku — jedynego pola tego ekranu poza listą dni. */
const POLE_ZAMKNIECIA = 'wyjatek-zamkniete'

/**
 * Godziny do wyboru na siatce Slotów — tej samej, na której stoją Bloki.
 * Godziny otwarcia siatki nie wymagają (nie sprzedaje się ich, tylko mierzy
 * nimi Bloki), ale lista co pół godziny jest do przejrzenia, a pole na minuty
 * kazałoby obsłudze wpisywać „600" tam, gdzie chodzi o dziesiątą rano.
 *
 * Dwie listy, bo pytają o co innego: otwarcie mieści się w dobie, a zamknięcie
 * wolno przeciągnąć o dobę dalej — inaczej soboty kończącej się o 01:00 nie
 * dałoby się ustawić wcale.
 */
const OTWARCIA = Array.from({ length: MINUTES_IN_DAY / SLOT_MINUTES }, (_, i) => i * SLOT_MINUTES)
const ZAMKNIECIA = Array.from(
  { length: MAX_CLOSES_MINUTE / SLOT_MINUTES },
  (_, i) => (i + 1) * SLOT_MINUTES,
)

/** Godziny, na których dzień właśnie otwierany wstaje w polach. */
const DOMYSLNE_GODZINY: DayHours = { opensMinute: 600, closesMinute: 1320 }

/** Godzina w zapisie zegara Strzelnicy; po północy mówi, że to już jutro. */
function godzina(minuta: number): string {
  const zapis = formatScheduleMinute(minuta)
  return minuta >= MINUTES_IN_DAY ? teksty.godziny.nazajutrz(zapis) : zapis
}

/** Zakres godzin dnia jednym napisem — albo nic, gdy dzień jest zamknięty. */
function zakres(hours: DayHours | null): string | null {
  return hours
    ? teksty.godziny.zakres(godzina(hours.opensMinute), godzina(hours.closesMinute))
    : null
}

type KolizjeInput = {
  bookings: readonly PanelBooking[]
  timeZone: string
  /** Chwila odczytu; po niej poznaje się terminy, które da się jeszcze rozstrzygnąć. */
  teraz: Date
  openingHours: readonly OpeningHours[]
  exceptions: readonly CalendarException[]
  /** Jedna data zamiast całego okna — pyta o nią formularz wyjątku. */
  day?: CalendarDay
}

/**
 * Rezerwacje, które po tej zmianie stoją poza godzinami otwarcia. Liczone
 * z Rezerwacji **trzymających termin**: anulowana i wygasła nie kolidują
 * z niczym, bo nie ma już kogo wpuścić ani odprawić.
 *
 * Pomijamy też te, które zdążyły się skończyć. Okno Panelu sięga tydzień
 * wstecz, a wczorajszej Rezerwacji nie da się rozstrzygnąć niczym — ani jej
 * odwołać, ani wpuścić — więc na liście „do rozstrzygnięcia" byłaby wyłącznie
 * szumem zasłaniającym te, o które naprawdę chodzi.
 */
function kolizje(input: KolizjeInput): PanelBooking[] {
  const doRozstrzygniecia = input.bookings.filter(
    (wpis) =>
      wpis.holdsTerm &&
      wpis.booking.endsAt > input.teraz &&
      (!input.day || dayIn(input.timeZone, wpis.booking.startsAt) === input.day),
  )

  const poza = new Set(
    hoursConflicts({
      timeZone: input.timeZone,
      openingHours: input.openingHours,
      exceptions: input.exceptions,
      bookings: doRozstrzygniecia.map((wpis) => ({
        id: wpis.id,
        startsAt: wpis.booking.startsAt,
        endsAt: wpis.booking.endsAt,
      })),
    }).map((termin) => termin.id),
  )

  return doRozstrzygniecia.filter((wpis) => poza.has(wpis.id))
}

/**
 * Rezerwacje, które po zmianie stoją poza godzinami otwarcia. Wskazanie, a nie
 * przeszkoda: godziny wchodzą i tak, a Rezerwacja zostaje na Osi — niesie
 * własny termin i o godziny nie pyta nikogo po tym, jak powstała. Znika
 * wyłącznie Odwołaniem, z powodem wysłanym klientowi, więc przycisk prowadzi do
 * jej szczegółów, a nie do żadnego „napraw".
 */
function Kolizje({
  bookings,
  onWybierz,
}: {
  bookings: readonly PanelBooking[]
  onWybierz: (booking: PanelBooking) => void
}) {
  const naglowekId = useId()

  if (bookings.length === 0) return null

  return (
    <section className="kolizje" aria-labelledby={naglowekId}>
      <h3 id={naglowekId}>{teksty.godziny.kolizje.naglowek}</h3>
      <p className="komunikat komunikat--blad" role="alert">
        {teksty.godziny.kolizje.wstep}
      </p>
      <ul className="kolizje__lista">
        {bookings.map((wpis) => {
          const { day, startsAt, endsAt, timeZone, laneName, contact } = wpis.booking
          return (
            <li key={wpis.id}>
              <button type="button" className="tabela__link" onClick={() => onWybierz(wpis)}>
                {teksty.godziny.kolizje.pozycja(
                  formatDayLabel(day),
                  formatTimeRange(startsAt, endsAt, timeZone),
                  laneName,
                  contact.name,
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="komunikat">{teksty.godziny.kolizje.okno}</p>
    </section>
  )
}

/**
 * Para pól godzin: od kiedy i do kiedy. Jedna kopia dla tygodnia i dla wyjątku,
 * bo pytanie jest w obu miejscach to samo — a dwie rozjechałyby się przy
 * pierwszej poprawce listy godzin, i to tak, że wyjątek oferowałby co innego
 * niż dzień tygodnia obok.
 */
function PolaGodzin({
  id,
  hours,
  onZmien,
}: {
  /** Przedrostek identyfikatorów; etykiety wskazują listy przez `for`. */
  id: string
  hours: DayHours
  onZmien: (hours: DayHours) => void
}) {
  return (
    <div className="filtry">
      {/* Etykieta wskazuje listę przez `for`, a nie obejmuje jej sobą:
          obejmująca brałaby nazwę z całej swojej treści — razem
          z czterdziestoma ośmioma godzinami. */}
      <div className="pole">
        <label htmlFor={`${id}-otwarcie`}>{teksty.godziny.otwarcie}</label>
        <select
          id={`${id}-otwarcie`}
          value={hours.opensMinute}
          onChange={(zdarzenie) =>
            onZmien({ ...hours, opensMinute: Number(zdarzenie.target.value) })
          }
        >
          {OTWARCIA.map((minuta) => (
            <option key={minuta} value={minuta}>
              {godzina(minuta)}
            </option>
          ))}
        </select>
      </div>

      <div className="pole">
        <label htmlFor={`${id}-zamkniecie`}>{teksty.godziny.zamkniecie}</label>
        <select
          id={`${id}-zamkniecie`}
          value={hours.closesMinute}
          onChange={(zdarzenie) =>
            onZmien({ ...hours, closesMinute: Number(zdarzenie.target.value) })
          }
        >
          {ZAMKNIECIA.map((minuta) => (
            <option key={minuta} value={minuta}>
              {godzina(minuta)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * Jeden dzień tygodnia: czy Strzelnica jest wtedy czynna i w jakich godzinach.
 * Dzień zamknięty jest tu dniem **bez wiersza**, a nie dniem o zerowych
 * godzinach — ta sama konwencja, co w bazie i w `hoursForDay`, więc kwadracik
 * dopisuje dzień albo go zdejmuje.
 */
function Dzien({
  weekday,
  hours,
  onZmien,
}: {
  weekday: Weekday
  /** Godziny tego dnia albo `null`, gdy Strzelnica jest wtedy zamknięta. */
  hours: OpeningHours | null
  onZmien: (hours: OpeningHours | null) => void
}) {
  const polaId = useId()

  return (
    <section className="godziny__dzien" aria-labelledby={`${polaId}-naglowek`}>
      <h3 id={`${polaId}-naglowek`}>{teksty.godziny.dzien[weekday]}</h3>

      {/* Pole zaznaczane czyta się w poprzek: kwadracik i zdanie obok niego są
          jedną rzeczą. Etykieta wskazuje pole przez `for`, bo obejmująca je
          sobą brałaby nazwę z całej swojej treści. */}
      <div className="pole pole--zaznaczane">
        <input
          id={`${polaId}-otwarte`}
          type="checkbox"
          checked={hours !== null}
          onChange={(zdarzenie) =>
            onZmien(zdarzenie.target.checked ? { weekday, ...DOMYSLNE_GODZINY } : null)
          }
        />
        <label htmlFor={`${polaId}-otwarte`}>{teksty.godziny.otwarte}</label>
      </div>

      {hours === null ? (
        <p className="komunikat">{teksty.godziny.zamkniety}</p>
      ) : (
        <PolaGodzin
          id={polaId}
          hours={hours}
          onZmien={(zmienione) => onZmien({ weekday, ...zmienione })}
        />
      )}
    </section>
  )
}

/** Wyjątki w porządku kalendarza; zapis daty jest sortowalny, więc sortuje się sam. */
function wKolejnosciDat(a: CalendarException, b: CalendarException): number {
  return a.day < b.day ? -1 : a.day > b.day ? 1 : 0
}

/**
 * Wyjątki kalendarzowe: daty, które nie idą rytmem tygodnia. Osobna część
 * ekranu pod tygodniem, bo odpowiadają na inne pytanie — nie „jak zwykle",
 * tylko „co tego jednego dnia" — i zapisują się inaczej: pojedynczo, a nie
 * w całości. Wyjątków przybywa przez cały rok, więc zapis w całości kasowałby
 * święta wpisane poprzednią zmianą.
 */
function Wyjatki({
  client,
  openingHours,
  exceptions,
  bookings,
  timeZone,
  teraz,
  onZapisano,
  onWybierz,
}: {
  client: PanelClient
  /** Tydzień **zapisany**: do niego wraca data, z której zdejmuje się wyjątek. */
  openingHours: readonly OpeningHours[]
  exceptions: readonly CalendarException[]
  bookings: readonly PanelBooking[]
  timeZone: string
  teraz: Date
  onZapisano: () => void
  onWybierz: (booking: PanelBooking) => void
}) {
  const [data, setData] = useState('')
  const [powod, setPowod] = useState('')
  const [zamkniete, setZamkniete] = useState(true)
  const [godziny, setGodziny] = useState<DayHours>(DOMYSLNE_GODZINY)
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly HoursProblem[]>([])
  const [wynik, setWynik] = useState<'zapisano' | 'zdjeto' | null>(null)
  const [blad, setBlad] = useState(false)

  /**
   * Zapis wyjątku — dopisanie, poprawka albo zdjęcie. Jedna droga na wszystkie
   * trzy, bo różnią się wyłącznie tym, co na dacie ma zostać; wyjątek pusty
   * znaczy datę wracającą do rytmu tygodnia.
   */
  const zapisz = useCallback(
    (request: ExceptionRequest) => {
      // Zastrzeżenia liczone tą samą czystą funkcją, którą serwer sprawdza je
      // po raz drugi — walidacja w przeglądarce jest wygodą, a nie
      // zabezpieczeniem.
      const problemy = exceptionProblems(request)
      if (problemy.length > 0) {
        setZastrzezenia(problemy)
        setWynik(null)
        return
      }

      setWysylanie(true)
      setBlad(false)
      setZastrzezenia([])
      setWynik(null)

      ustawWyjatek(client, request)
        .then((odpowiedz) => {
          setZastrzezenia(odpowiedz.ok ? [] : [odpowiedz.problem])
          if (!odpowiedz.ok) return
          setWynik(request.exception ? 'zapisano' : 'zdjeto')
          // Pola wracają do pustych wyłącznie po dopisaniu: po zdjęciu wyjątku
          // nikt w nich niczego nie wpisywał.
          if (request.exception) {
            setData('')
            setPowod('')
          }
          onZapisano()
        })
        .catch((przyczyna: unknown) => {
          console.error(przyczyna)
          setBlad(true)
        })
        .finally(() => setWysylanie(false))
    },
    [client, onZapisano],
  )

  /** To, co formularz właśnie opisuje: dzień zamknięty albo skrócony. */
  const wybraneGodziny = zamkniete ? null : godziny

  // Wyjątek z formularza przyłożony do zapisanych: tak wygląda kalendarz, gdy
  // przycisk zostanie naciśnięty. Data pusta znaczy formularz jeszcze pusty —
  // wtedy nie ma czego przykładać.
  const projekt: CalendarException | null =
    data === '' ? null : { day: data, reason: powod, hours: wybraneGodziny }

  /** Kolizje dla stanu, w którym dana data ma taki wyjątek — albo nie ma żadnego. */
  const kolizjeDaty = (day: CalendarDay, wyjatek: CalendarException | null): PanelBooking[] =>
    kolizje({
      bookings,
      timeZone,
      teraz,
      openingHours,
      exceptions: [
        ...exceptions.filter((istniejacy) => istniejacy.day !== day),
        ...(wyjatek ? [wyjatek] : []),
      ],
      day,
    })

  return (
    <>
      <h3>{teksty.godziny.wyjatki.naglowek}</h3>
      <p className="komunikat">{teksty.godziny.wyjatki.wstep}</p>

      {exceptions.length === 0 ? (
        <p className="komunikat">{teksty.godziny.wyjatki.pusto}</p>
      ) : (
        <ul className="godziny__wyjatki">
          {[...exceptions].sort(wKolejnosciDat).map((wyjatek) => {
            // Zdjęcie wyjątku też bywa zmianą godzin — data wydłużona wyjątkiem
            // wraca do krótszego tygodnia — więc przycisk mówi o swoich
            // skutkach, zanim ktoś go naciśnie. Po naciśnięciu Rezerwacja
            // zostaje na Osi i nie ma innej chwili, żeby o niej usłyszeć.
            const wypchniete = kolizjeDaty(wyjatek.day, null).length

            return (
              <li key={wyjatek.day}>
                <span>
                  {teksty.godziny.wyjatki.pozycja(
                    wyjatek.day,
                    formatDayLabel(wyjatek.day),
                    teksty.godziny.wyjatki.opis(zakres(wyjatek.hours)),
                    wyjatek.reason,
                  )}
                  {wypchniete > 0 && (
                    <span className="godziny__ostrzezenie">
                      {' '}
                      {teksty.godziny.wyjatki.zdjecieKoliduje(wypchniete)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="przycisk"
                  aria-label={teksty.godziny.wyjatki.zdejmijOpis(wyjatek.day)}
                  disabled={wysylanie}
                  onClick={() => zapisz({ day: wyjatek.day, exception: null })}
                >
                  {teksty.godziny.wyjatki.zdejmij}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Formularz wyjątku w ramce, tak samo jak przepisywanie rozkładu:
          pytanie jest tu inne niż w tygodniu wyżej — nie „jak zwykle", tylko
          „co tego jednego dnia". */}
      <fieldset className="godziny__wyjatek">
        <legend>{teksty.godziny.wyjatki.formularz}</legend>

        <div className="filtry">
          <label className="pole">
            <span>{teksty.godziny.wyjatki.data}</span>
            <input
              type="date"
              value={data}
              onChange={(zdarzenie) => setData(zdarzenie.target.value)}
            />
          </label>

          <label className="pole">
            <span>{teksty.godziny.wyjatki.powod}</span>
            <input
              type="text"
              value={powod}
              onChange={(zdarzenie) => setPowod(zdarzenie.target.value)}
            />
          </label>
        </div>

        <div className="pole pole--zaznaczane">
          <input
            id={POLE_ZAMKNIECIA}
            type="checkbox"
            checked={zamkniete}
            onChange={(zdarzenie) => setZamkniete(zdarzenie.target.checked)}
          />
          <label htmlFor={POLE_ZAMKNIECIA}>{teksty.godziny.wyjatki.zamkniecieCalodniowe}</label>
        </div>

        {/* Godziny wyjątku pokazują się dopiero przy dniu skróconym: przy dniu
            zamkniętym nie ma o czym rozmawiać, a dwa pola bez treści kazałyby
            zgadywać, czy coś w nich zostawiono. */}
        {!zamkniete && <PolaGodzin id="wyjatek" hours={godziny} onZmien={setGodziny} />}

        <Kolizje
          bookings={projekt ? kolizjeDaty(projekt.day, projekt) : []}
          onWybierz={onWybierz}
        />

        {zastrzezenia.map((problem) => (
          <p key={problem} className="komunikat komunikat--blad" role="alert">
            {teksty.godziny.problem[problem]}
          </p>
        ))}
        {wynik && (
          <p className="komunikat" role="status">
            {teksty.godziny.wyjatki[wynik]}
          </p>
        )}
        {blad && (
          <p className="komunikat komunikat--blad" role="alert">
            {teksty.godziny.wyjatki.blad}
          </p>
        )}

        <div className="przyciski">
          <button
            type="button"
            className="przycisk"
            disabled={wysylanie}
            onClick={() =>
              zapisz({ day: data, exception: { reason: powod, hours: wybraneGodziny } })
            }
          >
            {wysylanie ? teksty.godziny.wyjatki.dodawanie : teksty.godziny.wyjatki.dodaj}
          </button>
        </div>
      </fieldset>
    </>
  )
}

/**
 * Godziny otwarcia Strzelnicy i Wyjątki kalendarzowe — kiedy Strzelnica jest
 * czynna, zanim ktokolwiek zapyta o konkretny Blok. Wspólne dla wszystkich Osi,
 * inaczej niż rozkład: zamknięty poniedziałek zdejmuje terminy wszystkim naraz.
 *
 * Dwie rzeczy na jednym ekranie, bo są jedną sprawą oglądaną z dwóch stron:
 * tydzień mówi o rytmie, wyjątek o jednej dacie — i to on wygrywa. Zapisują się
 * jednak osobno i stąd dwa formularze: tydzień idzie w całości (dzień pominięty
 * znaczy zamknięty), a wyjątki pojedynczo.
 *
 * Rezerwacji ani jedna z tych zmian nie rusza. Te, które wypadają poza nowe
 * godziny, ekran **wskazuje** — rozstrzyga je człowiek, bo tylko on wie, czy
 * dzwonić do klienta, czy wpuścić go mimo wszystko.
 */
export function Godziny({
  client,
  openingHours,
  exceptions,
  bookings,
  timeZone,
  teraz,
  onZapisano,
  onWybierz,
}: {
  client: PanelClient
  /** Tydzień zapisany w bazie; poprawiany żyje w stanie tego ekranu. */
  openingHours: readonly OpeningHours[]
  exceptions: readonly CalendarException[]
  /** Rezerwacje okna Panelu — z nich biorą się kolizje z nowymi godzinami. */
  bookings: readonly PanelBooking[]
  timeZone: string
  /** Chwila odczytu danych; mierzy się nią, co da się jeszcze rozstrzygnąć. */
  teraz: Date
  /** Zapisano — ekran wyżej czyta dane od nowa. */
  onZapisano: () => void
  /** Kolizja rozstrzygnięta przez człowieka: przejście do Rezerwacji. */
  onWybierz: (booking: PanelBooking) => void
}) {
  /**
   * Tydzień w poprawianiu. Pusty stan znaczy tydzień prosto z odczytu — i tak
   * właśnie ma być, dopóki nikt niczego nie tknął: dane przychodzą co minutę,
   * a tydzień zapamiętany od pierwszego renderu pokazywałby po godzinie stan
   * sprzed poranka. Tknięty przestaje się odświeżać, bo podmiana godzin pod
   * palcami zabrałaby obsłudze pracę bez słowa.
   */
  const [roboczy, setRoboczy] = useState<readonly OpeningHours[] | null>(null)
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly HoursProblem[]>([])
  const [udane, setUdane] = useState(false)
  const [blad, setBlad] = useState(false)

  const tydzien = roboczy ?? openingHours

  const zapisz = useCallback(() => {
    // Zastrzeżenia liczone tą samą czystą funkcją, którą serwer sprawdza je po
    // raz drugi — walidacja w przeglądarce jest wygodą, a nie zabezpieczeniem.
    const problemy = weekHoursProblems(tydzien)
    if (problemy.length > 0) {
      setZastrzezenia(problemy)
      setUdane(false)
      return
    }

    setWysylanie(true)
    setBlad(false)
    setZastrzezenia([])
    setUdane(false)

    ustawGodziny(client, { week: tydzien })
      .then((wynik) => {
        setZastrzezenia(wynik.ok ? [] : [wynik.problem])
        setUdane(wynik.ok)
        if (!wynik.ok) return
        // Tydzień wraca pod odczyt: zapisany jest już tym, co w bazie, więc
        // trzymanie go dalej w stanie tylko zasłaniałoby cudze zmiany.
        setRoboczy(null)
        onZapisano()
      })
      .catch((przyczyna: unknown) => {
        console.error(przyczyna)
        setBlad(true)
      })
      .finally(() => setWysylanie(false))
  }, [client, onZapisano, tydzien])

  const zmienDzien = (weekday: Weekday, hours: OpeningHours | null) =>
    setRoboczy([...tydzien.filter((dzien) => dzien.weekday !== weekday), ...(hours ? [hours] : [])])

  return (
    <section className="konfiguracja">
      <h2>{teksty.godziny.naglowek}</h2>
      <p className="komunikat">{teksty.godziny.wstep}</p>

      <div className="godziny__tydzien">
        {WEEKDAYS.map((weekday) => (
          <Dzien
            key={weekday}
            weekday={weekday}
            hours={tydzien.find((dzien) => dzien.weekday === weekday) ?? null}
            onZmien={(hours) => zmienDzien(weekday, hours)}
          />
        ))}
      </div>

      <Kolizje
        bookings={kolizje({ bookings, timeZone, teraz, openingHours: tydzien, exceptions })}
        onWybierz={onWybierz}
      />

      {!sameOpeningHours(tydzien, openingHours) && (
        <p className="komunikat" role="status">
          {teksty.godziny.niezapisane}
        </p>
      )}
      {zastrzezenia.map((problem) => (
        <p key={problem} className="komunikat komunikat--blad" role="alert">
          {teksty.godziny.problem[problem]}
        </p>
      ))}
      {udane && (
        <p className="komunikat" role="status">
          {teksty.godziny.zapisano}
        </p>
      )}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.godziny.blad}
        </p>
      )}

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={zapisz} disabled={wysylanie}>
          {wysylanie ? teksty.godziny.zapisywanie : teksty.godziny.zapisz}
        </button>
      </div>

      {/* Wyjątki czytają tydzień **zapisany**, a nie poprawiany na ekranie:
          data, z której zdejmuje się wyjątek, wraca do tego, co w bazie. */}
      <Wyjatki
        client={client}
        openingHours={openingHours}
        exceptions={exceptions}
        bookings={bookings}
        timeZone={timeZone}
        teraz={teraz}
        onZapisano={onZapisano}
        onWybierz={onWybierz}
      />
    </section>
  )
}
