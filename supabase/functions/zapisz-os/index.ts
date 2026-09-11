/**
 * Zapis Osi — nowej albo poprawionej — w imieniu konta Panelu. Szósta droga
 * zapisu tego modułu i trzecia, o którą prosi Panel, więc idzie tą samą
 * skorupą, co odwołanie Rezerwacji i Blokada (`panelEndpoint`, ADR 0003,
 * ADR 0010): tożsamość konta potwierdza GoTrue, a jego numer jedzie do bazy
 * parametrem, bo to ona rozstrzyga, czy Oś należy do jego Strzelnicy.
 *
 * Jedna funkcja na dodanie i na poprawkę, bo różnią się wyłącznie tym, czy Oś
 * już jest — a wyłączenie Osi nie jest osobną drogą wcale: jest poprawką
 * jednego pola. Osi się przy tym nie kasuje i nie ma tu czym (ADR 0013):
 * skasowana zabrałaby ze sobą Rezerwacje, które na niej stoją.
 *
 * Czego tu nie ma, a jest w `zablokuj-os`: rozstrzygania o terminie. Oś nie
 * zajmuje czasu — zajmują go dopiero jej Bloki i to, co na nich stanie.
 */
import type { LaneDraft, LaneOutcome } from '../../../packages/shared/src/index.ts'
import {
  laneProblems,
  MalformedLaneRequestError,
  readLaneRequest,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { UNIQUE_VIOLATION } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

async function handle(
  request: LaneDraft,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Nazwa i pojemność sprawdzone tą samą czystą funkcją, którą pyta Panel,
  // zanim pokaże przycisk — serwer liczy to od nowa, bo walidacja
  // w przeglądarce jest wygodą, a nie zabezpieczeniem.
  //
  // Bez listy Osi: stąd widziana byłaby listą sprzed chwili, a o jedyności
  // nazwy rozstrzyga i tak ograniczenie w schemacie — niżej. Ta sama granica,
  // co przy wyłączności Osi: sprawdzenie przed zapisem mówi, co jest nie tak,
  // a chroni dane ograniczenie (ADR 0003).
  const zastrzezenia = laneProblems({ draft: request, lanes: [] })
  if (zastrzezenia[0]) {
    return outcome<LaneOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  const zapis = await client.rpc('save_lane', {
    p_lane_id: request.id,
    p_name: request.name,
    p_capacity: request.capacity,
    p_active: request.active,
    // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania:
    // baza pyta o jego Strzelnicę i tym warunkiem odcina obce Osie.
    p_user_id: userId,
  })

  // Nazwę nosi już inna Oś tej Strzelnicy. Odmowa dziedzinowa, nie awaria:
  // obsługa ma usłyszeć zdanie i wpisać inną nazwę.
  if (zapis.error?.code === UNIQUE_VIOLATION) {
    return outcome<LaneOutcome>({ ok: false, problem: 'nazwa-zajeta' }, origin)
  }
  if (zapis.error) throw new Error(zapis.error.message)

  // Pusto znaczy Oś, której baza tej Strzelnicy nie przypisuje: obcą,
  // nieistniejącą albo należącą do konta bez powiązania. Jedna odpowiedź na
  // wszystkie trzy — rozróżnienie mówiłoby pytającemu o Osiach, których nie ma
  // prawa widzieć.
  if (!zapis.data) {
    return outcome<LaneOutcome>({ ok: false, problem: 'nieznana-os' }, origin)
  }

  return outcome<LaneOutcome>({ ok: true, id: zapis.data }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Zmiana Osi wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się zapisać Osi.',
    },
    { read: readLaneRequest, malformed: MalformedLaneRequestError },
    handle,
  ),
)
