/**
 * Zapis Typu broni — nowego, poprawionego albo wycofanego — w imieniu konta
 * Panelu. Dziewiąta droga zapisu tego modułu i szósta, o którą prosi Panel,
 * więc idzie tą samą skorupą, co zapis Osi, rozkład i godziny (`panelEndpoint`,
 * ADR 0003, ADR 0010): tożsamość konta potwierdza GoTrue, a jego numer jedzie
 * do bazy parametrem, bo to ona rozstrzyga, czy pozycja należy do jego
 * Strzelnicy.
 *
 * Jedna funkcja na dodanie, poprawkę i wycofanie, dokładnie jak `zapisz-os`:
 * różnią się wyłącznie tym, czy pozycja już jest, a wycofanie jest poprawką
 * jednego pola. Kasowania nie ma tu czym zrobić i nie będzie (ADR 0013) —
 * pozycję wskazują Wypożyczenia złożonych Rezerwacji.
 *
 * Czego tu nie ma, choć Panel to pokazuje: przekroczeń puli. Pula zmniejszona
 * poniżej tego, co obiecano, jest decyzją Strzelnicy, a Rezerwacja niesie
 * własne sztuki i o Pulę nie pyta nikogo po tym, jak powstała. Przekroczenia
 * **wskazuje** ekran (`poolOverruns`), a rozstrzyga człowiek — tak samo jak
 * Rezerwacje wypchnięte poza godziny otwarcia.
 */
import type { CatalogOutcome, WeaponTypeDraft } from '../../../packages/shared/src/index.ts'
import {
  MalformedCatalogRequestError,
  readWeaponTypeRequest,
  weaponTypeProblems,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { UNIQUE_VIOLATION } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

async function handle(
  request: WeaponTypeDraft,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Nazwa, pula i cena sprawdzone tą samą czystą funkcją, którą pyta Panel,
  // zanim pokaże przycisk — serwer liczy to od nowa, bo walidacja
  // w przeglądarce jest wygodą, a nie zabezpieczeniem.
  //
  // Bez katalogu: stąd widziany byłby katalogiem sprzed chwili, a o jedyności
  // nazwy rozstrzyga i tak ograniczenie w schemacie — niżej. Ta sama granica,
  // co przy zapisie Osi (ADR 0003).
  const zastrzezenia = weaponTypeProblems({ draft: request, weaponTypes: [] })
  if (zastrzezenia[0]) {
    return outcome<CatalogOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  const zapis = await client.rpc('save_weapon_type', {
    p_weapon_type_id: request.id,
    p_name: request.name,
    p_pool: request.pool,
    p_unit_price_gr: request.unitPrice,
    p_active: request.active,
    // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania:
    // baza pyta o jego Strzelnicę i tym warunkiem odcina obce katalogi.
    p_user_id: userId,
  })

  // Nazwę nosi już inna pozycja tego katalogu — także wycofana. Odmowa
  // dziedzinowa, nie awaria: obsługa ma usłyszeć zdanie i wpisać inną nazwę.
  if (zapis.error?.code === UNIQUE_VIOLATION) {
    return outcome<CatalogOutcome>({ ok: false, problem: 'nazwa-zajeta' }, origin)
  }
  if (zapis.error) throw new Error(zapis.error.message)

  // Pusto znaczy pozycję, której baza tej Strzelnicy nie przypisuje: obcą,
  // nieistniejącą albo należącą do konta bez powiązania. Jedna odpowiedź na
  // wszystkie trzy — rozróżnienie mówiłoby pytającemu o katalogach, których nie
  // ma prawa widzieć.
  if (!zapis.data) {
    return outcome<CatalogOutcome>({ ok: false, problem: 'nieznana-pozycja' }, origin)
  }

  return outcome<CatalogOutcome>({ ok: true, id: zapis.data }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Zmiana katalogu Typów broni wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się zapisać Typu broni.',
    },
    { read: readWeaponTypeRequest, malformed: MalformedCatalogRequestError },
    handle,
  ),
)
