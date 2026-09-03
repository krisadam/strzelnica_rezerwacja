/**
 * Odczyt jednej Rezerwacji ze wszystkim, czego funkcje potrzebują, żeby o niej
 * mówić: opisem na piśmie, stanem, oknem anulowania i kontaktami obu stron.
 *
 * Jedna kopia dla trzech funkcji — potwierdzenia, podglądu i anulowania —
 * bo wszystkie trzy zadają bazie dokładnie to samo pytanie: „co to za
 * Rezerwacja". Trzy kopie tego zapytania rozjechałyby się przy pierwszej
 * kolumnie dołożonej do opisu, a rozjazd znaczyłby list z inną listą sprzętu
 * niż ekran.
 *
 * Dwa wejścia, bo dwie drogi do tego samego wiersza: potwierdzenie zna już
 * identyfikator Rezerwacji — odesłała je funkcja bazodanowa, która ją
 * potwierdziła — a ekran własnej Rezerwacji zna wyłącznie token z adresu.
 *
 * Przejście z wierszy na pojęcia domeny należy do `packages/shared` i tam się
 * odbywa; tutaj zostaje samo zebranie wierszy.
 */
import type {
  BookingSummary,
  Database,
  FacilityContact,
} from '../../../packages/shared/src/index.ts'
import {
  bookingSummaryFromRows,
  facilityContactFromRow,
  rowsOrThrow,
} from '../../../packages/shared/src/index.ts'
import type { Client } from './baza.ts'

type BookingStatus = Database['public']['Enums']['booking_status']

/** Rezerwacja w kształcie, w jakim potrzebują jej funkcje mówiące o niej. */
export type Rezerwacja = {
  id: string
  facilityId: string
  /** Slug Strzelnicy — z niego składa się link do zarządzania. */
  facilitySlug: string
  status: BookingStatus
  /** Okno anulowania Strzelnicy, w godzinach; regułę liczy `packages/shared`. */
  cancellationWindowHours: number
  managementToken: string
  /** Adres powiadomień Strzelnicy; puste znaczy Strzelnicę, która ich nie chce. */
  notificationEmail: string | null
  /** Kontakt, który Strzelnica podaje klientom — inny niż skrzynka obsługi. */
  facilityContact: FacilityContact
  /** Opis na piśmie: ten sam, który jedzie w listach i na ekran. */
  summary: BookingSummary
}

/** Kolumny Rezerwacji, z których powstaje jej opis. Wypisane raz, dla obu wejść. */
const KOLUMNY_REZERWACJI =
  'id, facility_id, lane_id, status, starts_at, ends_at, participants, has_permit, ' +
  'with_instructor, amount_gr, contact_name, contact_email, contact_phone, management_token'

type WierszRezerwacji = Awaited<ReturnType<typeof czytajWiersz>>

function czytajWiersz(client: Client, bookingId: string) {
  return client
    .from('bookings')
    .select(KOLUMNY_REZERWACJI)
    .eq('id', bookingId)
    .single()
    .then(({ data, error }) => {
      if (error) throw new Error(error.message)
      return data
    })
}

/**
 * Wszystko o jednej Rezerwacji, dobrane do jej wiersza. Zapytania są osobne,
 * a nie jedno zagnieżdżone: schemat wiąże pozycje Rezerwacji z katalogami
 * kluczem złożonym (pozycja, Strzelnica), a stąd potrzebna jest z nich tylko
 * nazwa.
 */
async function opisz(client: Client, booking: WierszRezerwacji): Promise<Rezerwacja> {
  const [facility, lane, rentals, ammunition, weaponTypes, ammunitionKinds] = await Promise.all([
    client
      .from('facilities')
      .select(
        'slug, name, timezone, cancellation_window_hours, notification_email, ' +
          'contact_email, contact_phone',
      )
      .eq('id', booking.facility_id)
      .single(),
    client.from('lanes').select('name').eq('id', booking.lane_id).single(),
    client.from('weapon_rentals').select('weapon_type_id, quantity').eq('booking_id', booking.id),
    client
      .from('ammunition_demands')
      .select('ammunition_kind_id, quantity')
      .eq('booking_id', booking.id),
    client.from('weapon_types').select('id, name').eq('facility_id', booking.facility_id),
    client.from('ammunition_kinds').select('id, name').eq('facility_id', booking.facility_id),
  ])

  if (facility.error) throw new Error(facility.error.message)
  if (lane.error) throw new Error(lane.error.message)

  return {
    id: booking.id,
    facilityId: booking.facility_id,
    facilitySlug: facility.data.slug,
    status: booking.status,
    cancellationWindowHours: facility.data.cancellation_window_hours,
    managementToken: booking.management_token,
    notificationEmail: facility.data.notification_email,
    facilityContact: facilityContactFromRow(facility.data),
    summary: bookingSummaryFromRows({
      booking,
      facility: facility.data,
      lane: lane.data,
      rentals: rowsOrThrow(rentals),
      ammunition: rowsOrThrow(ammunition),
      weaponTypes: rowsOrThrow(weaponTypes),
      ammunitionKinds: rowsOrThrow(ammunitionKinds),
    }),
  }
}

/** Rezerwacja o znanym identyfikatorze — tak wchodzi tu potwierdzenie adresu. */
export async function czytajRezerwacje(client: Client, bookingId: string): Promise<Rezerwacja> {
  return opisz(client, await czytajWiersz(client, bookingId))
}

/**
 * Rezerwacja wskazana tokenem linku do zarządzania. `null` znaczy token,
 * którego baza nie zna — a to jest odpowiedź o zgłoszeniu, nie awaria.
 *
 * Szukanie po tokenie, a nie po identyfikatorze Rezerwacji: identyfikator
 * wraca do przeglądarki na ekranie potwierdzenia, więc adres liczony z niego
 * otwierałby cudzą Rezerwację każdemu, kto podstawi swój (ADR 0007).
 */
export async function czytajPoTokenie(
  client: Client,
  token: string,
): Promise<Rezerwacja | null> {
  const { data, error } = await client
    .from('bookings')
    .select(KOLUMNY_REZERWACJI)
    .eq('management_token', token)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return opisz(client, data)
}
