/**
 * Zapis rozkładu Bloków: cały tydzień jednej Osi naraz. Siódma droga zapisu
 * tego modułu i czwarta, o którą prosi Panel, więc idzie tą samą skorupą, co
 * Blokada i zapis Osi (`panelEndpoint`, ADR 0003, ADR 0010).
 *
 * Tydzień, a nie pojedynczy Blok (ADR 0013): dopisanie Bloku, skasowanie
 * Bloku, skopiowanie dnia na sześć innych i skopiowanie rozkładu Osi na drugą
 * są wtedy jednym żądaniem i jednym zapisem — a zastrzeżenia liczą się raz, na
 * tym, co po zapisie zostanie. Kopiowania nie ma tu więc wcale: układa je Panel
 * czystymi funkcjami (`copyDay`, `laneWeek`), a tu przychodzi jego wynik.
 *
 * Czego tu nie ma, a jest w `zablokuj-os`: rozstrzygania o zajętym terminie.
 * Rozkład nie zajmuje Osi — mówi tylko, czego Strzelnica na niej nie sprzedaje.
 * Rezerwacje, które na niej stoją, zostają nietknięte i nie są tu żadnym
 * warunkiem: Rezerwacja niesie własny termin i o rozkład nie pyta nikogo po
 * tym, jak powstała.
 */
import type { ScheduleOutcome, ScheduleRequest } from '../../../packages/shared/src/index.ts'
import {
  MalformedScheduleRequestError,
  readScheduleRequest,
  scheduleProblems,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

async function handle(
  request: ScheduleRequest,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Siatka Slotów i zachodzenie Bloków sprawdzone tą samą czystą funkcją, którą
  // pyta Panel, zanim pokaże przycisk — serwer liczy to od nowa, bo walidacja
  // w przeglądarce jest wygodą, a nie zabezpieczeniem. Sprawdzenie obejmuje
  // cały tydzień, a nie zmieniony dzień: Blok przeciągnięty przez północ
  // zachodzi na dzień następny, więc dzień oglądany osobno kłamałby o sobie.
  const zastrzezenia = scheduleProblems(request.week)
  if (zastrzezenia[0]) {
    return outcome<ScheduleOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  const zapis = await client.rpc('set_lane_schedule', {
    p_lane_id: request.laneId,
    // Nazwy kolumn tabeli, a nie pól `ScheduleBlock`: `jsonb_to_recordset`
    // zestawia klucze z nazwami kolumn dosłownie. Przełożenie pojęcia domeny
    // na wiersz należy do brzegu — tak samo jak `…FromRow` w drugą stronę.
    p_week: request.week.map((block) => ({
      weekday: block.weekday,
      start_minute: block.startMinute,
      duration_minutes: block.durationMinutes,
    })),
    // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania:
    // baza pyta o jego Strzelnicę i tym warunkiem odcina obce Osie.
    p_user_id: userId,
  })

  if (zapis.error) throw new Error(zapis.error.message)

  // Pusto znaczy Oś, której baza tej Strzelnicy nie przypisuje: obcą,
  // nieistniejącą albo należącą do konta bez powiązania. Jedna odpowiedź na
  // wszystkie trzy — rozróżnienie mówiłoby pytającemu o Osiach, których nie ma
  // prawa widzieć.
  if (zapis.data !== true) {
    return outcome<ScheduleOutcome>({ ok: false, problem: 'nieznana-os' }, origin)
  }

  return outcome<ScheduleOutcome>({ ok: true }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Zmiana rozkładu wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się zapisać rozkładu.',
    },
    { read: readScheduleRequest, malformed: MalformedScheduleRequestError },
    handle,
  ),
)
