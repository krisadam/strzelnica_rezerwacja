/**
 * Odwołanie Rezerwacji przez Strzelnicę. Czwarta — obok zapisu, potwierdzenia
 * i anulowania — droga, którą Rezerwacja zmienia stan, i tak samo jak tamte
 * jedyna droga do tej zmiany (ADR 0003, spec: „Zapis Rezerwacji, jej
 * potwierdzenie i anulowanie — wyłącznie przez Edge Functions").
 *
 * Pierwsza z nich, o którą prosi **konto Panelu**, a nie link z e-maila —
 * i stąd wszystko, czym różni się od tamtych trzech (ADR 0010):
 *
 * — nie ma tu `tokenEndpoint`, bo żądanie nie niesie tokenu Rezerwacji:
 *   upoważnieniem jest nagłówek `Authorization` zalogowanego Użytkownika
 *   panelu, a Rezerwacja przychodzi numerem;
 * — ten nagłówek trzeba potwierdzić, i robi to GoTrue (`auth.getUser`).
 *   Numer konta, które z niego wyszło, jedzie do bazy parametrem, bo to ona
 *   rozstrzyga, czy Rezerwacja należy do jego Strzelnicy. Ta funkcja pyta
 *   wyłącznie „kto", nigdy „czyje".
 *
 * Sprawdzenia nagłówka `Origin` nie ma i tutaj — z innego powodu niż przy
 * linkach. Tam nie było ciasteczka, którym dałoby się posłużyć z obcej strony;
 * tu upoważnienie jedzie nagłówkiem, którego obca strona nie dołoży z siebie,
 * a mając go, nie zatrzymałaby jej i lista domen.
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
import { connect } from '../_shared/baza.ts'
import type { Client } from '../_shared/baza.ts'
import { corsHeaders, json, outcome } from '../_shared/http.ts'
import { wyslijPoczte } from '../_shared/poczta.ts'
import { czytajRezerwacje } from '../_shared/rezerwacja.ts'

/**
 * Odmowa dla żądania bez konta Panelu. Kod spoza dwustu, bo nie jest to wynik
 * dziedzinowy: nie rozpatrzyliśmy żądania o Rezerwację, bo nie wiadomo, kto
 * pyta.
 */
const BEZ_KONTA = 'Odwołanie Rezerwacji wymaga zalogowania do Panelu.'

/** Token z nagłówka `Authorization`; `null` znaczy nagłówek bez schematu Bearer. */
function bearer(authorization: string | null): string | null {
  const [schemat, token] = (authorization ?? '').split(' ')
  if (schemat?.toLowerCase() !== 'bearer' || !token?.trim()) return null
  return token.trim()
}

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
  authorization: string | null,
  origin: string | null,
): Promise<Response> {
  const client = connect()

  // Kto pyta — i to jest jedyne pytanie, które ta funkcja rozstrzyga sama.
  // Stoi przed wszystkimi innymi, bo żądaniu bez konta nie należy się nawet
  // odpowiedź o powodzie: nie wiemy, komu byśmy jej udzielili.
  const token = bearer(authorization)
  if (!token) return json({ error: BEZ_KONTA }, 401, origin)

  const konto = await client.auth.getUser(token)
  if (konto.error || !konto.data.user) return json({ error: BEZ_KONTA }, 401, origin)

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
    p_user_id: konto.data.user.id,
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

/**
 * Skorupa własna, nie `tokenEndpoint`: tamta czyta z żądania token Rezerwacji
 * i nic poza nim, a tutaj przychodzi numer Rezerwacji z powodem, a upoważnienie
 * stoi w nagłówku. Kształt ten sam, co w `zloz-rezerwacje` — drugiej funkcji
 * z treścią żądania: `OPTIONS` na zapytanie wstępne, `POST` z ciałem, wynik
 * dziedzinowy z kodem 200 i nic poza tym.
 */
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') return json({ error: 'Metoda nieobsługiwana.' }, 405, origin)

  let request: RevocationRequest
  try {
    request = readRevocationRequest(await req.json().catch(() => null))
  } catch (powod) {
    if (powod instanceof MalformedRevocationRequestError) {
      return json({ error: powod.message }, 400, origin)
    }
    throw powod
  }

  try {
    return await handle(request, req.headers.get('Authorization'), origin)
  } catch (powod) {
    console.error(powod)
    return json({ error: 'Nie udało się odwołać Rezerwacji.' }, 500, origin)
  }
})
