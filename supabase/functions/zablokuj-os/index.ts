/**
 * Wprowadzenie Blokady Osi. Piąta droga zapisu tego modułu i druga, o którą
 * prosi **konto Panelu**, a nie link z e-maila — więc idzie tą samą skorupą,
 * co odwołanie Rezerwacji (`panelEndpoint`, ADR 0003, ADR 0010): tożsamość
 * konta potwierdza GoTrue, a jego numer jedzie do bazy parametrem, bo to ona
 * rozstrzyga, czy Oś należy do jego Strzelnicy.
 *
 * Czego tu nie ma, a jest w `odwolaj-rezerwacje`: listu. Blokada nie ma Osoby
 * rezerwującej, więc nie ma komu go wysłać — Oś wyłączona ze sprzedaży jest
 * sprawą między Strzelnicą a jej grafikiem. Klient widzi sam brak terminu,
 * i to jest wszystko, co ma z Blokady widzieć.
 *
 * Czego tu nie ma, a jest w `zloz-rezerwacje`: liczenia dostępności. Blokada
 * nie wybiera się z opublikowanych Bloków — bierze dowolny zakres czasu,
 * a jedynym warunkiem jest wolna Oś, o czym rozstrzyga zapis pod blokadą
 * doradczą.
 */
import type { ClosureOutcome, ClosureRequest } from '../../../packages/shared/src/index.ts'
import {
  closureProblems,
  MalformedClosureRequestError,
  readClosureRequest,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

/** Naruszenie ograniczenia wyłączności Osi w Postgresie — Blokada na Blokadę. */
const EXCLUSION_VIOLATION = '23P01'

/** Zderzenie Blokady z Rezerwacją; własny SQLSTATE wyzwalaczy wyłączności. */
const CLOSURE_CONFLICT = 'LC001'

async function handle(
  request: ClosureRequest,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Zakres i powód sprawdzone tą samą czystą funkcją, którą pyta Panel, zanim
  // pokaże przycisk — serwer liczy to od nowa, bo walidacja w przeglądarce jest
  // wygodą, a nie zabezpieczeniem. Bez zajętości: tę zna wyłącznie zapis, a stąd
  // widziana byłaby zajętością sprzed chwili.
  const zastrzezenia = closureProblems({ draft: request, occupancies: [] })
  if (zastrzezenia[0]) {
    return outcome<ClosureOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  const zapis = await client.rpc('place_closure', {
    p_lane_id: request.laneId,
    p_starts_at: request.startsAt.toISOString(),
    p_ends_at: request.endsAt.toISOString(),
    p_reason: request.reason,
    // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania:
    // baza pyta o jego Strzelnicę i tym warunkiem odcina obce Osie.
    p_user_id: userId,
  })

  // Termin czyjś — Rezerwacji albo innej Blokady. Jedna odpowiedź na oba
  // przypadki, bo dla obsługi znaczą to samo: tej Osi w tym czasie nie ma czym
  // wyłączyć, dopóki stoi na niej coś innego. Rezerwację trzeba wcześniej
  // odwołać, żeby klient dowiedział się listem, a nie zastał zamknięte.
  if (zapis.error?.code === CLOSURE_CONFLICT || zapis.error?.code === EXCLUSION_VIOLATION) {
    return outcome<ClosureOutcome>({ ok: false, problem: 'termin-zajety' }, origin)
  }
  if (zapis.error) throw new Error(zapis.error.message)

  // Pusto znaczy Oś, której baza tej Strzelnicy nie przypisuje: obcą,
  // nieistniejącą albo należącą do konta bez powiązania. Jedna odpowiedź na
  // wszystkie trzy — rozróżnienie mówiłoby pytającemu o Osiach, których nie ma
  // prawa widzieć.
  if (!zapis.data) {
    return outcome<ClosureOutcome>({ ok: false, problem: 'nieznana-os' }, origin)
  }

  return outcome<ClosureOutcome>({ ok: true, id: zapis.data }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Blokada Osi wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się wprowadzić Blokady.',
    },
    { read: readClosureRequest, malformed: MalformedClosureRequestError },
    handle,
  ),
)
