import { expect, test } from '@playwright/test'
import {
  HASLO_PANELU,
  KLIENT_DEMO,
  OBSLUGA_DEMO,
  OBSLUGA_DRUGIEJ,
  OS_KARABINOWA,
  OS_PISTOLETOWA,
  REZERWACJA_DEMO,
  zalogujDoPanelu,
} from './pomocniki.js'
import {
  baza,
  bazaAnonimowo,
  bazaJakoUzytkownikPanelu,
  funkcjaJakoUzytkownikPanelu,
} from './srodowisko.js'

/**
 * Izolacja Strzelnic: co widzi i czego nie tknie konto jednej z nich.
 *
 * Czego czysta funkcja z definicji nie zobaczy: że rozdzielenie danych jest
 * własnością bazy, a nie ekranu. Panel filtrujący po Strzelnicy w przeglądarce
 * wygląda dokładnie tak samo jak Panel, którego odcięła baza — różnicę widać
 * dopiero wtedy, gdy pytanie idzie do PostgREST-a obok interfejsu. Tu więc idzie
 * obok: znajomość identyfikatora obcego wiersza nie jest żadnym upoważnieniem
 * i to jest cała treść tych testów.
 *
 * Każdy odczyt jest zadany dwa razy — raz oczami, dla których wiersz istnieje,
 * raz kontem obcej Strzelnicy. Pierwszy raz nie jest ceremonią: asercja „nie
 * widzę wiersza" jest prawdziwa z braku wiersza, więc test najpierw dowodzi,
 * że wiersz jest.
 */

/**
 * Dane drugiej Strzelnicy z seeda, wypisane identyfikatorami. Wypisane właśnie
 * tak, bo o to idzie: obsługa demo zna je z tego pliku równie dobrze, jak
 * znałby je ktoś, komu wpadły w ręce — i ma z nich nie mieć nic.
 */
const OBCA = {
  strzelnica: '00000000-0000-0000-0000-000000000002',
  os: '00000000-0000-0000-0000-0000000000a3',
  /** Druga Oś obcej Strzelnicy — ta, na której stoi jej Blokada. */
  osZBlokada: '00000000-0000-0000-0000-0000000000a4',
  rezerwacja: '00000000-0000-0000-0000-0000000000b2',
  wypozyczenie: '00000000-0000-0000-0000-0000000000d2',
  zapotrzebowanie: '00000000-0000-0000-0000-0000000000f2',
  blokada: '00000000-0000-0000-0000-000000000302',
  list: '00000000-0000-0000-0000-000000000201',
}

const STRZELNICA_DEMO = '00000000-0000-0000-0000-000000000001'
/** Konto obsługi demo — to, którym przepisano by się na obcą Strzelnicę. */
const KONTO_DEMO = '00000000-0000-0000-0000-000000000101'
/** Konto obsługi drugiej Strzelnicy — to, którym podszyłby się przejmujący. */
const KONTO_DRUGIEJ = '00000000-0000-0000-0000-000000000102'

/** Rezerwacje drugiej Strzelnicy — te, których obsługa demo widzieć nie ma. */
const KLIENT_OBCY = 'Obcy Klient'
const OS_OBCA = 'Oś obcej Strzelnicy nr 1'

/**
 * Wiersze zwrócone przez PostgREST-a albo pustka. Odmowa prawem i pustka pod
 * RLS są tą samą odpowiedzią — „nic tu dla ciebie nie ma" — więc jedna i druga
 * wraca jako brak wierszy. Kod spoza tych trzech możliwości zatrzymuje test:
 * pomyłka w ścieżce też oddałaby pustkę i przeszłaby niezauważona.
 */
async function wiersze(odpowiedz: Response, zapytanie: string): Promise<unknown[]> {
  expect([200, 401, 403], `${zapytanie} → ${odpowiedz.status}`).toContain(odpowiedz.status)
  return odpowiedz.ok ? ((await odpowiedz.json()) as unknown[]) : []
}

/** Odpowiedź spod konta Panelu. */
async function wierszeDla(email: string, zapytanie: string): Promise<unknown[]> {
  return wiersze(await bazaJakoUzytkownikPanelu(email, HASLO_PANELU, zapytanie), zapytanie)
}

/** Odpowiedź kluczem anonimowym — tym z kodu Widgetu. */
async function wierszeAnonimowo(zapytanie: string): Promise<unknown[]> {
  return wiersze(await bazaAnonimowo(zapytanie), zapytanie)
}

/**
 * Każda tabela domenowa drugiej Strzelnicy, pytana wprost o jej wiersz. Lista
 * jest tu po to, żeby tabela dołożona przyszłą migracją była widocznym brakiem:
 * dopisanie jej wiersza do seeda i jednej linijki tutaj jest tańsze niż
 * odkrycie, że nowa tabela nie miała polityki.
 *
 * `swiadek` mówi, czyimi oczami test upewnia się, że wiersz w ogóle jest.
 * Zwykle rolą serwisową — ta widzi wszystko. Wyjątkiem jest widok Panelu:
 * zasłania Rezerwacje **także** przed nią, bo jego warunek pyta o zalogowane
 * konto, a rola serwisowa żadnym nie jest. Tam dowodem obecności wiersza jest
 * obsługa drugiej Strzelnicy — jedyne oczy, dla których ten widok się otwiera.
 */
