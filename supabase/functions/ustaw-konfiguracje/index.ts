/**
 * Zapis konfiguracji Strzelnicy: stawki wspólne, Pula instruktorów i trzy
 * reguły czasowe — wszystko naraz. Dziesiąta droga zapisu tego modułu i siódma,
 * o którą prosi Panel, więc idzie tą samą skorupą, co zapis Osi, rozkład,
 * godziny i katalogi (`panelEndpoint`, ADR 0003, ADR 0010): tożsamość konta
 * potwierdza GoTrue, a jego numer jedzie do bazy parametrem, bo to ona
 * rozstrzyga, o której Strzelnicy mowa.
 *
 * Sześć wartości jednym żądaniem, tak samo jak tydzień godzin otwarcia idzie
 * w całości: to jeden formularz i jeden przycisk, więc nie ma chwili, w której
 * Strzelnica ma nową Pulę i stary horyzont. Zgłoszenie składane w tej samej
 * chwili widzi konfigurację sprzed zmiany albo po niej, nigdy w połowie.
 *
 * Strzelnicy nie ma w żądaniu i nie jest to przeoczenie: konfiguracja jest jej
 * własnością, a o tym, czyja jest, pyta bazę `panel_facility_of` po numerze
 * potwierdzonego konta — nie ma tu czego podstawić z palca. Ta sama decyzja,
 * co przy `ustaw-godziny`; stawka za Blok jedzie osobno, razem z Osią
 * (`zapisz-os`), bo należy do Osi, a nie do Strzelnicy.
 *
 * Czego tu nie ma, choć Panel to pokazuje: przekroczeń Puli instruktorów. Pula
 * zmniejszona poniżej tego, co obiecano, jest decyzją Strzelnicy — ktoś
 * odchodzi, ktoś choruje — a Rezerwacja niesie własną obecność Instruktora
 * i o Pulę nie pyta nikogo po tym, jak powstała. Przekroczenia **wskazuje**
 * ekran (`instructorOverruns`), a rozstrzyga człowiek: Odwołaniem z powodem
 * albo wcale.
 */
import type {
  FacilityConfigDraft,
  FacilityConfigOutcome,
} from '../../../packages/shared/src/index.ts'
import {
  facilityConfigProblems,
  MalformedFacilityConfigRequestError,
  readFacilityConfigRequest,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

async function handle(
  request: FacilityConfigDraft,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Stawki, Pula i reguły sprawdzone tą samą czystą funkcją, którą pyta Panel,
  // zanim pokaże przycisk — serwer liczy to od nowa, bo walidacja
  // w przeglądarce jest wygodą, a nie zabezpieczeniem.
  const zastrzezenia = facilityConfigProblems(request)
  if (zastrzezenia[0]) {
    return outcome<FacilityConfigOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  const zapis = await client.rpc('set_facility_configuration', {
    p_instructor_pool: request.instructorPool,
    p_participation_rate_gr: request.participationRate,
    p_instructor_rate_gr: request.instructorRate,
    p_booking_horizon_days: request.timeRules.horizonDays,
    p_min_lead_minutes: request.timeRules.minLeadMinutes,
    p_cancellation_window_hours: request.timeRules.cancellationWindowHours,
    // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania:
    // baza pyta o jego Strzelnicę i tym warunkiem odcina wszystkie pozostałe.
    p_user_id: userId,
  })

  if (zapis.error) throw new Error(zapis.error.message)

  // Pusto znaczy konto bez Strzelnicy — zdarza się między założeniem konta
  // a wpisem w `panel_users`. Brak konfiguracji, a nie awaria, więc wraca
  // nazwanym zastrzeżeniem.
  if (zapis.data !== true) {
    return outcome<FacilityConfigOutcome>({ ok: false, problem: 'nieznana-strzelnica' }, origin)
  }

  return outcome<FacilityConfigOutcome>({ ok: true }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Zmiana cennika i reguł wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się zapisać cennika i reguł.',
    },
    { read: readFacilityConfigRequest, malformed: MalformedFacilityConfigRequestError },
    handle,
  ),
)
