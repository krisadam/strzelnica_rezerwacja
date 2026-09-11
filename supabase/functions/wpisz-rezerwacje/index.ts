/**
 * Ręczny wpis Rezerwacji przyjętej przez telefon. Szósta droga zapisu tego
 * modułu i trzecia, o którą prosi **konto Panelu**, a nie link z e-maila — więc
 * idzie tą samą skorupą, co odwołanie i Blokada (`panelEndpoint`, ADR 0003,
 * ADR 0010): tożsamość konta potwierdza GoTrue, a Strzelnicy funkcja nie
 * przyjmuje w żądaniu — pyta o nią bazę, po numerze potwierdzonego konta.
 *
 * Wszystko poniżej jest tym samym, co w `zloz-rezerwacje`: te same odczyty, ta
 * sama dostępność, ta sama wycena z cennika odczytanego rolą serwisową i ta
 * sama funkcja zapisująca. Różnią się trzy rzeczy, i wszystkie trzy biorą się
 * z tego, że po drugiej stronie jest obsługa, a nie klient:
 *
 * — Trzy limity Strzelnicy wolno przekroczyć, a naruszenie zostaje przy
 *   Rezerwacji na trwałe (`manualBookingReview`, ADR 0012). Liczy je **serwer**
 *   i to jego lista trafia do bazy; żądanie niesie wyłącznie potwierdzenie.
 *   Lista przepisana z żądania byłaby naruszeniem, które naruszający sam sobie
 *   wystawia — tak samo jak Kwota przysłana przez klienta byłaby ceną, którą
 *   sam sobie ustala.
 * — Rezerwacja powstaje od razu **potwierdzona**: adres podano przez telefon,
 *   więc nie ma czego potwierdzać ani na co czekać. Nie ma tu więc ani tokenu,
 *   ani Czasu na potwierdzenie.
 * — Nie ma ani jednego listu. Klient jest na linii i słyszy termin oraz Kwotę
 *   od obsługi, a powiadomienie o nowej Rezerwacji poszłoby do Strzelnicy,
 *   która właśnie tę Rezerwację wpisuje.
 *
 * Sprawdzenia nagłówka `Origin` nie ma — jak w pozostałych funkcjach Panelu:
 * upoważnieniem jest nagłówek `Authorization`, którego obca strona nie dołoży
 * z siebie, a mając go, nie zatrzymałaby jej i lista domen.
 */