const OBCE_WIERSZE: { co: string; zapytanie: string; swiadek?: string }[] = [
  { co: 'Strzelnica', zapytanie: `facilities?id=eq.${OBCA.strzelnica}&select=id` },
  { co: 'Osie', zapytanie: `lanes?facility_id=eq.${OBCA.strzelnica}&select=id` },
  {
    co: 'rozkład Bloków',
    zapytanie: `block_schedules?facility_id=eq.${OBCA.strzelnica}&select=id`,
  },
  {
    co: 'godziny otwarcia',
    zapytanie: `opening_hours?facility_id=eq.${OBCA.strzelnica}&select=id`,
  },
  {
    co: 'wyjątki kalendarzowe',
    zapytanie: `calendar_exceptions?facility_id=eq.${OBCA.strzelnica}&select=id`,
  },
  {
    co: 'katalog Typów broni',
    zapytanie: `weapon_types?facility_id=eq.${OBCA.strzelnica}&select=id`,
  },
  {
    co: 'katalog Rodzajów amunicji',
    zapytanie: `ammunition_kinds?facility_id=eq.${OBCA.strzelnica}&select=id`,
  },
  {
    co: 'Blokady',
    zapytanie: `lane_closures?facility_id=eq.${OBCA.strzelnica}&select=id`,
  },
  { co: 'Rezerwacje', zapytanie: `bookings?facility_id=eq.${OBCA.strzelnica}&select=id` },
  {
    co: 'Rezerwacje w widoku Panelu',
    zapytanie: `panel_bookings?facility_id=eq.${OBCA.strzelnica}&select=id`,
    swiadek: OBSLUGA_DRUGIEJ,
  },
  { co: 'Wypożyczenia', zapytanie: `weapon_rentals?id=eq.${OBCA.wypozyczenie}&select=id` },
  {
    co: 'Zapotrzebowanie',
    zapytanie: `ammunition_demands?id=eq.${OBCA.zapotrzebowanie}&select=id`,
  },
  { co: 'poczta', zapytanie: `mail_outbox?id=eq.${OBCA.list}&select=id` },
  {
    co: 'konta Panelu',
    zapytanie: `panel_users?facility_id=eq.${OBCA.strzelnica}&select=user_id`,
  },
]

test('Użytkownik panelu nie odczyta ani jednego wiersza obcej Strzelnicy', async () => {
  for (const { co, zapytanie, swiadek } of OBCE_WIERSZE) {
    // Wiersz jest — inaczej zdanie „nie widzę go" byłoby prawdziwe z braku.
    const widziany = swiadek
      ? await wierszeDla(swiadek, zapytanie)
      : await baza<unknown[]>(zapytanie)
    expect(widziany, `seed nie ma czego chować: ${co}`).not.toEqual([])

    expect({ co, wiersze: await wierszeDla(OBSLUGA_DEMO, zapytanie) }).toEqual({ co, wiersze: [] })
  }
})

/**
 * Odczyt bez zawężenia po Strzelnicy — bo tak pyta ktoś, kto o wielodostępności
 * nic nie wie, i tak pytałby ktoś, kto wie o niej za dużo. Odpowiedź ma być ta
 * sama: wyłącznie własne wiersze, w liczbie zgodnej z seedem.
 *
 * Ostatni wiersz listy jest o koncie, nie o Strzelnicy: `panel_users` widzi się
 * własnym, jednym — i to jest ta jedna rzecz, którą stamtąd wolno przeczytać.
 */
test('odczyt bez warunku oddaje wyłącznie wiersze własnej Strzelnicy', async () => {
  const wlasne = [
    { co: 'Strzelnice', zapytanie: 'facilities?select=id', ile: 1 },
    { co: 'Osie', zapytanie: 'lanes?select=id', ile: 2 },
    { co: 'katalog Typów broni', zapytanie: 'weapon_types?select=id', ile: 3 },
    { co: 'katalog Rodzajów amunicji', zapytanie: 'ammunition_kinds?select=id', ile: 3 },
    { co: 'godziny otwarcia', zapytanie: 'opening_hours?select=id', ile: 7 },
    { co: 'własne powiązanie', zapytanie: 'panel_users?select=user_id', ile: 1 },
  ]

  for (const { co, zapytanie, ile } of wlasne) {
    const odczytane = await wierszeDla(OBSLUGA_DEMO, zapytanie)
    expect({ co, ile: odczytane.length }).toEqual({ co, ile })
  }
})

