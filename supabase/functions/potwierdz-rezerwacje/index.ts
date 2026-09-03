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
 * Skorupa żądania — metody, nagłówki i odczyt tokenu — jest wspólna dla
 * wszystkich funkcji otwieranych linkiem; stąd `tokenEndpoint`. Tam też stoi
 * powód, dla którego nie ma tu sprawdzenia nagłówka `Origin` (ADR 0007).
 */
import type { ConfirmationOutcome, ConfirmationResult } from '../../../packages/shared/src/index.ts'
import {
  bookingSummaryEmail,
  confirmationOutcome,
  facilityNotificationEmail,
  managementUrl,
} from '../../../packages/shared/src/index.ts'
import { connect } from '../_shared/baza.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, tokenEndpoint } from '../_shared/http.ts'
import { wyslijPoczte } from '../_shared/poczta.ts'
import { czytajRezerwacje } from '../_shared/rezerwacja.ts'
import { widgetOrigin } from '../_shared/srodowisko.ts'

/**
 * Wysłanie obu listów po potwierdzeniu. Niepowodzenie **nie** unieważnia
 * potwierdzenia — inaczej niż przy zapisie, gdzie list z linkiem był jedynym,
 * co czyniło Rezerwację trwałą. Tutaj Rezerwacja już stoi, a odpowiedź „nie
 * potwierdziliśmy" byłaby wprost nieprawdziwa i kazałaby klientowi klikać
 * link, który przecież zadziałał. Zostaje wpis w dzienniku.
 *
 * Każdy list ma własne niepowodzenie, bo jeden nie zależy od drugiego:
 * odrzucony adres klienta nie ma zabierać Strzelnicy wiadomości o Rezerwacji —
 * a to właśnie ten przypadek, w którym klient nie ma swojej kopii i zadzwoni.
 */
async function powiadom(client: Client, bookingId: string): Promise<void> {
  const rezerwacja = await czytajRezerwacje(client, bookingId)

  const messages = [
    bookingSummaryEmail({
      booking: rezerwacja.summary,
      url: managementUrl({
        widgetOrigin: widgetOrigin(),
        facilitySlug: rezerwacja.facilitySlug,
        token: rezerwacja.managementToken,
      }),
    }),
  ]

  // Strzelnica bez adresu powiadomień nie jest konfiguracją niedokończoną:
  // to odpowiedź „nie chcę", i zostaje jej Panel.
  if (rezerwacja.notificationEmail) {
    messages.push(
      facilityNotificationEmail({
        booking: rezerwacja.summary,
        to: rezerwacja.notificationEmail,
      }),
    )
  }

  for (const message of messages) {
    try {
      await wyslijPoczte(client, message, {
        facilityId: rezerwacja.facilityId,
        bookingId,
      })
    } catch (powod) {
      console.error(powod)
    }
  }
}

Deno.serve(
  tokenEndpoint(
    {
      brakTokenu: 'Żądanie nie niesie tokenu potwierdzającego.',
      awaria: 'Nie udało się potwierdzić Rezerwacji.',
    },
    async (token, origin) => {
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

      // Tylko pierwsze wejście w link cokolwiek zmieniło, więc tylko po nim
      // jest o czym powiadamiać. Drugie kliknięcie nie ma wysyłać drugiego
      // kompletu listów — ani klientowi, ani Strzelnicy. Zebranie wierszy też
      // może paść; ono również nie ma prawa odwołać potwierdzenia.
      if (wynik.ok && !wynik.alreadyConfirmed && wiersz) {
        try {
          await powiadom(client, wiersz.booking_id)
        } catch (powod) {
          console.error(powod)
        }
      }

      return outcome<ConfirmationOutcome>(wynik, origin)
    },
  ),
)
