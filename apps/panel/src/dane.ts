/**
 * Pobranie wszystkiego, co Panel pokazuje o Rezerwacjach. Jedno zapytanie na
 * tabelę; układaniem zajmują się czyste funkcje z `@strzelnica/shared`, tutaj
 * jest wyłącznie odczyt i przepisanie wierszy — siostrzane wobec `grafik.ts`
 * w Widgecie i z tego samego powodu płytkie.
 *
 * Ani jedno z tych zapytań nie mówi o Strzelnicy i nie jest to przeoczenie:
 * zalogowanemu kontu baza oddaje wyłącznie jej wiersze — Rezerwacje widokiem
 * `panel_bookings`, wszystko pozostałe politykami RLS z `panel_facility()`
 * (zobacz ADR 0009). Warunek dopisany tutaj byłby drugą granicą, a druga
 * granica to ta, o której się zapomina: znika razem z pominięciem jednego
 * `.eq(…)` przy następnym zapytaniu i nikt tego nie zauważy, bo pierwsza
 * granica wciąż trzyma.
 *
 * Inaczej niż w Widgecie, który pyta kluczem anonimowym — ten tożsamości nie
 * ma, RLS wpuszcza go do oferty wszystkich Strzelnic, więc tam zawężenie
 * należy do wołającego.
 */
import type {
  AmmunitionKind,
  BlockSchedule,
  CalendarDay,
  Facility,
  Lane,
  LaneClosure,
  OpeningHours,
  PanelBooking,
  PanelWindow,
  WeaponOccupancy,
  WeaponType,
} from '@strzelnica/shared'
import {
  ammunitionKindFromRow,
  blockScheduleFromRow,
  closedDateFromRow,
  facilityFromRow,
  laneClosureFromRow,
  laneFromRow,
  openingHoursFromRow,
  panelBookingsFromRows,
  panelWeaponOccupancy,
  panelWindow,
  rowsOrThrow,
  weaponTypeFromRow,
  zonedMinuteToInstant,
} from '@strzelnica/shared'
import type { PanelClient } from './supabase.js'

/**
 * Strzelnica razem ze swoją ofertą: kolumny konfiguracji, rozkład Bloków,
 * godziny otwarcia i wyjątki kalendarzowe — jednym odczytem, przez powiązania
 * PostgREST-a. Tak samo jak przy pozycjach Rezerwacji niżej, i z tego samego
 * powodu: każde zapytanie z przeglądarki idzie na obcą domenę, więc niesie
 * przed sobą zapytanie wstępne — cztery odczyty to osiem podróży, a ten jeden
 * to dwie. Panel wczytuje się raz na minutę, a obsługa patrzy w niego od rana.
 *
 * Kolumny wypisane, a nie `select('*')`, bo `facilities` niesie też dane
 * kontaktowe obsługi: kolumna dołożona do tej tabeli jest domyślnie prywatna
 * i tak ma zostać. Oferta wchodzi w całości, bo w całości jest publiczna.
 *
 * Jednym napisem i bez sklejania, choć wiersz jest przez to długi: klient
 * Supabase czyta kształt odpowiedzi z **literału**, a napis złożony z dwóch
 * kawałków jest dla niego zwykłym `string` — i typem wiersza staje się wtedy
 * błąd zamiast wiersza.
 */
const STRZELNICA_Z_OFERTA =
  'id, name, timezone, booking_horizon_days, min_lead_minutes, cancellation_window_hours, instructor_pool, participation_rate_gr, instructor_rate_gr, block_schedules(*), opening_hours(*), calendar_exceptions(*)' as const