/**
 * Zapis do obcej Strzelnicy — sześć dróg, którymi ktoś by go spróbował, w tym
 * ta najciekawsza: przepisanie **własnego** konta na obcą Strzelnicę. Gdyby
 * przeszło, wszystkie polityki oparte na przynależności otwierałyby się jednym
 * żądaniem, bo przynależność jest właśnie tym, o co pytają.
 *
 * Sprawdzamy dwie rzeczy naraz, bo osobno każda kłamie: sam kod odmowy nie
 * mówi, że dane stoją nietknięte, a same nietknięte dane nie odróżniają odmowy
 * od zapisu, który trafił w zero wierszy i przy pierwszej politykce trafi
 * w jeden.
 */
const NOWA_REZERWACJA = {
  starts_at: '2030-01-01T10:00:00Z',
  ends_at: '2030-01-01T12:00:00Z',
  status: 'potwierdzona',
  participants: 1,
  contact_name: 'Wtręt',
  contact_email: 'wtret@example.pl',
  contact_phone: '600000000',
  has_permit: true,
  with_instructor: false,
  amount_gr: 0,
  block_rate_gr: 0,
  participation_rate_gr: 0,
  instructor_rate_gr: 0,
  // Źródło podane, żeby żądanie było **kompletną** Rezerwacją: odmowa ma
  // przyjść z polityki, a nie z kolumny, której zabrakło.
  source: 'panel',
}

/** Próby zapisu w obcej Strzelnicy: co i którędy. */
const ZAPISY_W_OBCEJ = [
  {
    co: 'zmiana Rezerwacji',
    zapytanie: `bookings?id=eq.${OBCA.rezerwacja}`,
    init: { method: 'PATCH', body: JSON.stringify({ participants: 9 }) },
  },
  {
    co: 'usunięcie Rezerwacji',
    zapytanie: `bookings?id=eq.${OBCA.rezerwacja}`,
    init: { method: 'DELETE' },
  },
  {
    co: 'dopisanie Rezerwacji',
    zapytanie: 'bookings',
    init: {
      method: 'POST',
      body: JSON.stringify({
        ...NOWA_REZERWACJA,
        facility_id: OBCA.strzelnica,
        lane_id: OBCA.os,
      }),
    },
  },
  {
    co: 'zmiana pojemności Osi',
    zapytanie: `lanes?id=eq.${OBCA.os}`,
    init: { method: 'PATCH', body: JSON.stringify({ capacity: 99 }) },
  },
  {
    co: 'zmiana konfiguracji Strzelnicy',
    zapytanie: `facilities?id=eq.${OBCA.strzelnica}`,
    init: { method: 'PATCH', body: JSON.stringify({ instructor_pool: 9 }) },
  },
  {
    co: 'przepisanie własnego konta na obcą Strzelnicę',
    zapytanie: `panel_users?user_id=eq.${KONTO_DEMO}`,
    init: { method: 'PATCH', body: JSON.stringify({ facility_id: OBCA.strzelnica }) },
  },
  {
    co: 'dopisanie Blokady na obcej Osi',
    zapytanie: 'lane_closures',
    init: {
      method: 'POST',
      body: JSON.stringify({
        facility_id: OBCA.strzelnica,
        lane_id: OBCA.os,
        starts_at: '2030-01-01T10:00:00Z',
        ends_at: '2030-01-01T12:00:00Z',
        reason: 'Wtręt',
      }),
    },
  },
  {
    co: 'usunięcie obcej Blokady',
    zapytanie: `lane_closures?id=eq.${OBCA.blokada}`,
    init: { method: 'DELETE' },
  },
  {
    co: 'dopisanie godzin otwarcia obcej Strzelnicy',
    zapytanie: 'opening_hours',
    init: {
      method: 'POST',
      body: JSON.stringify({
        facility_id: OBCA.strzelnica,
        weekday: 7,
        opens_minute: 0,
        closes_minute: 60,
      }),
    },
  },
  {
    co: 'usunięcie obcego wyjątku kalendarzowego',
    zapytanie: `calendar_exceptions?facility_id=eq.${OBCA.strzelnica}`,
    init: { method: 'DELETE' },
  },
]

/** Druga Strzelnica w kształcie, w jakim zostawił ją seed. */
async function drugaStrzelnicaJestNietknieta(): Promise<void> {
  // Blokady dokładnie jedna, ta z seeda: dopisana albo skasowana obcą ręką
  // byłaby Osią wyłączoną — albo puszczoną do sprzedaży — bez wiedzy jej
  // Strzelnicy.
  expect(
    await baza<unknown[]>(`lane_closures?facility_id=eq.${OBCA.strzelnica}&select=id`),
  ).toHaveLength(1)

  const [rezerwacja] = await baza<{ participants: number }[]>(
    `bookings?id=eq.${OBCA.rezerwacja}&select=participants`,
  )
  expect(rezerwacja?.participants).toBe(1)

  const [os] = await baza<{ capacity: number }[]>(`lanes?id=eq.${OBCA.os}&select=capacity`)
  expect(os?.capacity).toBe(3)

  const [strzelnica] = await baza<{ instructor_pool: number }[]>(
    `facilities?id=eq.${OBCA.strzelnica}&select=instructor_pool`,
  )
  expect(strzelnica?.instructor_pool).toBe(2)

  expect(
    await baza<unknown[]>(`bookings?facility_id=eq.${OBCA.strzelnica}&select=id`),
  ).toHaveLength(2)

  const [konto] = await baza<{ facility_id: string }[]>(
    `panel_users?user_id=eq.${KONTO_DEMO}&select=facility_id`,
  )
  expect(konto?.facility_id).toBe(STRZELNICA_DEMO)
}

