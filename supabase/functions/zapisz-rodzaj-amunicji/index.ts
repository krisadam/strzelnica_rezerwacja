/**
 * Zapis Rodzaju amunicji — nowego, poprawionego albo wycofanego. Siostrzana
 * wobec `zapisz-typ-broni` i celowo uboższa o jedno pole: Rodzaj amunicji nie
 * ma puli i mieć nie będzie (ADR 0004), więc żądanie, które by o niej mówiło,
 * nie ma tu czego ustawić.
 *
 * Wszystko pozostałe jest takie samo: skorupa `panelEndpoint`, tożsamość konta
 * z GoTrue, Strzelnica z bazy po numerze konta (ADR 0010) i jedna funkcja na
 * dodanie, poprawkę oraz wycofanie.
 */
import type { AmmunitionKindDraft, CatalogOutcome } from '../../../packages/shared/src/index.ts'
import {
  ammunitionKindProblems,
  MalformedCatalogRequestError,
  readAmmunitionKindRequest,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { UNIQUE_VIOLATION } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

async function handle(
  request: AmmunitionKindDraft,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Nazwa i cena sprawdzone tą samą czystą funkcją, którą pyta Panel, zanim
  // pokaże przycisk. Bez katalogu, z tego samego powodu, co przy Typie broni:
  // o jedyności nazwy rozstrzyga ograniczenie w schemacie.
  const zastrzezenia = ammunitionKindProblems({ draft: request, ammunitionKinds: [] })
  if (zastrzezenia[0]) {
    return outcome<CatalogOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  const zapis = await client.rpc('save_ammunition_kind', {
    p_ammunition_kind_id: request.id,
    p_name: request.name,
    p_unit_price_gr: request.unitPrice,
    p_active: request.active,
    p_user_id: userId,
  })

  if (zapis.error?.code === UNIQUE_VIOLATION) {
    return outcome<CatalogOutcome>({ ok: false, problem: 'nazwa-zajeta' }, origin)
  }
  if (zapis.error) throw new Error(zapis.error.message)

  if (!zapis.data) {
    return outcome<CatalogOutcome>({ ok: false, problem: 'nieznana-pozycja' }, origin)
  }

  return outcome<CatalogOutcome>({ ok: true, id: zapis.data }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Zmiana katalogu Rodzajów amunicji wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się zapisać Rodzaju amunicji.',
    },
    { read: readAmmunitionKindRequest, malformed: MalformedCatalogRequestError },
    handle,
  ),
)