export type Dane = {
  /**
   * Strzelnica w całości — z regułami czasowymi, Pulą instruktorów i stawkami.
   * Do podglądu Rezerwacji starczyłaby nazwa i zegar; reszta jest tu dla
   * formularza ręcznego wpisu, który liczy dostępność i Kwotę tymi samymi
   * czystymi funkcjami, co Widget.
   *
   * Identyfikator przychodzi razem z nią, bo tak wygląda `Facility` — ale nie
   * ma zapytania, które by go użyło, i mieć nie będzie: granica Strzelnicy
   * stoi w bazie (zobacz uwagę na początku pliku).
   */
  facility: Facility
  /**
   * Chwila, w której te dane odczytano. Jedzie razem z nimi, bo mierzy się nią
   * przeszłość i minimalne wyprzedzenie w formularzu ręcznego wpisu — a „teraz"
   * jest w tym module parametrem, nie odczytem zegara (spec, Testing
   * Decisions). Ekran czytający zegar sam z siebie przeliczałby grafik przy
   * każdym naciśnięciu klawisza, każdy raz na inny czas; tak przeliczy się
   * razem z odczytem, raz na minutę.
   */
  teraz: Date
  lanes: Lane[]
  bookings: PanelBooking[]
  /** Blokady tego samego okna: dla kalendarza zajmują Oś tak jak Rezerwacje. */
  closures: LaneClosure[]
  /** Zakres dni, z którego te Rezerwacje pochodzą — i poza który ekran nie pyta. */
  okno: PanelWindow
  /** Rozkład Bloków wszystkich Osi: z niego bierze się termin ręcznego wpisu. */
  schedules: BlockSchedule[]
  openingHours: OpeningHours[]
  /** Dni zamknięte wyjątkiem kalendarzowym — wtedy nie ma czego wpisywać. */
  closedDates: CalendarDay[]
  /** Katalog Typów broni wraz z pulami sztuk i cenami. */
  weaponTypes: WeaponType[]
  ammunitionKinds: AmmunitionKind[]
  /**
   * Sztuki trzymane przez Rezerwacje okna. Złożone z pozycji Rezerwacji, a nie
   * odczytane z widoku `weapon_occupancy`: tamten wystawia Wypożyczenia
   * wszystkich Strzelnic i konto Panelu nie ma do niego prawa (ADR 0009).
   */
  weaponOccupancies: WeaponOccupancy[]
}

/**
 * Konto bez Strzelnicy. Zdarza się między założeniem konta a wpisem
 * w `panel_users` — i jest brakiem konfiguracji, a nie awarią, więc Panel ma
 * o tym powiedzieć wprost zamiast pokazywać pusty kalendarz nieistniejącej
 * Strzelnicy.
 */
export class BrakStrzelnicyError extends Error {
  constructor() {
    super('To konto nie jest powiązane z żadną Strzelnicą. Zgłoś to operatorowi platformy.')
    this.name = 'BrakStrzelnicyError'
  }
}

/** Strzelnica i jej oferta — to, co przychodzi pierwszym odczytem. */
type Oferta = {
  facility: Facility
  schedules: BlockSchedule[]
  openingHours: OpeningHours[]
  closedDates: CalendarDay[]
}

async function ofertaUzytkownika(client: PanelClient): Promise<Oferta> {
  // Zapytanie bez warunku o jedną Strzelnicę: polityka `facilities` wpuszcza
  // zalogowane konto do dokładnie jednego wiersza — tego, na który wskazuje
  // jego powiązanie. Pytanie „czyj jest ten Panel" i pytanie „jaka to
  // Strzelnica" mają więc jedną odpowiedź i jeden odczyt; osobny odczyt
  // `panel_users` po sam identyfikator byłby tym samym pytaniem zadanym dwa
  // razy, a jego wynik i tak trafiłby do warunku, który RLS stawia sama.
  //
  // Powiązane wiersze idą tą samą drogą i tym samym warunkiem: każda z tych
  // trzech tabel ma własną politykę na przynależność do Strzelnicy, więc
  // dołączenie ich do tego odczytu nie omija ani jednej granicy — omija
  // wyłącznie trzy podróże po sieci.
  //
  // Pusto znaczy konto bez Strzelnicy — zdarza się między założeniem konta
  // a wpisem w `panel_users`. Pusty wynik jest tu odpowiedzią, a nie błędem
  // zapytania, więc pytamy o listę i patrzymy na jej pierwszy wiersz, zamiast
  // żądać dokładnie jednego.
  const [row] = rowsOrThrow(await client.from('facilities').select(STRZELNICA_Z_OFERTA))
  if (!row) throw new BrakStrzelnicyError()

  return {
    facility: facilityFromRow(row),
    schedules: row.block_schedules.map(blockScheduleFromRow),
    openingHours: row.opening_hours.map(openingHoursFromRow),
    closedDates: row.calendar_exceptions.map(closedDateFromRow),
  }
}

/**
 * Rezerwacje Strzelnicy wraz z tym, z czego składa się ich opis — z okna
 * liczonego od dzisiaj (`panelWindow`). Bez zawężenia do jednego dnia:
 * kalendarz stoi na jednym, ale lista filtruje po dowolnym z okna, więc odczyt
 * per dzień znaczyłby żądanie przy każdym kliknięciu strzałki.
 *
 * Pozycje Rezerwacji zawężamy tym samym oknem, sięgając przez `panel_bookings`
 * do terminu ich Rezerwacji. Ich własne kolumny o terminie nie mówią nic,
 * a odczyt bez granicy urwałby się kiedyś w połowie na `max_rows` — i wtedy
 * Rezerwacja z zamówioną bronią pokazałaby w szczegółach „własna broń".
 *
 * Oferta Strzelnicy przychodzi w całości i bez okna, bo oknem czasu nie jest
 * ograniczona: rozkład jest tygodniowy, a katalogi nie mają terminu wcale.
 * Jej większość — rozkład, godziny i wyjątki — jedzie razem ze Strzelnicą,
 * pierwszym odczytem (`ofertaUzytkownika`); katalogi zostają tutaj, bo mają
 * własny porządek i wchodzą do opisu Rezerwacji.
 */
