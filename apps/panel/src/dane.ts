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
import type { Lane, PanelBooking, PanelWindow } from '@strzelnica/shared'
import {
  laneFromRow,
  panelBookingsFromRows,
  panelWindow,
  rowsOrThrow,
  zonedMinuteToInstant,
} from '@strzelnica/shared'
import type { PanelClient } from './supabase.js'

/**
 * Strzelnica w kształcie, jakiego Panel potrzebuje dziś: nazwa, zegar,
 * horyzont. Bez identyfikatora — odkąd zawężenie po Strzelnicy należy do bazy,
 * nie ma zapytania, które by go potrzebowało.
 */
export type Strzelnica = {
  name: string
  timeZone: string
  /** Horyzont rezerwacji — stąd bierze się dalszy koniec okna odczytu. */
  horizonDays: number
}

export type Dane = {
  facility: Strzelnica
  lanes: Lane[]
  bookings: PanelBooking[]
  /** Zakres dni, z którego te Rezerwacje pochodzą — i poza który ekran nie pyta. */
  okno: PanelWindow
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

async function strzelnicaUzytkownika(client: PanelClient): Promise<Strzelnica> {
  // Zapytanie bez warunku o jedną Strzelnicę: polityka `facilities` wpuszcza
  // zalogowane konto do dokładnie jednego wiersza — tego, na który wskazuje
  // jego powiązanie. Pytanie „czyj jest ten Panel" i pytanie „jaka to
  // Strzelnica" mają więc jedną odpowiedź i jeden odczyt; osobny odczyt
  // `panel_users` po sam identyfikator byłby tym samym pytaniem zadanym dwa
  // razy, a jego wynik i tak trafiłby do warunku, który RLS stawia sama.
  //
  // Pusto znaczy konto bez Strzelnicy — zdarza się między założeniem konta
  // a wpisem w `panel_users`. Pusty wynik jest tu odpowiedzią, a nie błędem
  // zapytania, więc pytamy o listę i patrzymy na jej pierwszy wiersz, zamiast
  // żądać dokładnie jednego.
  const [row] = rowsOrThrow(
    await client.from('facilities').select('name, timezone, booking_horizon_days'),
  )
  if (!row) throw new BrakStrzelnicyError()

  return {
    name: row.name,
    timeZone: row.timezone,
    horizonDays: row.booking_horizon_days,
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
 */
export async function wczytajDane(client: PanelClient, now: Date): Promise<Dane> {
  const facility = await strzelnicaUzytkownika(client)
  const okno = panelWindow({
    timeZone: facility.timeZone,
    horizonDays: facility.horizonDays,
    now,
  })

  const od = zonedMinuteToInstant(okno.from, 0, facility.timeZone).toISOString()
  // Koniec okna jest dniem włącznie, więc granica stoi o północy, która ten
  // dzień domyka: minuta 1440 dnia `okno.to`, liczona tak samo jak Blok
  // przecinający granicę doby. Bez tego Rezerwacje ostatniego dnia horyzontu
  // wypadłyby z okna, choć są jego końcem.
  const doPolnocy = zonedMinuteToInstant(okno.to, 1440, facility.timeZone).toISOString()

  const [lanes, bookings, rentals, ammunition, weaponTypes, ammunitionKinds] =
    await Promise.all([
      client.from('lanes').select('*').order('name'),
      client
        .from('panel_bookings')
        .select('*')
        .gte('starts_at', od)
        .lt('starts_at', doPolnocy)
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
      client.from('weapon_types').select('id, name'),
      client.from('ammunition_kinds').select('id, name'),
    ])

  const osie = rowsOrThrow(lanes)

  return {
    facility,
    okno,
    lanes: osie.map(laneFromRow),
    bookings: panelBookingsFromRows({
      bookings: rowsOrThrow(bookings),
      facility: { name: facility.name, timezone: facility.timeZone },
      lanes: osie,
      rentals: rowsOrThrow(rentals),
      ammunition: rowsOrThrow(ammunition),
      weaponTypes: rowsOrThrow(weaponTypes),
      ammunitionKinds: rowsOrThrow(ammunitionKinds),
    }),
  }
}
