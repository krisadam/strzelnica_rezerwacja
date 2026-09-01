/**
 * Zapis Rezerwacji. Jedyna droga, którą Rezerwacja powstaje — klucz anonimowy
 * nie ma do tabeli `bookings` żadnej polityki RLS (ADR 0003).
 *
 * Funkcja jest cienką skorupą wokół `packages/shared`: rozkłada żądanie,
 * dokłada do niego dane Strzelnicy i pyta te same czyste funkcje, które
 * odpowiadały kalendarzowi. Reguła policzona tutaj po swojemu byłaby drugą
 * kopią — a rozjazd między tym, co pokazuje Widget, a tym, co przyjmuje
 * serwer, jest klasą błędów, którą spec wyklucza z definicji.
 *
 * Import sięga wprost do źródeł `packages/shared`; Supabase CLI podmontowuje
 * do kontenera dokładnie te pliki, które funkcja importuje.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import type {
  BookingOutcome,
  BookingRequest,
  Database,
} from '../../../packages/shared/src/index.ts'
import {
  ammunitionKindFromRow,
  blockScheduleFromRow,
  bookingProblems,
  closedDateFromRow,
  facilityFromRow,
  instructorAttends,
  laneFromRow,
  MalformedBookingRequestError,
  occupancyFromRow,
  occupancyWindow,
  openingHoursFromRow,
  priceBooking,
  ratesFor,
  readBookingRequest,
  rowsOrThrow,
  scheduleForDay,
  weaponOccupancyFromRow,
  weaponTypeFromRow,
} from '../../../packages/shared/src/index.ts'

/**
 * Źródło, spod którego serwowany jest sam Widget. Nie jest domeną osadzenia —
 * te wskazuje Strzelnica — tylko domeną naszą, jednakową dla wszystkich
 * Strzelnic, więc mieszka w konfiguracji platformy, a nie w jej danych.
 */
const WIDGET_ORIGIN = Deno.env.get('WIDGET_ORIGIN')

/** Naruszenie ograniczenia wyłączności Osi w Postgresie. */
const EXCLUSION_VIOLATION = '23P01'

/** Naruszenie Puli sztuk Typu broni; własny SQLSTATE `place_booking`. */
const WEAPON_POOL_VIOLATION = 'WP001'

/**
 * Nagłówki CORS. Nie są tu żadnym zabezpieczeniem i nie należy ich za takie
 * brać: brama Supabase i tak dokłada własne `Access-Control-Allow-Origin: *`,
 * więc zawężanie ich tutaj niczego by nie zamknęło. Bramką jest sprawdzenie
 * nagłówka `Origin` względem domen Strzelnicy — wykonane, zanim cokolwiek
 * zostanie zapisane. CORS jest tu po to, żeby żądanie Widgetu w ogóle ruszyło.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

/**
 * Wynik dziedzinowy — przyjęto albo odmówiono z powodu, który Osoba
 * rezerwująca może naprawić — jedzie zawsze z kodem 200. Kody spoza dwustu
 * zostają dla sytuacji, w których w ogóle nie doszło do rozpatrzenia zgłoszenia.
 */
function outcome(value: BookingOutcome, origin: string | null): Response {
  return json(value, 200, origin)
}

type Client = ReturnType<typeof createClient<Database>>

function connect(): Client {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w środowisku funkcji.')
  }
  return createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } })
}

