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
import { baza, bazaAnonimowo, bazaJakoUzytkownikPanelu } from './srodowisko.js'

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
  rezerwacja: '00000000-0000-0000-0000-0000000000b2',
  wypozyczenie: '00000000-0000-0000-0000-0000000000d2',
  zapotrzebowanie: '00000000-0000-0000-0000-0000000000f2',
  list: '00000000-0000-0000-0000-000000000201',
}

const STRZELNICA_DEMO = '00000000-0000-0000-0000-000000000001'
/** Konto obsługi demo — to, którym przepisano by się na obcą Strzelnicę. */
const KONTO_DEMO = '00000000-0000-0000-0000-000000000101'

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
]

/** Druga Strzelnica w kształcie, w jakim zostawił ją seed. */
async function drugaStrzelnicaJestNietknieta(): Promise<void> {
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
  ]

  for (const zrodlo of zrodla) {
    expect({ zrodlo, wiersze: await wierszeAnonimowo(zrodlo) }).toEqual({ zrodlo, wiersze: [] })
  }

  // I nie jest to pustka z braku danych: rolą serwisową te same kolumny stoją
  // pełne. Ta asercja pilnuje poprzedniej pętli, nie bazy.
  const osobowe = await baza<{ contact_name: string }[]>('bookings?select=contact_name')
  expect(osobowe.length).toBeGreaterThan(0)
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