export async function wczytajDane(client: PanelClient, now: Date): Promise<Dane> {
  const { facility, schedules, openingHours, closedDates } = await ofertaUzytkownika(client)
  const okno = panelWindow({
    timeZone: facility.timeZone,
    horizonDays: facility.timeRules.horizonDays,
    now,
  })

  const od = zonedMinuteToInstant(okno.from, 0, facility.timeZone).toISOString()
  // Koniec okna jest dniem włącznie, więc granica stoi o północy, która ten
  // dzień domyka: minuta 1440 dnia `okno.to`, liczona tak samo jak Blok
  // przecinający granicę doby. Bez tego Rezerwacje ostatniego dnia horyzontu
  // wypadłyby z okna, choć są jego końcem.
  const doPolnocy = zonedMinuteToInstant(okno.to, 1440, facility.timeZone).toISOString()

  const [lanes, bookings, closures, rentals, ammunition, weaponTypes, ammunitionKinds] =
    await Promise.all([
      client.from('lanes').select('*').order('name'),
      client
        .from('panel_bookings')
        .select('*')
        .gte('starts_at', od)
        .lt('starts_at', doPolnocy)
        .order('starts_at'),
      // Blokady zawężone **zachodzeniem**, a nie samym początkiem jak
      // Rezerwacje: Blokada bierze dowolny zakres czasu, więc ta zaczęta przed
      // oknem wciąż wyłącza Oś w jego środku. Warunek na sam `starts_at`
      // pokazywałby wolną Oś, na którą nikogo nie wolno wpuścić.
      client
        .from('lane_closures')
        .select('*')
        .lt('starts_at', doPolnocy)
        .gt('ends_at', od)
        .order('starts_at'),
      client
        .from('weapon_rentals')
        .select('booking_id, weapon_type_id, quantity, panel_bookings!inner(starts_at)')
        .gte('panel_bookings.starts_at', od)
        .lt('panel_bookings.starts_at', doPolnocy),
      client
        .from('ammunition_demands')
        .select('booking_id, ammunition_kind_id, quantity, panel_bookings!inner(starts_at)')
        .gte('panel_bookings.starts_at', od)
        .lt('panel_bookings.starts_at', doPolnocy),
      // Katalogi w całości, a nie po same nazwy: opis Rezerwacji potrzebuje
      // nazwy, ale formularz ręcznego wpisu potrzebuje też puli sztuk i ceny —
      // a dwa odczyty tej samej tabeli dałyby się rozejść przy pierwszej
      // poprawce jednego z nich.
      client.from('weapon_types').select('*').order('name'),
      client.from('ammunition_kinds').select('*').order('name'),
    ])

  const osie = rowsOrThrow(lanes)
  const pozycjeBroni = rowsOrThrow(rentals)
  const katalogBroni = rowsOrThrow(weaponTypes)
  const katalogAmunicji = rowsOrThrow(ammunitionKinds)

  const rezerwacje = panelBookingsFromRows({
    bookings: rowsOrThrow(bookings),
    facility: { name: facility.name, timezone: facility.timeZone },
    lanes: osie,
    rentals: pozycjeBroni,
    ammunition: rowsOrThrow(ammunition),
    weaponTypes: katalogBroni,
    ammunitionKinds: katalogAmunicji,
  })

  return {
    facility,
    teraz: now,
    okno,
    lanes: osie.map(laneFromRow),
    closures: rowsOrThrow(closures).map(laneClosureFromRow),
    bookings: rezerwacje,
    schedules,
    openingHours,
    closedDates,
    weaponTypes: katalogBroni.map(weaponTypeFromRow),
    ammunitionKinds: katalogAmunicji.map(ammunitionKindFromRow),
    // Termin sztukom nadaje Rezerwacja, do której pozycja należy — własne
    // kolumny Wypożyczenia nie mówią o nim nic.
    weaponOccupancies: panelWeaponOccupancy({
      bookings: rezerwacje,
      rentals: pozycjeBroni.map((wiersz) => ({
        bookingId: wiersz.booking_id,
        weaponTypeId: wiersz.weapon_type_id,
        quantity: wiersz.quantity,
      })),
    }),
  }
}
