/**
 * Potwierdzenie adresu e-mail. Druga — obok zapisu — droga, którą Rezerwacja
 * zmienia stan, i tak samo jak tamta zamknięta dla klucza anonimowego: tabela
 * `bookings` nie ma żadnej polityki RLS (ADR 0003), a `confirm_booking` ma
 * odebrane prawo wykonania wszystkim poza rolą serwisową.
 *
 * Cała zmiana stanu dzieje się w bazie, w jednej transakcji i pod blokadą
 * doradczą na Strzelnicę: to tam jest jeden zegar, którym mierzy się
 * wygaśnięcie, i jedna kolejka, w której potwierdzenie mija się z cudzym
 * zgłoszeniem na ten sam termin. Tutaj zostaje przetłumaczenie odpowiedzi bazy
 * na zdanie dla Osoby rezerwującej — czystą funkcją, tą samą, którą testuje
 * `packages/shared` — oraz wysłanie dwóch powiadomień.
 *
 * Powiadomienia wychodzą **stąd**, a nie z zapisu: dopiero potwierdzony adres
 * znaczy Rezerwację, która stoi. Podsumowanie wysłane przy złożeniu
 * obiecywałoby termin wracający za pół godziny do puli, a Strzelnica
 * przygotowywałaby sprzęt dla gościa, którego nie ma.
 *
 * Czego tu **nie ma**: sprawdzenia nagłówka `Origin`. Przy zapisie jest ono
 * bramką, bo tam o zapis prosi cudza strona w imieniu swojego gościa. Tutaj
 * jedynym upoważnieniem jest token z e-maila — nie ma ciasteczka ani sesji,
 * które dałoby się wykorzystać z obcej strony, więc lista domen niczego by nie
 * zamknęła. Zobacz ADR 0007.
 */
import type {
  ConfirmationOutcome,
  ConfirmationResult,
  MailMessage,
} from '../../../packages/shared/src/index.ts'
import {
  bookingSummaryEmail,
  bookingSummaryFromRows,
  confirmationOutcome,
  facilityNotificationEmail,
  managementUrl,
  rowsOrThrow,
} from '../../../packages/shared/src/index.ts'
import { connect } from '../_shared/baza.ts'
import type { Client } from '../_shared/baza.ts'
import { corsHeaders, json, outcome } from '../_shared/http.ts'
import { wyslijPoczte } from '../_shared/poczta.ts'
import type { MailContext } from '../_shared/poczta.ts'
import { widgetOrigin } from '../_shared/srodowisko.ts'

/** Token ze zgłoszenia albo `null`, gdy żądanie w ogóle go nie niesie. */
function readToken(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const token = (value as Record<string, unknown>).token
  if (typeof token !== 'string' || token.trim() === '') return null
  return token.trim()
}

/**
 * Listy do wysłania po potwierdzeniu, złożone z tego, co leży w bazie.
 * Przejście z wierszy na pojęcia domeny i z pojęć na zdania należy do
 * `packages/shared`; tutaj zostaje samo zebranie wierszy.
 *
 * Zapytania są osobne, a nie jedno zagnieżdżone: schemat wiąże pozycje
 * Rezerwacji z katalogami kluczem złożonym (pozycja, Strzelnica), a stąd
 * potrzebna jest z nich tylko nazwa.
 */