test('Użytkownik panelu nie zapisze niczego w obcej Strzelnicy', async () => {
  for (const { co, zapytanie, init } of ZAPISY_W_OBCEJ) {
    const odpowiedz = await bazaJakoUzytkownikPanelu(OBSLUGA_DEMO, HASLO_PANELU, zapytanie, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    })
    expect({ co, odmowa: odpowiedz.status >= 400 }).toEqual({ co, odmowa: true })
  }

  await drugaStrzelnicaJestNietknieta()
})

/**
 * Godziny otwarcia i Wyjątki kalendarzowe obcej Strzelnicy. Granica stoi tu
 * inaczej niż przy Osi i Rezerwacji, bo żądanie **nie ma czym** wskazać obcej
 * Strzelnicy: godziny są jej własnością, a o tym, czyje są, rozstrzyga numer
 * konta podstawiony przez Edge Function (ADR 0010). Cała droga przejęcia wiedzie
 * więc przez funkcję bazodanową wołaną wprost, z podstawionym **cudzym** kontem
 * — i tej drogi nie ma: prawo wykonania mają wyłącznie Edge Functions
 * (ADR 0003).
 *
 * Zapis pytamy o ten najgroźniejszy z możliwych: tydzień pusty zamyka obcą
 * Strzelnicę na siedem dni w tygodniu, a zdjęcie wyjątku otwiera ją w święto —
 * jedno i drugie bez jej wiedzy.
 */
test('Użytkownik panelu nie zmieni godzin ani wyjątków obcej Strzelnicy', async () => {
  const drogi = [
    {
      co: 'tydzień godzin',
      funkcja: 'rpc/set_opening_hours',
      zadanie: { p_week: [], p_user_id: KONTO_DRUGIEJ },
    },
    {
      co: 'zapis wyjątku',
      funkcja: 'rpc/save_calendar_exception',
      zadanie: {
        p_on_date: '2030-01-01',
        p_reason: 'Wtręt',
        p_opens_minute: null,
        p_closes_minute: null,
        p_user_id: KONTO_DRUGIEJ,
      },
    },
    {
      co: 'zdjęcie wyjątku',
      funkcja: 'rpc/delete_calendar_exception',
      zadanie: { p_on_date: '2030-01-01', p_user_id: KONTO_DRUGIEJ },
    },
  ]

  for (const { co, funkcja, zadanie } of drogi) {
    const odpowiedz = await bazaJakoUzytkownikPanelu(OBSLUGA_DEMO, HASLO_PANELU, funkcja, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(zadanie),
    })
    expect({ co, odmowa: odpowiedz.status >= 400 }).toEqual({ co, odmowa: true })
  }

  // Obca Strzelnica ma swój tydzień i swój wyjątek — a tydzień pusty byłby
  // Strzelnicą zamkniętą na okrągło, i to bez jej wiedzy.
  expect(
    await baza<unknown[]>(`opening_hours?facility_id=eq.${OBCA.strzelnica}&select=id`),
  ).not.toHaveLength(0)
  expect(
    await baza<unknown[]>(`calendar_exceptions?facility_id=eq.${OBCA.strzelnica}&select=id`),
  ).not.toHaveLength(0)
})

/**
 * Odwołanie Rezerwacji — jedyna rzecz, którą konto Panelu w Rezerwacji
 * **zmienia** (ADR 0010) — pytane obiema drogami, którymi ktoś by o nie
 * poprosił, i z numerem obcej Rezerwacji wypisanym w tym pliku.
 *
 * Wprost do funkcji bazodanowej drogi nie ma: prawo jej wykonania mają
 * wyłącznie Edge Functions (ADR 0003), bo tam wychodzi list z powodem — bez
 * niego odwołanie byłoby cichym zniknięciem terminu. Tą, która jest, granicę
 * stawia baza: pustą odpowiedzią na obcy numer.
 *
 * Pustka, a nie odmowa, i tak ma być: „nie ma takiej Rezerwacji" i „jest, ale
 * nie twoja" są tu jednym zdaniem, bo drugie mówiłoby pytającemu o cudzych
 * Rezerwacjach.
 */
