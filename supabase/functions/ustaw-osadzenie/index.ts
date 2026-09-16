/**
 * Zapis osadzenia Strzelnicy: lista domen, na których wolno osadzić jej
 * Widget, treść regulaminu i adres polityki prywatności — wszystko naraz.
 * Jedenasta droga zapisu tego modułu i ósma, o którą prosi Panel, więc idzie
 * tą samą skorupą, co cennik, godziny i katalogi (`panelEndpoint`, ADR 0003,
 * ADR 0010): tożsamość konta potwierdza GoTrue, a jego numer jedzie do bazy
 * parametrem, bo to ona rozstrzyga, o której Strzelnicy mowa.
 *
 * Trzy rzeczy jednym żądaniem, bo są jednym ekranem i jednym przyciskiem: nie
 * ma chwili, w której Strzelnica ma nową listę domen i stary regulamin.
 *
 * Skutek jest natychmiastowy i nie ma tu nic, co by go odkładało: nagłówek
 * `frame-ancestors` liczy się z tej samej kolumny przy każdym podaniu
 * dokumentu Widgetu, więc domena skasowana tym żądaniem przestaje osadzać przy
 * następnym wejściu. O blokadzie rozstrzyga przeglądarka, a nie nasz kod —
 * my dostarczamy jej wyłącznie listę, na którą zgodziła się Strzelnica.
 */
import type { EmbeddingDraft, EmbeddingOutcome } from '../../../packages/shared/src/index.ts'
import {
  embeddingProblems,
  MalformedEmbeddingRequestError,
  readEmbeddingRequest,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

async function handle(
  request: EmbeddingDraft,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Domeny i dokumenty sprawdzone tą samą czystą funkcją, którą pyta Panel,
  // zanim pokaże przycisk — serwer liczy to od nowa, bo walidacja
  // w przeglądarce jest wygodą, a nie zabezpieczeniem. Tu znaczy ona więcej
  // niż gdzie indziej: z tej listy powstaje nagłówek, a wpis, którego nie da
  // się odczytać, byłby cichą blokadą osadzania na wszystkich domenach naraz.
  const zastrzezenia = embeddingProblems(request)
  if (zastrzezenia[0]) {
    return outcome<EmbeddingOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  const zapis = await client.rpc('set_facility_embedding', {
    p_allowed_origins: request.allowedOrigins,
    p_terms_text: request.terms,
    p_privacy_url: request.privacyUrl,
    // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania:
    // baza pyta o jego Strzelnicę i tym warunkiem odcina wszystkie pozostałe.
    p_user_id: userId,
  })

  if (zapis.error) throw new Error(zapis.error.message)

  // Pusto znaczy konto bez Strzelnicy — zdarza się między założeniem konta
  // a wpisem w `panel_users`. Brak konfiguracji, a nie awaria, więc wraca
  // nazwanym zastrzeżeniem.
  if (zapis.data !== true) {
    return outcome<EmbeddingOutcome>({ ok: false, problem: 'nieznana-strzelnica' }, origin)
  }

  return outcome<EmbeddingOutcome>({ ok: true }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Zmiana osadzenia wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się zapisać osadzenia.',
    },
    { read: readEmbeddingRequest, malformed: MalformedEmbeddingRequestError },
    handle,
  ),
)