async function listy(
  client: Client,
  bookingId: string,
): Promise<{ messages: MailMessage[]; context: MailContext }> {
  const { data: booking, error } = await client
    .from('bookings')
    .select(
      'facility_id, lane_id, starts_at, ends_at, participants, has_permit, with_instructor, ' +
        'amount_gr, contact_name, contact_email, contact_phone, management_token',
    )
    .eq('id', bookingId)
    .single()

  if (error) throw new Error(error.message)

  const [facility, lane, rentals, ammunition, weaponTypes, ammunitionKinds] = await Promise.all([
    client
      .from('facilities')
      .select('slug, name, timezone, notification_email')
      .eq('id', booking.facility_id)
      .single(),
    client.from('lanes').select('name').eq('id', booking.lane_id).single(),
    client.from('weapon_rentals').select('weapon_type_id, quantity').eq('booking_id', bookingId),
    client
      .from('ammunition_demands')
      .select('ammunition_kind_id, quantity')
      .eq('booking_id', bookingId),
    client.from('weapon_types').select('id, name').eq('facility_id', booking.facility_id),
    client.from('ammunition_kinds').select('id, name').eq('facility_id', booking.facility_id),
  ])

  if (facility.error) throw new Error(facility.error.message)
  if (lane.error) throw new Error(lane.error.message)

  const summary = bookingSummaryFromRows({
    booking,
    facility: facility.data,
    lane: lane.data,
    rentals: rowsOrThrow(rentals),
    ammunition: rowsOrThrow(ammunition),
    weaponTypes: rowsOrThrow(weaponTypes),
    ammunitionKinds: rowsOrThrow(ammunitionKinds),
  })

  const messages = [
    bookingSummaryEmail({
      booking: summary,
      url: managementUrl({
        widgetOrigin: widgetOrigin(),
        facilitySlug: facility.data.slug,
        token: booking.management_token,
      }),
    }),
  ]

  // Strzelnica bez adresu powiadomień nie jest konfiguracją niedokończoną:
  // to odpowiedź „nie chcę", i zostaje jej Panel.
  const facilityEmail = facility.data.notification_email
  if (facilityEmail) {
    messages.push(facilityNotificationEmail({ booking: summary, to: facilityEmail }))
  }

  return { messages, context: { facilityId: booking.facility_id, bookingId } }
}

/**
 * Wysłanie obu listów. Niepowodzenie **nie** unieważnia potwierdzenia —
 * inaczej niż przy zapisie, gdzie list z linkiem był jedynym, co czyniło
 * Rezerwację trwałą. Tutaj Rezerwacja już stoi, a odpowiedź „nie
 * potwierdziliśmy" byłaby wprost nieprawdziwa i kazałaby klientowi klikać
 * link, który przecież zadziałał. Zostaje wpis w dzienniku.
 *
 * Każdy list ma własne niepowodzenie, bo jeden nie zależy od drugiego:
 * odrzucony adres klienta nie ma zabierać Strzelnicy wiadomości o Rezerwacji —
 * a to właśnie ten przypadek, w którym klient nie ma swojej kopii i zadzwoni.
 */
async function powiadom(client: Client, bookingId: string): Promise<void> {
  const { messages, context } = await listy(client, bookingId)

  for (const message of messages) {
    try {
      await wyslijPoczte(client, message, context)
    } catch (powod) {
      console.error(powod)
    }
  }
}

async function handle(token: string, origin: string | null): Promise<Response> {
  const client = connect()

  const { data, error } = await client.rpc('confirm_booking', { p_token: token })
  if (error) throw new Error(error.message)

  // Pusty wynik znaczy token, którego baza nie zna — a to jest odpowiedź
  // o zgłoszeniu, nie awaria. `confirmationOutcome` nazywa ją po polsku.
  const wiersz = data?.[0]
  const result: ConfirmationResult | null = wiersz
    ? { status: wiersz.final_status, justConfirmed: wiersz.just_confirmed }
    : null

  const wynik = confirmationOutcome(result)

  // Tylko pierwsze wejście w link cokolwiek zmieniło, więc tylko po nim jest
  // o czym powiadamiać. Drugie kliknięcie nie ma wysyłać drugiego kompletu
  // listów — ani klientowi, ani Strzelnicy. Zebranie wierszy też może paść;
  // ono również nie ma prawa odwołać potwierdzenia.
  if (wynik.ok && !wynik.alreadyConfirmed && wiersz) {
    try {
      await powiadom(client, wiersz.booking_id)
    } catch (powod) {
      console.error(powod)
    }
  }

  return outcome<ConfirmationOutcome>(wynik, origin)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') return json({ error: 'Metoda nieobsługiwana.' }, 405, origin)

  const token = readToken(await req.json().catch(() => null))
  if (!token) return json({ error: 'Żądanie nie niesie tokenu potwierdzającego.' }, 400, origin)

  try {
    return await handle(token, origin)
  } catch (powod) {
    console.error(powod)
    return json({ error: 'Nie udało się potwierdzić Rezerwacji.' }, 500, origin)
  }
})