test('Użytkownik panelu nie odwoła Rezerwacji obcej Strzelnicy', async () => {
  // Wołanie Edge Function niżej przechodzi przez jej zimny start.
  test.slow()

  const wprost = await bazaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'rpc/revoke_booking',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_booking_id: OBCA.rezerwacja,
        p_reason: 'Wtręt.',
        // Konto podstawione własne: gdyby prawo do tej funkcji istniało,
        // przeglądarka podawałaby tu dowolne.
        p_user_id: KONTO_DEMO,
      }),
    },
  )
  expect({ wprost: wprost.status >= 400 }).toEqual({ wprost: true })

  // Ta sama funkcja kluczem anonimowym — i to samo: brak prawa.
  const anonimowo = await bazaAnonimowo('rpc/revoke_booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_booking_id: OBCA.rezerwacja,
      p_reason: 'Wtręt.',
      p_user_id: KONTO_DEMO,
    }),
  })
  expect({ anonimowo: anonimowo.status >= 400 }).toEqual({ anonimowo: true })

  // Droga, która jest: Edge Function z tokenem konta demo. Rezerwacja obcej
  // Strzelnicy jest dla niej nieznana — mimo że jej numer jest prawdziwy.
  const funkcja = await funkcjaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'odwolaj-rezerwacje',
    { bookingId: OBCA.rezerwacja, reason: 'Wtręt.' },
  )
  expect(funkcja.status).toBe(200)
  expect(await funkcja.json()).toEqual({ ok: false, problem: 'nieznana-rezerwacja' })

  // Obca Rezerwacja stoi, jak stała: potwierdzona i bez powodu odwołania.
  const [obca] = await baza<{ status: string; revocation_reason: string | null }[]>(
    `bookings?id=eq.${OBCA.rezerwacja}&select=status,revocation_reason`,
  )
  expect(obca).toEqual({ status: 'potwierdzona', revocation_reason: null })

  await drugaStrzelnicaJestNietknieta()
})

/**
 * To samo kluczem anonimowym, i nie jest to ten sam test dwa razy: konto
 * Panelu zatrzymują polityki RLS, a klucz anonimowy — brak prawa. Zapis
 * zablokowany wyłącznie polityką nie jest odmawiany, tylko trafia w zero
 * wierszy, a PostgREST kwituje to kodem 204, jakby się udał. Tu więc pytamy
 * o odmowę i to ona jest treścią: „ani zapis czegokolwiek poza poprawną
 * Rezerwacją" (spec, historia 61) ma stać na prawach, a nie na tym, czego
 * PostgREST akurat nie umie złożyć.
 *
 * Poprawna Rezerwacja idzie osobną drogą — Edge Function `zloz-rezerwacje`
 * (ADR 0003) — i ma własne pokrycie w `zlozenie-rezerwacji.spec.ts`. Ta droga
 * jest tą, której być nie ma.
 */
test('klucz anonimowy nie zapisze niczego w żadnej Strzelnicy', async () => {
  const zapisy = [
    ...ZAPISY_W_OBCEJ,
    // I to samo we Strzelnicy demonstracyjnej: klucz anonimowy nie jest
    // „obcy wobec drugiej", jest obcy wobec każdej.
    {
      co: 'zmiana Rezerwacji demo',
      zapytanie: `bookings?id=eq.${REZERWACJA_DEMO}`,
      init: { method: 'PATCH', body: JSON.stringify({ participants: 9 }) },
    },
    {
      co: 'dopisanie Osi',
      zapytanie: 'lanes',
      init: {
        method: 'POST',
        body: JSON.stringify({
          facility_id: STRZELNICA_DEMO,
          name: 'Oś dopisana kluczem anonimowym',
          capacity: 1,
          block_rate_gr: 0,
        }),
      },
    },
    {
      co: 'dopisanie konta Panelu',
      zapytanie: 'panel_users',
      init: {
        method: 'POST',
        body: JSON.stringify({ user_id: KONTO_DEMO, facility_id: OBCA.strzelnica }),
      },
    },
  ]

  for (const { co, zapytanie, init } of zapisy) {
    const odpowiedz = await bazaAnonimowo(zapytanie, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    })
    expect({ co, odmowa: odpowiedz.status >= 400 }).toEqual({ co, odmowa: true })
  }

  await drugaStrzelnicaJestNietknieta()

  // Strzelnica demonstracyjna też stoi, jak stała: Osi ma dwie, a Rezerwacja
  // z seeda swoich dwóch Uczestników.
  expect(await baza<unknown[]>(`lanes?facility_id=eq.${STRZELNICA_DEMO}&select=id`)).toHaveLength(2)
  const [rezerwacja] = await baza<{ participants: number }[]>(
    `bookings?id=eq.${REZERWACJA_DEMO}&select=participants`,
  )
  expect(rezerwacja?.participants).toBe(2)
})

/**
 * Publiczny klucz Widgetu stoi w kodzie w każdej przeglądarce świata, więc
 * traktujemy go jak ujawniony: pytamy nim wprost o wszystko, co jest daną
 * osobową, w obu Strzelnicach naraz. Tych pytań nie da się zadać przez
 * interfejs, bo interfejs ich nie zadaje — a to one są całą treścią zdania
 * „wyciek klucza nie jest incydentem".
 */
