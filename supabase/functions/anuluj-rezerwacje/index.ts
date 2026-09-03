/**
 * Anulowanie Rezerwacji przez Osobę rezerwującą. Trzecia — obok zapisu
 * i potwierdzenia — droga, którą Rezerwacja zmienia stan, i tak samo jak tamte
 * zamknięta dla klucza anonimowego (ADR 0003, spec: „Zapis Rezerwacji, jej
 * potwierdzenie i anulowanie — wyłącznie przez Edge Functions").
 *
 * Podział pracy jest tu ten sam, co przy potwierdzaniu: reguła — od kiedy jest
 * za późno — mieszka w `packages/shared` i jest tam pokryta testami, w tym na
 * granicy; zegar należy do bazy, bo to ten sam zegar, którym mierzy się
 * wygaśnięcie. Dlatego stąd jedzie do bazy **chwila domknięcia okna**, a nie
 * pytanie „czy wolno": policzone tutaj wolno-albo-nie byłoby odpowiedzią
 * z innego zegara niż zapis.
 *
 * Upoważnieniem jest token z linku i nic poza nim — jak w `pokaz-rezerwacje`,
 * i z tych samych powodów nie ma tu sprawdzenia nagłówka `Origin`; skorupa
 * żądania jest wspólna wszystkim trzem (`tokenEndpoint`, ADR 0007).
 */
import type { CancellationOutcome, CancellationResult } from '../../../packages/shared/src/index.ts'
import {
  cancellationDeadline,
  cancellationOutcome,
  clientCancellationEmail,
} from '../../../packages/shared/src/index.ts'
import { connect } from '../_shared/baza.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, tokenEndpoint } from '../_shared/http.ts'
import { wyslijPoczte } from '../_shared/poczta.ts'
import { czytajPoTokenie } from '../_shared/rezerwacja.ts'
import type { Rezerwacja } from '../_shared/rezerwacja.ts'

/**
 * Powiadomienie Strzelnicy o anulowaniu. Niepowodzenie **nie** unieważnia
 * anulowania: termin wrócił do puli w tej samej transakcji, w której Rezerwacja
 * zmieniła stan, a odpowiedź „nie anulowaliśmy" kazałaby klientowi przyjechać
 * na Oś, której już nie ma. Zostaje wpis w dzienniku.
 *
 * Strzelnica bez Adresu powiadomień nie jest konfiguracją niedokończoną: to
 * odpowiedź „nie chcę", i zostaje jej Panel.
 */
async function powiadom(client: Client, rezerwacja: Rezerwacja): Promise<void> {
  if (!rezerwacja.notificationEmail) return

  await wyslijPoczte(
    client,
    clientCancellationEmail({
      booking: rezerwacja.summary,
      to: rezerwacja.notificationEmail,
    }),
    { facilityId: rezerwacja.facilityId, bookingId: rezerwacja.id },
  )
}

Deno.serve(
  tokenEndpoint(
    {
      brakTokenu: 'Żądanie nie niesie tokenu Rezerwacji.',
      awaria: 'Nie udało się anulować Rezerwacji.',
    },
    async (token, origin) => {
      const client = connect()

      // Rezerwacja odczytana **przed** anulowaniem, i to dwa razy potrzebna:
      // z jej terminu i Okna anulowania Strzelnicy liczy się chwila domknięcia,
      // a z jej opisu — list do obsługi. Po zmianie stanu opis jest ten sam,
      // ale odczyt byłby drugim odczytem tego samego wiersza.
      const rezerwacja = await czytajPoTokenie(client, token)
      if (!rezerwacja) {
        return outcome<CancellationOutcome>({ ok: false, problem: 'link-nieznany' }, origin)
      }

      const anulowanie = await client.rpc('cancel_booking', {
        // Token, a nie odczytany przed chwilą identyfikator: to baza ma
        // sprawdzić upoważnienie, a nie przyjąć na słowo wiersz wskazany
        // przez wołającego.
        p_token: token,
        // Chwila domknięcia liczona regułą domeny z terminu tej Rezerwacji
        // i Okna anulowania jej Strzelnicy. Baza porównuje ją ze swoim zegarem.
        p_deadline: cancellationDeadline(
          rezerwacja.summary.startsAt,
          rezerwacja.cancellationWindowHours,
        ).toISOString(),
      })
      if (anulowanie.error) throw new Error(anulowanie.error.message)

      // Pusty wynik znaczy Rezerwację, której baza już nie zna — między jednym
      // zapytaniem a drugim zniknęła razem ze swoją Strzelnicą. Odpowiedź na to
      // jest ta sama, co na nieznany token, i nazywa ją czysta funkcja.
      const wiersz = anulowanie.data?.[0]
      const result: CancellationResult | null = wiersz
        ? { status: wiersz.final_status, justCancelled: wiersz.just_cancelled }
        : null

      const wynik = cancellationOutcome(result)

      // Tylko pierwsze anulowanie cokolwiek zmieniło, więc tylko po nim jest
      // o czym powiadamiać: drugie kliknięcie — choćby z drugiej karty
      // przeglądarki — nie ma wysyłać obsłudze drugiej wiadomości o tym samym
      // zwolnionym terminie.
      if (wynik.ok && !wynik.alreadyCancelled) {
        try {
          await powiadom(client, rezerwacja)
        } catch (powod) {
          console.error(powod)
        }
      }

      return outcome<CancellationOutcome>(wynik, origin)
    },
  ),
)