import type {
  ManualBookingOutcome,
  ManualBookingRequest,
} from '../../../packages/shared/src/index.ts'
import {
  facilityFromRow,
  instructorAttends,
  laneFromRow,
  MalformedBookingRequestError,
  manualBookingReview,
  priceBooking,
  ratesFor,
  readManualBookingRequest,
  unconfirmedOverrides,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import {
  CLOSURE_CONFLICT,
  EXCLUSION_VIOLATION,
  WEAPON_POOL_VIOLATION,
} from '../_shared/baza.ts'
import { grafikOsi } from '../_shared/grafik.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

/**
 * Strzelnica konta, w imieniu którego prosi funkcja — z bazy, a nie z żądania.
 * To jest tutaj cała granica Strzelnicy: identyfikator Osi stoi w żądaniu
 * wprost, ale zestawia się go z Osiami **tej** Strzelnicy, a o nią pyta się
 * `panel_facility_of` (ADR 0010). Puste znaczy konto bez powiązania.
 */
async function strzelnicaKonta(client: Client, userId: string): Promise<string | null> {
  const { data, error } = await client.rpc('panel_facility_of', { p_user_id: userId })
  if (error) throw new Error(error.message)
  return data ?? null
}

async function handle(
  request: ManualBookingRequest,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  const facilityId = await strzelnicaKonta(client, userId)
  // Konto bez Strzelnicy nie ma Osi, na której mogłoby cokolwiek wpisać. Jedna
  // odpowiedź na to i na Oś obcą — rozróżnienie mówiłoby pytającemu o Osiach,
  // których nie ma prawa widzieć.
  if (!facilityId) {
    return outcome<ManualBookingOutcome>({ ok: false, problem: 'nieznana-os' }, origin)
  }

  const { data: facilityRow, error } = await client
    .from('facilities')
    .select(
      'id, name, timezone, booking_horizon_days, min_lead_minutes, cancellation_window_hours, instructor_pool, participation_rate_gr, instructor_rate_gr',
    )
    .eq('id', facilityId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!facilityRow) {
    return outcome<ManualBookingOutcome>({ ok: false, problem: 'nieznana-os' }, origin)
  }
  const facility = facilityFromRow(facilityRow)

  // Wyłącznie Oś czynna, tak samo jak przy zgłoszeniu z Widgetu. Oś wyłączona
  // nie jest limitem Strzelnicy do przekroczenia (ADR 0012), tylko Osią zdjętą
  // z oferty — obsługa, która chce na nią wpisać Rezerwację, włącza ją
  // wcześniej jednym polem w konfiguracji.
  const laneResult = await client
    .from('lanes')
    .select('*')
    .eq('facility_id', facility.id)
    .eq('id', request.laneId)
    .eq('active', true)
    .maybeSingle()

  if (laneResult.error) throw new Error(laneResult.error.message)
  if (!laneResult.data) {
    return outcome<ManualBookingOutcome>({ ok: false, problem: 'nieznana-os' }, origin)
  }
  const lane = laneFromRow(laneResult.data)

  // Grafik dnia razem z katalogami — jedną kopią odczytu, tą samą, którą pyta
  // zgłoszenie z Widgetu (`_shared/grafik.ts`), więc ręczny wpis widzi
  // dokładnie tę samą Zajętość: cudze Rezerwacje **i** Blokady. Dopiero
  // `manualBookingReview` rozdziela powody na limity do przekroczenia i odmowy;
  // tutaj nie ma o tym ani jednego zdania, bo reguła należy do
  // `packages/shared`.
  const { grafik, weaponTypes, ammunitionKinds } = await grafikOsi(client, {
    facility,
    lane,
    day: request.day,
    intent: request,
    now: new Date(),
  })

  const block = grafik.blocks.find((candidate) => candidate.startMinute === request.startMinute)
  const osad = manualBookingReview({ draft: request, lane, block, ammunitionKinds })

  // Pierwsze zastrzeżenie wystarczy: formularz pokazał resztę, więc tutaj
  // wychodzi już tylko to, czego obsługa nie mogła zobaczyć. Warunek na `block`
  // powtarza to, co `manualBookingReview` właśnie orzekło — bez niego kontrola
  // typów nie wie, że dalej Blok na pewno jest.
  if (osad.problems[0] || !block) {
    return outcome<ManualBookingOutcome>(
      { ok: false, problem: osad.problems[0] ?? 'termin-niedostepny' },
      origin,
    )
  }

  // Przekroczenie bez potwierdzenia jest odmową, a nie milczącym zapisem:
  // formularz pyta o pewność, zanim wyśle, a serwer sprawdza to od nowa — bo
  // między pytaniem a zapisem zajętość i Pula instruktorów zmieniają się bez
  // wiedzy przeglądarki, a wtedy wpis przekracza limit, o którym nikogo nie
  // zapytano.
  if (unconfirmedOverrides(osad.exceeded, request.overrides).length > 0) {
    return outcome<ManualBookingOutcome>(
      { ok: false, problem: 'niepotwierdzone-przekroczenie' },
      origin,
    )
  }

  // Kwota liczona tutaj od nowa, z cennika odczytanego z bazy — tak samo jak
  // przy zgłoszeniu z Widgetu i z tego samego powodu: żądanie nie ma pola na
  // Kwotę, bo liczba przysłana z przeglądarki byłaby ceną, którą wystawia
  // sobie sam wystawiający.
  const rates = ratesFor(facility, lane)
  const wycena = priceBooking({ rates, draft: request, weaponTypes, ammunitionKinds })

  const zapis = await client.rpc('place_booking', {
    p_facility_id: facility.id,
    p_lane_id: lane.id,
    p_starts_at: block.startsAt.toISOString(),
    p_ends_at: block.endsAt.toISOString(),
    // Od razu potwierdzona: adres podano przez telefon, więc nie ma czego
    // potwierdzać — a Rezerwacja, która czekałaby na kliknięcie w link, wygasła
    // by pół godziny po rozmowie i zwolniła termin obiecany komuś na słowo.
    p_status: 'potwierdzona',
    p_participants: request.participants,
    p_contact_name: request.contact.name,
    p_contact_email: request.contact.email,
    p_contact_phone: request.contact.phone,
    p_has_permit: request.hasPermit,
    p_with_instructor: instructorAttends(request),
    p_rentals: wycena.rentals.map(({ weaponTypeId, quantity, unitPrice }) => ({
      weaponTypeId,
      quantity,
      unitPriceGr: unitPrice,
    })),
    p_ammunition: wycena.ammunition.map(({ ammunitionKindId, quantity, unitPrice }) => ({
      ammunitionKindId,
      quantity,
      unitPriceGr: unitPrice,
    })),
    p_amount_gr: wycena.amount.total,
    p_block_rate_gr: rates.blockRate,
    p_participation_rate_gr: rates.participationRate,
    p_instructor_rate_gr: rates.instructorRate,
    // Tokenu i Czasu na potwierdzenie nie ma tu ani jednego: oba należą do
    // Rezerwacji, która na potwierdzenie czeka, więc wpis z Panelu ich nie
    // podaje wcale.
    p_source: 'panel',
    // Osąd serwera, nie treść żądania. Potwierdzenie z formularza zostało
    // sprawdzone wyżej i dalej nie jedzie.
    p_limit_overrides: osad.exceeded,
  })

  // Wyłączność Osi nie podlega przekroczeniu i nie ma tu żadnej ścieżki, którą
  // dałoby się ją obejść: rozstrzyga ograniczenie wykluczające i wyzwalacz
  // Blokad, a nie osąd policzony wyżej. Termin bywa czyjś od sekundy — Panel
  // odświeża się raz na minutę — więc to odmowa, którą obsługa zobaczy.
  if (zapis.error?.code === EXCLUSION_VIOLATION || zapis.error?.code === CLOSURE_CONFLICT) {
    return outcome<ManualBookingOutcome>({ ok: false, problem: 'termin-zajety' }, origin)
  }
  // Pula sztuk Typu broni obowiązuje ręczny wpis tak samo: mówi, ile sztuk
  // Strzelnica **ma**. Obsługa, która zna czwarty egzemplarz, dopisuje go do
  // katalogu (ADR 0012).
  if (zapis.error?.code === WEAPON_POOL_VIOLATION) {
    return outcome<ManualBookingOutcome>({ ok: false, problem: 'brak-sztuk-broni' }, origin)
  }
  if (zapis.error) throw new Error(zapis.error.message)

  // Kwota i odnotowane przekroczenia wracają razem z numerem: obsługa ma
  // powiedzieć klientowi tę Kwotę, która stanęła przy Rezerwacji, i zobaczyć,
  // co przy niej zostało zapisane.
  return outcome<ManualBookingOutcome>(
    { ok: true, id: zapis.data, amount: wycena.amount.total, overrides: osad.exceeded },
    origin,
  )
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Wpisanie Rezerwacji wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się wpisać Rezerwacji.',
    },
    { read: readManualBookingRequest, malformed: MalformedBookingRequestError },
    handle,
  ),
)