test('klucz anonimowy nie odczyta danych osobowych żadnej Strzelnicy', async () => {
  const zrodla = [
    'bookings?select=contact_name,contact_email,contact_phone',
    'bookings?select=management_token',
    'panel_bookings?select=contact_name',
    'mail_outbox?select=recipient,body_text',
    'weapon_rentals?select=booking_id',
    'ammunition_demands?select=booking_id',
    'panel_users?select=user_id',
    // Kontakt Strzelnicy i skrzynka obsługi: kolumny `facilities`, do której
    // klucz anonimowy wchodzi — ale nie do nich. Prawa idą tu kolumnami.
    'facilities?select=contact_email,contact_phone',
    'facilities?select=notification_email',
    // Powód Wyjątku kalendarzowego: czyta go wyłącznie obsługa, tak samo jak
    // powód Blokady. Klucz anonimowy wchodzi do tej tabeli po datę i godziny —
    // dzień zamknięty musi dojść do kalendarza klienta — ale nie po zdanie,
    // którym Strzelnica tłumaczy się sama sobie.
    'calendar_exceptions?select=reason',
  ]

  for (const zrodlo of zrodla) {
    expect({ zrodlo, wiersze: await wierszeAnonimowo(zrodlo) }).toEqual({ zrodlo, wiersze: [] })
  }

  // A po datę i godziny wchodzi — inaczej Widget sprzedawałby termin w święto.
  // Odmowa wszystkiego byłaby tu równie zła jak odmowa niczego.
  expect(
    await wierszeAnonimowo('calendar_exceptions?select=on_date,opens_minute,closes_minute'),
  ).not.toEqual([])

  // I nie jest to pustka z braku danych: rolą serwisową te same kolumny stoją
  // pełne. Ta asercja pilnuje poprzedniej pętli, nie bazy.
  const osobowe = await baza<{ contact_name: string }[]>('bookings?select=contact_name')
  expect(osobowe.length).toBeGreaterThan(0)

  const powody = await baza<{ reason: string | null }[]>('calendar_exceptions?select=reason')
  expect(powody.filter((wiersz) => wiersz.reason !== null).length).toBeGreaterThan(0)
})

/**
 * Blokada obcej Osi — druga rzecz, którą konto Panelu w bazie **zapisuje**
 * (ADR 0010) — pytana obiema drogami, którymi ktoś by o nią poprosił,
 * i z identyfikatorem obcej Osi wypisanym w tym pliku.
 *
 * Wprost do funkcji bazodanowej drogi nie ma, tak samo jak przy odwołaniu:
 * prawo jej wykonania mają wyłącznie Edge Functions (ADR 0003). Tą, która
 * jest, granicę stawia baza — pustą odpowiedzią na obcą Oś, a nie zaufaniem do
 * tego, co przyszło w żądaniu.
 */
test('Użytkownik panelu nie wyłączy ze sprzedaży obcej Osi', async () => {
  // Wołanie Edge Function niżej przechodzi przez jej zimny start.
  test.slow()

  const zadanie = {
    p_lane_id: OBCA.os,
    p_starts_at: '2030-01-01T10:00:00Z',
    p_ends_at: '2030-01-01T12:00:00Z',
    p_reason: 'Wtręt.',
    // Konto podstawione własne: gdyby prawo do tej funkcji istniało,
    // przeglądarka podawałaby tu dowolne.
    p_user_id: KONTO_DEMO,
  }

  const wprost = await bazaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'rpc/place_closure',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(zadanie) },
  )
  expect({ wprost: wprost.status >= 400 }).toEqual({ wprost: true })

  const anonimowo = await bazaAnonimowo('rpc/place_closure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(zadanie),
  })
  expect({ anonimowo: anonimowo.status >= 400 }).toEqual({ anonimowo: true })

  // Droga, która jest: Edge Function z tokenem konta demo. Obca Oś jest dla
  // niej nieznana — mimo że jej identyfikator jest prawdziwy.
  const funkcja = await funkcjaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'zablokuj-os',
    {
      laneId: OBCA.os,
      startsAt: '2030-01-01T10:00:00Z',
      endsAt: '2030-01-01T12:00:00Z',
      reason: 'Wtręt.',
    },
  )
  expect(funkcja.status).toBe(200)
  expect(await funkcja.json()).toEqual({ ok: false, problem: 'nieznana-os' })

  await drugaStrzelnicaJestNietknieta()
})

/**
 * Ręczny wpis Rezerwacji na obcej Osi — trzecia i ostatnia rzecz, którą konto
 * Panelu w bazie zapisuje. Granica stoi tu w miejscu, w którym mogłaby nie
 * stać: Strzelnicy w żądaniu nie ma wcale, więc funkcja **musi** ją sobie
 * wziąć z bazy po numerze konta (ADR 0010) — a identyfikator obcej Osi stoi
 * w żądaniu wprost i jest prawdziwy.
 *
 * Wprost do funkcji bazodanowej drogi nie ma, jak przy odwołaniu i Blokadzie:
 * prawo wykonania `place_booking` mają wyłącznie Edge Functions (ADR 0003), bo
 * tam liczy się Kwota i lista przekroczonych limitów. Tędy konto Panelu
 * podałoby sobie jedno i drugie samo.
 */