async function handle(request: BookingRequest, origin: string | null): Promise<Response> {
  const client = connect()

  const { data: facilityRow, error } = await client
    .from('facilities')
    .select(
      'id, name, timezone, booking_horizon_days, min_lead_minutes, cancellation_window_hours, instructor_pool, participation_rate_gr, instructor_rate_gr, allowed_origins',
    )
    .eq('slug', request.facilitySlug)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!facilityRow) return json({ error: 'Nie ma takiej Strzelnicy.' }, 404, origin)

  // Nagłówek `Origin` mówi, czyj dokument wysłał żądanie. Dla żądania z Widgetu
  // jest nim nasza własna domena; dla żądania sklejonego na cudzej stronie —
  // jej domena, i wtedy rozstrzyga lista Strzelnicy. Żądanie bez `Origin` nie
  // przyszło z przeglądarki, więc żadna lista go nie opisuje.
  const allowed = [...facilityRow.allowed_origins, ...(WIDGET_ORIGIN ? [WIDGET_ORIGIN] : [])]
  if (!origin || !allowed.includes(origin)) {
    return json({ error: 'Ta domena nie ma zgody na rezerwacje tej Strzelnicy.' }, 403, origin)
  }

  const facility = facilityFromRow(facilityRow)

  const laneResult = await client
    .from('lanes')
    .select('*')
    .eq('facility_id', facility.id)
    .eq('id', request.laneId)
    .maybeSingle()

  if (laneResult.error) throw new Error(laneResult.error.message)
  if (!laneResult.data) return json({ error: 'Ta Strzelnica nie ma takiej Osi.' }, 404, origin)
  const lane = laneFromRow(laneResult.data)

  // Zajętość idzie z tego samego widoku, co w Widgecie. To on — a nie zapytanie
  // pisane tu jeszcze raz — wie, które Rezerwacje trzymają Oś; funkcja czytająca
  // `bookings` wprost miałaby własną listę stanów do rozjechania się z widokiem.
  const okno = occupancyWindow(request.day, facility.timeZone)

  const [schedules, openingHours, exceptions, zajetosc, katalog, wypozyczone, rodzaje] =
    await Promise.all([
      client.from('block_schedules').select('*').eq('facility_id', facility.id),
      client.from('opening_hours').select('*').eq('facility_id', facility.id),
      client.from('calendar_exceptions').select('*').eq('facility_id', facility.id),
      // Zajętość całej Strzelnicy, nie tylko wybranej Osi: kolizję rozstrzyga
      // Oś, ale Pulę instruktorów liczy się po wszystkich Osiach naraz. Zapytanie
      // zawężone do jednej zaniżałoby ją po cichu i sprzedawało Instruktora,
      // którego nie ma.
      client
        .from('lane_occupancy')
        .select('*')
        .eq('facility_id', facility.id)
        .lt('starts_at', okno.to.toISOString())
        .gt('ends_at', okno.from.toISOString()),
      client.from('weapon_types').select('*').eq('facility_id', facility.id),
      // Sztuki trzymane przez cudze Rezerwacje — z całej Strzelnicy, bo katalog
      // jest wspólny dla wszystkich Osi. To samo okno, co dla zajętości Osi.
      client
        .from('weapon_occupancy')
        .select('*')
        .eq('facility_id', facility.id)
        .lt('starts_at', okno.to.toISOString())
        .gt('ends_at', okno.from.toISOString()),
      // Katalog amunicji bez żadnej zajętości obok: Rodzaj nie ma puli
      // (ADR 0004), więc czyta się go tylko po to, żeby odsiać Rodzaj, którego
      // ta Strzelnica nie zna.
      client.from('ammunition_kinds').select('*').eq('facility_id', facility.id),
    ])

  // Katalogi odczytane raz i podane obu regułom, które ich potrzebują:
  // dostępności Bloku i wycenie. Dwa odczyty tych samych wierszy dałyby się
  // rozejść przy pierwszej poprawce jednego z nich.
  const weaponTypes = rowsOrThrow(katalog).map(weaponTypeFromRow)
  const ammunitionKinds = rowsOrThrow(rodzaje).map(ammunitionKindFromRow)

  const grafik = scheduleForDay({
    day: request.day,
    laneId: lane.id,
    timeZone: facility.timeZone,
    timeRules: facility.timeRules,
    instructorPool: facility.instructorPool,
    // Zamierzenia biorą się ze zgłoszenia, bo dostępność zależy od nich tak
    // samo, jak od zajętości: Blok wolny dla Osoby rezerwującej z Pozwoleniem
    // bywa niedostępny dla tej bez niego.
    intent: request,
    schedules: rowsOrThrow(schedules).map(blockScheduleFromRow),
    openingHours: rowsOrThrow(openingHours).map(openingHoursFromRow),
    closedDates: rowsOrThrow(exceptions).map(closedDateFromRow),
    occupancies: rowsOrThrow(zajetosc).map(occupancyFromRow),
    weaponTypes,
    weaponOccupancies: rowsOrThrow(wypozyczone).map(weaponOccupancyFromRow),
    now: new Date(),
  })

  const block = grafik.blocks.find((candidate) => candidate.startMinute === request.startMinute)
  const problems = bookingProblems({
    draft: request,
    lane,
    block,
    ammunitionKinds,
  })
  // Pierwsze zastrzeżenie wystarczy: formularz pokazał resztę, więc tutaj
  // wychodzi już tylko to, czego klient nie mógł zobaczyć. Warunek na `block`
  // powtarza to, co `bookingProblems` właśnie orzekło — bez niego kontrola
  // typów nie wie, że dalej Blok na pewno jest.
  if (problems[0] || !block) {
    return outcome({ ok: false, problem: problems[0] ?? 'termin-niedostepny' }, origin)
  }

  // Kwota liczona tutaj od nowa, z cennika odczytanego z bazy rolą serwisową.
  // Zgłoszenie nie ma pola na Kwotę i mieć nie będzie: liczba przysłana przez
  // klienta byłaby ceną, którą sam sobie ustala. Liczy ją ta sama czysta
  // funkcja, która pokazała rozbicie w formularzu, więc Osoba rezerwująca
  // płaci to, co zobaczyła — chyba że Strzelnica zmieniła w międzyczasie
  // cennik, i wtedy obowiązuje jej cennik, nie stara kopia u klienta.
  //
  // Wycena daje jedno i drugie: Kwotę i ceny pozycji, po których się policzyła.
  // Oba idą do zapisu, żeby Rezerwacja dała się przeliczyć po podwyżce.
  const rates = ratesFor(facility, lane)
  const wycena = priceBooking({
    rates,
    draft: request,
    weaponTypes,
    ammunitionKinds,
  })

  // Rezerwacja i jej Wypożyczenia powstają jednym wywołaniem, bo powstają albo
  // razem, albo wcale: Rezerwacja bez zamówionej broni kazałaby Strzelnicy
  // przygotować puste stanowisko. Funkcja pilnuje przy tym Puli sztuk, której
  // sprawdzenie wykonane tutaj — w innej transakcji niż zapis — bywa
  // nieaktualne, zanim zdąży się zapisać.
  const zapis = await client.rpc('place_booking', {
    p_facility_id: facility.id,
    p_lane_id: lane.id,
    p_starts_at: block.startsAt.toISOString(),
    p_ends_at: block.endsAt.toISOString(),
    // Potwierdzenie adresu (ticket #10) przestawi to na „oczekująca".
    p_status: 'potwierdzona',
    p_participants: request.participants,
    p_contact_name: request.contact.name,
    p_contact_email: request.contact.email,
    p_contact_phone: request.contact.phone,
    p_has_permit: request.hasPermit,
    // Powód obecności Instruktora nie zmienia niczego poza uzasadnieniem,
    // więc do bazy idzie sam fakt. `instructorAttends` liczy to tak samo, jak
    // policzyła to dostępność chwilę wcześniej.
    p_with_instructor: instructorAttends(request),
    // Pozycje idą z wyceny, a nie ze zgłoszenia: te same sztuki, ale z ceną
    // dołożoną z katalogu. Zapisane przy pozycji, bo Kwota ma dać się
    // przeliczyć także po zmianie cennika.
    p_rentals: wycena.rentals.map(({ weaponTypeId, quantity, unitPrice }) => ({
      weaponTypeId,
      quantity,
      unitPriceGr: unitPrice,
    })),
    // Zapotrzebowanie jedzie tą samą drogą i z tego samego powodu — pozycje
    // Rezerwacji powstają razem z nią. Niczego przy tym nie pilnuje: Rodzaj
    // amunicji nie ma puli (ADR 0004), więc nie ma warunku do naruszenia
    // i nie ma odmowy, którą trzeba by tu rozpoznać.
    p_ammunition: wycena.ammunition.map(({ ammunitionKindId, quantity, unitPrice }) => ({
      ammunitionKindId,
      quantity,
      unitPriceGr: unitPrice,
    })),
    p_amount_gr: wycena.amount.total,
    // Stawki zapisane razem z Kwotą: bez nich Rezerwacja niosłaby liczbę,
    // której nikt nie umie wytłumaczyć klientowi stojącemu przy kasie.
    p_block_rate_gr: rates.blockRate,
    p_participation_rate_gr: rates.participationRate,
    p_instructor_rate_gr: rates.instructorRate,
  })

  // Dwa zgłoszenia na ten sam Blok w tej samej chwili widzą Blok wolny oba —
  // rozstrzyga dopiero ograniczenie wyłączności Osi. Przegrany dostaje ten sam
  // powód, co ktoś, kto zwlekał: termin jest zajęty.
  if (zapis.error?.code === EXCLUSION_VIOLATION) {
    return outcome({ ok: false, problem: 'termin-niedostepny' }, origin)
  }
  // Wyścig o ostatnią sztukę broni kończy się inaczej niż wyścig o Oś: termin
  // zostaje wolny, tylko nie dla tego zamówienia. Osoba rezerwująca ma o tym
  // usłyszeć wprost, bo naprawia to mniejszym zamówieniem, a nie innym dniem.
  if (zapis.error?.code === WEAPON_POOL_VIOLATION) {
    return outcome({ ok: false, problem: 'brak-sztuk-broni' }, origin)
  }
  if (zapis.error) throw new Error(zapis.error.message)

  // Kwota wraca razem z numerem: Osoba rezerwująca ma zobaczyć na
  // potwierdzeniu tę zapisaną, a nie policzoną u siebie po raz drugi.
  return outcome({ ok: true, id: zapis.data, amount: wycena.amount.total }, origin)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') return json({ error: 'Metoda nieobsługiwana.' }, 405, origin)

  let request: BookingRequest
  try {
    request = readBookingRequest(await req.json().catch(() => null))
  } catch (powod) {
    if (powod instanceof MalformedBookingRequestError) {
      return json({ error: powod.message }, 400, origin)
    }
    throw powod
  }

  try {
    return await handle(request, origin)
  } catch (powod) {
    console.error(powod)
    return json({ error: 'Nie udało się zapisać Rezerwacji.' }, 500, origin)
  }
})
