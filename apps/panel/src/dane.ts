/**
 * Pobranie wszystkiego, co Panel pokazuje o Rezerwacjach. Jedno zapytanie na
 * tabelę; układaniem zajmują się czyste funkcje z `@strzelnica/shared`, tutaj
 * jest wyłącznie odczyt i przepisanie wierszy — siostrzane wobec `grafik.ts`
 * w Widgecie i z tego samego powodu płytkie.
 *
 * Warunek na Strzelnicę stoi przy jednych zapytaniach, a przy innych nie —
 * i jest to różnica, nie niekonsekwencja. Rezerwacje i ich pozycje niosą dane
 * osobowe, więc odcina je baza: widok `panel_bookings` własnym warunkiem,
 * pozycje politykami RLS. Warunek dopisany tu do nich byłby drugą granicą —
 * a druga granica to ta, o której się zapomina.
 *
 * Osie i katalogi są ofertą i czyta je anonimowo każdy Widget, więc RLS
 * wpuszcza tam do wierszy **wszystkich** Strzelnic. Ich zawężenie należy do
 * wołającego — tak samo jak w Widgecie.
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

/** Strzelnica w kształcie, jakiego Panel potrzebuje dziś: nazwa, zegar, horyzont. */
export type Strzelnica = {
  id: string
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
  // Wierszy jest najwyżej jeden — kluczem głównym `panel_users` jest konto —
  // a przy koncie bez powiązania nie ma żadnego. Pusty wynik jest tu
  // odpowiedzią, a nie błędem zapytania, więc pytamy o listę i patrzymy na jej
  // pierwszy wiersz, zamiast żądać dokładnie jednego.
  const [powiazanie] = rowsOrThrow(await client.from('panel_users').select('facility_id'))
  if (!powiazanie) throw new BrakStrzelnicyError()

  const [row] = rowsOrThrow(
    await client
      .from('facilities')
      .select('id, name, timezone, booking_horizon_days')
      .eq('id', powiazanie.facility_id),
  )
  // Powiązanie wskazuje Strzelnicę kluczem obcym, więc wiersza nie może nie
  // być — chyba że polityki `facilities` przestały wpuszczać Panel. Wtedy pusty
  // kalendarz kłamałby, że Strzelnica nie ma Rezerwacji.
  if (!row) throw new BrakStrzelnicyError()

  return {
    id: row.id,
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
      client.from('lanes').select('*').eq('facility_id', facility.id).order('name'),
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
      client.from('weapon_types').select('id, name').eq('facility_id', facility.id),
      client.from('ammunition_kinds').select('id, name').eq('facility_id', facility.id),
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