test('Użytkownik panelu nie wpisze Rezerwacji na obcej Osi', async () => {
  // Wołanie Edge Function niżej przechodzi przez jej zimny start.
  test.slow()

  const wprost = await bazaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'rpc/place_booking',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...NOWA_REZERWACJA,
        // Nazwy parametrów funkcji, nie kolumn tabeli — ale treść ta sama,
        // razem z Kwotą i Źródłem, które konto Panelu podałoby sobie samo.
        p_facility_id: OBCA.strzelnica,
        p_lane_id: OBCA.os,
        p_starts_at: NOWA_REZERWACJA.starts_at,
        p_ends_at: NOWA_REZERWACJA.ends_at,
        p_status: 'potwierdzona',
        p_participants: 1,
        p_contact_name: 'Wtręt',
        p_contact_email: 'wtret@example.pl',
        p_contact_phone: '600000000',
        p_has_permit: true,
        p_with_instructor: false,
        p_rentals: [],
        p_ammunition: [],
        p_amount_gr: 0,
        p_block_rate_gr: 0,
        p_participation_rate_gr: 0,
        p_instructor_rate_gr: 0,
        p_source: 'panel',
        p_limit_overrides: ['ponad-pojemnosc-osi'],
      }),
    },
  )
  expect({ wprost: wprost.status >= 400 }).toEqual({ wprost: true })

  // Droga, która jest: Edge Function z tokenem konta demo. Obca Oś jest dla
  // niej nieznana, choć jej identyfikator jest prawdziwy — bo Strzelnicę
  // funkcja bierze z konta, a nie z żądania.
  const funkcjaWpisu = await funkcjaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'wpisz-rezerwacje',
    {
      laneId: OBCA.os,
      day: '2030-01-01',
      startMinute: 600,
      participants: 1,
      contact: { name: 'Wtręt', email: 'wtret@example.pl', phone: '600000000' },
      consent: true,
      hasPermit: true,
      wantsInstructor: false,
      rentals: [],
      ammunition: [],
      overrides: [],
    },
  )
  expect(funkcjaWpisu.status).toBe(200)
  expect(await funkcjaWpisu.json()).toEqual({ ok: false, problem: 'nieznana-os' })

  await drugaStrzelnicaJestNietknieta()
})

/**
 * Konfiguracja obcej Osi — czwarta i piąta rzecz, którą konto Panelu w bazie
 * zapisuje: sama Oś i jej rozkład Bloków. Granica stoi w tym samym miejscu, co
 * przy Blokadzie i ręcznym wpisie: Strzelnicy w żądaniu nie ma, więc funkcja
 * bierze ją sobie z bazy po numerze konta (ADR 0010) — a identyfikator obcej
 * Osi stoi w żądaniu wprost i jest prawdziwy.
 *
 * Wprost do funkcji bazodanowych drogi nie ma, jak wszędzie indziej: prawo
 * wykonania `save_lane` i `set_lane_schedule` mają wyłącznie Edge Functions
 * (ADR 0003). Rozkład pytamy przy tym o zapis **pusty**, bo to jest żądanie
 * najgroźniejsze z możliwych: kasuje tydzień, nie zostawiając po nim niczego.
 */
test('Użytkownik panelu nie zmieni obcej Osi ani jej rozkładu', async () => {
  // Wołanie Edge Functions niżej przechodzi przez ich zimny start.
  test.slow()

  const wprostOs = await bazaJakoUzytkownikPanelu(OBSLUGA_DEMO, HASLO_PANELU, 'rpc/save_lane', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_lane_id: OBCA.os,
      p_name: 'Przejęta',
      p_capacity: 9,
      p_active: false,
      // Konto podstawione własne: gdyby prawo do tej funkcji istniało,
      // przeglądarka podawałaby tu dowolne.
      p_user_id: KONTO_DEMO,
    }),
  })
  expect({ wprostOs: wprostOs.status >= 400 }).toEqual({ wprostOs: true })

  const wprostRozklad = await bazaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'rpc/set_lane_schedule',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_lane_id: OBCA.os, p_week: [], p_user_id: KONTO_DEMO }),
    },
  )
  expect({ wprostRozklad: wprostRozklad.status >= 400 }).toEqual({ wprostRozklad: true })

  // Drogi, które są: Edge Functions z tokenem konta demo. Obca Oś jest dla nich
  // nieznana, choć jej identyfikator jest prawdziwy.
  const funkcjaOsi = await funkcjaJakoUzytkownikPanelu(OBSLUGA_DEMO, HASLO_PANELU, 'zapisz-os', {
    id: OBCA.os,
    name: 'Przejęta',
    capacity: 9,
    active: false,
  })
  expect(funkcjaOsi.status).toBe(200)
  expect(await funkcjaOsi.json()).toEqual({ ok: false, problem: 'nieznana-os' })

  const funkcjaRozkladu = await funkcjaJakoUzytkownikPanelu(
    OBSLUGA_DEMO,
    HASLO_PANELU,
    'ustaw-rozklad',
    { laneId: OBCA.os, week: [] },
  )
  expect(funkcjaRozkladu.status).toBe(200)
  expect(await funkcjaRozkladu.json()).toEqual({ ok: false, problem: 'nieznana-os' })

  // Obca Oś ma swoją nazwę i swój rozkład — a rozkład pusty byłby Osią bez ani
  // jednego terminu do wzięcia, i to bez wiedzy jej Strzelnicy.
  const [os] = await baza<{ name: string; active: boolean }[]>(
    `lanes?id=eq.${OBCA.os}&select=name,active`,
  )
  expect(os).toEqual({ name: OS_OBCA, active: true })
  expect(
    await baza<unknown[]>(`block_schedules?lane_id=eq.${OBCA.os}&select=id`),
  ).not.toHaveLength(0)

  await drugaStrzelnicaJestNietknieta()
})

