/**
 * Odwołanie Rezerwacji przez Strzelnicę. Czwarta — obok zapisu, potwierdzenia
 * i anulowania — droga, którą Rezerwacja zmienia stan, i tak samo jak tamte
 * jedyna droga do tej zmiany (ADR 0003, spec: „Zapis Rezerwacji, jej
 * potwierdzenie i anulowanie — wyłącznie przez Edge Functions").
 *
 * Pierwsza z nich, o którą prosi **konto Panelu**, a nie link z e-maila, więc
 * idzie skorupą `panelEndpoint`, a nie `tokenEndpoint`: upoważnieniem jest
 * nagłówek `Authorization`, potwierdza go GoTrue, a numer potwierdzonego konta
 * przychodzi tutaj parametrem — o to, czy Rezerwacja należy do jego
 * Strzelnicy, pyta się baza (ADR 0010). Ta funkcja pyta wyłącznie „kto",
 * nigdy „czyje".
 */
import type {
  RevocationOutcome,
  RevocationRequest,
  RevocationResult,
} from '../../../packages/shared/src/index.ts'
import {
  facilityRevocationEmail,
  MalformedRevocationRequestError,
  readRevocationRequest,
  revocationOutcome,
  revocationProblem,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'
import { wyslijPoczte } from '../_shared/poczta.ts'
import { czytajRezerwacje } from '../_shared/rezerwacja.ts'

/**
 * List do klienta z powodem odwołania — cała rzecz, po którą to odwołanie
 * istnieje: klient ma się dowiedzieć, zanim wsiądzie do samochodu.
 *
 * Niepowodzenie **nie** unieważnia odwołania: termin wrócił do puli w tej samej
 * transakcji, w której Rezerwacja zmieniła stan, a odpowiedź „nie odwołaliśmy"
 * kazałaby obsłudze odwoływać drugi raz coś, czego już nie ma. Zostaje wpis
 * w dzienniku — tak samo jak przy pozostałych listach tego modułu — a obsługa
 * widzi w Panelu Rezerwację odwołaną i ma pod ręką telefon klienta.
 *
 * Adres jest tu adresem klienta, nie skrzynką obsługi: to ona odwołuje, więc
 * powiadamiać ma kogo innego niż siebie. Kontakt Strzelnicy jedzie w treści,
 * bo klient odwołanej Rezerwacji ma dokąd zadzwonić z pytaniem „ale dlaczego".
 */
async function powiadom(client: Client, request: RevocationRequest): Promise<void> {
  const rezerwacja = await czytajRezerwacje(client, request.bookingId)

  await wyslijPoczte(
    client,
    facilityRevocationEmail({
      booking: rezerwacja.summary,
      // Powód ze żądania, a nie odczytany z wiersza: baza zapisała dokładnie
      // ten — obcięty raz, w `readRevocationRequest` — a list wychodzi
      // wyłącznie po odwołaniu, które właśnie weszło.
      reason: request.reason,
      facility: rezerwacja.facilityContact,
    }),
    { facilityId: rezerwacja.facilityId, bookingId: rezerwacja.id },
  )
}

async function handle(
  request: RevocationRequest,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Powód wymagany — i sprawdzony tą samą czystą funkcją, którą pyta Panel,
  // zanim pokaże przycisk. Serwer liczy to od nowa, bo walidacja w przeglądarce
  // jest wygodą, a nie zabezpieczeniem.
  const zastrzezenie = revocationProblem(request.reason)
  if (zastrzezenie) {
    return outcome<RevocationOutcome>({ ok: false, problem: zastrzezenie }, origin)
  }

  const odwolanie = await client.rpc('revoke_booking', {
    p_booking_id: request.bookingId,
    p_reason: request.reason,
    // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania:
    // baza pyta o jego Strzelnicę i tym warunkiem odcina cudze Rezerwacje.
    p_user_id: userId,
  })
  if (odwolanie.error) throw new Error(odwolanie.error.message)

  // Pusty wynik znaczy Rezerwację, której baza tej Strzelnicy nie przypisuje:
  // cudzą, nieistniejącą albo należącą do konta bez powiązania. Jedna
  // odpowiedź na wszystkie trzy — nazywa ją czysta funkcja.
  const wiersz = odwolanie.data?.[0]
  const result: RevocationResult | null = wiersz
    ? { status: wiersz.final_status, justRevoked: wiersz.just_revoked }
    : null

  const wynik = revocationOutcome(result)

  // Tylko pierwsze odwołanie cokolwiek zmieniło, więc tylko po nim wychodzi
  // list: drugie kliknięcie — choćby z drugiego stanowiska obsługi — nie ma
  // wysyłać klientowi drugiej wiadomości o tym samym odwołanym terminie.
  if (wynik.ok && !wynik.alreadyRevoked) {
    try {
      await powiadom(client, request)
    } catch (powod) {
      console.error(powod)
    }
  }

  return outcome<RevocationOutcome>(wynik, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Odwołanie Rezerwacji wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się odwołać Rezerwacji.',
    },
    { read: readRevocationRequest, malformed: MalformedRevocationRequestError },
    handle,
  ),
)