/**
 * Blokady klucz anonimowy nie czyta wcale, choć widzi jej **skutek**. To jest
 * cała treść decyzji z migracji: powód wyłączenia jest sprawą wewnętrzną
 * Strzelnicy („Serwis po awarii" nie jest zdaniem do klienta), a zajętość
 * wychodzi do Widgetu widokiem — bez rozróżnienia, czy termin wziął klient,
 * czy zdjęła go obsługa.
 */
test('klucz anonimowy widzi skutek Blokady, ale nie ją samą', async () => {
  const [blokada] = await baza<{ starts_at: string }[]>(
    `lane_closures?id=eq.${OBCA.blokada}&select=starts_at`,
  )
  expect(blokada, 'seed nie ma czego chować: Blokada').toBeDefined()

  expect(await wierszeAnonimowo(`lane_closures?id=eq.${OBCA.blokada}&select=id`)).toEqual([])
  expect(await wierszeAnonimowo('lane_closures?select=reason')).toEqual([])

  // A termin tej Blokady stoi w zajętości — i to bez powodu przy nim.
  const zajetosc = await wierszeAnonimowo(
    `lane_occupancy?lane_id=eq.${OBCA.osZBlokada}&starts_at=eq.${encodeURIComponent(
      blokada?.starts_at ?? '',
    )}&select=*`,
  )
  expect(zajetosc).toHaveLength(1)
  expect(Object.keys(zajetosc[0] as object)).toEqual([
    'facility_id',
    'lane_id',
    'starts_at',
    'ends_at',
    'with_instructor',
  ])
})

/**
 * To samo, co wyżej, obejrzane z Panelu — bo obsługa nie pyta PostgREST-a
 * wprost, tylko patrzy na ekran, a rozdzielenie danych klientów jest tą
 * rzeczą, której nikt nie zauważy, dopóki nie zawiedzie.
 *
 * Obie Strzelnice mają Rezerwację w tym samym oknie czasu, więc gdyby Panel
 * dzielił dane po czymkolwiek innym niż Strzelnica, byłoby to tu widać.
 * Oba kierunki przechodzą tę samą drogę: własne widać, obcego nie ma — bo
 * pustka po obcym byłaby też pustką po awarii odczytu.
 */
const KONTA = [
  {
    konto: OBSLUGA_DEMO,
    strzelnica: 'Strzelnica Demo',
    wlasnyKlient: KLIENT_DEMO,
    obcyKlient: KLIENT_OBCY,
    obceOsie: [OS_OBCA],
  },
  {
    konto: OBSLUGA_DRUGIEJ,
    strzelnica: 'Strzelnica Druga',
    wlasnyKlient: KLIENT_OBCY,
    obcyKlient: KLIENT_DEMO,
    obceOsie: [OS_PISTOLETOWA, OS_KARABINOWA],
  },
]

for (const { konto, strzelnica, wlasnyKlient, obcyKlient, obceOsie } of KONTA) {
  test(`po zalogowaniu Panel pokazuje wyłącznie własną Strzelnicę (${konto})`, async ({
    page,
  }) => {
    await zalogujDoPanelu(page, konto)

    await expect(page.getByText(strzelnica)).toBeVisible()
    await expect(page.getByRole('table').getByText(wlasnyKlient)).toBeVisible()
    await expect(page.getByText(obcyKlient)).toBeHidden()

    // Nie tylko Rezerwacje: Osie obcej Strzelnicy też nie mają tu czego szukać,
    // bo filtr po Osi wystawiałby jej układ obiektu.
    const filtrOsi = page.getByLabel('Oś', { exact: true })
    for (const os of obceOsie) await expect(filtrOsi).not.toContainText(os)
  })
}

/**
 * Widok `panel_bookings` czyta `bookings` prawami właściciela, więc RLS tej
 * tabeli go nie dotyczy — wielodostępności pilnuje jego własny warunek. Skoro
 * tak, warto zadać mu pytanie wprost i bez zalogowania: bez konta
 * `panel_facility()` jest puste, a warunek fałszywy dla każdego wiersza.
 */
test('widok Panelu bez konta nie oddaje niczego', async () => {
  expect(await wierszeAnonimowo(`panel_bookings?id=eq.${REZERWACJA_DEMO}&select=id`)).toEqual([])
})
