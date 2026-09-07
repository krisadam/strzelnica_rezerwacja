import { describe, expect, it } from 'vitest'
import type {
  DayAgendaInput,
  LaneClosure,
  LaneEntry,
  LimitOverride,
  OrderedItem,
  PanelBooking,
  PanelBookingRows,
  TallyItem,
} from './index.ts'
import {
  dayAgenda,
  dayTally,
  filterBookings,
  IncompletePanelBookingError,
  PANEL_DAYS_BACK,
  panelBookingsFromRows,
  panelOccupancy,
  panelWeaponOccupancy,
  panelWindow,
  UnknownLaneError,
} from './index.ts'

const OS_PISTOLETOWA = '00000000-0000-0000-0000-0000000000a1'
const OS_KARABINOWA = '00000000-0000-0000-0000-0000000000a2'

const OSIE = [
  { id: OS_PISTOLETOWA, name: 'Oś pistoletowa nr 1' },
  { id: OS_KARABINOWA, name: 'Oś karabinowa nr 2' },
]

/**
 * Rezerwacja Panelu sprowadzona do tego, o co pytają te testy: kiedy, na której
 * Osi, w jakim stanie i czy trzyma jeszcze termin. Reszta opisu ma własne
 * pokrycie tam, gdzie powstaje.
 */
function rezerwacja(dane: {
  id: string
  laneId?: string
  day?: string
  godzina?: number
  status?: PanelBooking['status']
  holdsTerm?: boolean
  revocationReason?: string | null
  source?: PanelBooking['source']
  limitOverrides?: readonly LimitOverride[]
  hasPermit?: boolean
  withInstructor?: boolean
  rentals?: readonly OrderedItem[]
  ammunition?: readonly OrderedItem[]
}): PanelBooking {
  const day = dane.day ?? '2026-06-15'
  const startsAt = new Date(`${day}T${String(dane.godzina ?? 10).padStart(2, '0')}:00:00Z`)

  return {
    id: dane.id,
    laneId: dane.laneId ?? OS_PISTOLETOWA,
    status: dane.status ?? 'potwierdzona',
    holdsTerm: dane.holdsTerm ?? true,
    revocationReason: dane.revocationReason ?? null,
    source: dane.source ?? 'widget',
    limitOverrides: dane.limitOverrides ?? [],
    booking: {
      facilityName: 'Strzelnica Demo',
      laneName: 'Oś',
      day,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60_000),
      timeZone: 'Europe/Warsaw',
      participants: 2,
      hasPermit: dane.hasPermit ?? true,
      withInstructor: dane.withInstructor ?? false,
      rentals: dane.rentals ?? [],
      ammunition: dane.ammunition ?? [],
      amount: 12000,
      contact: { name: 'Jan Przykładowy', email: 'jan@example.pl', phone: '600100200' },
    },
  }
}

const STREFA = 'Europe/Warsaw'

/**
 * Blokada sprowadzona do tego, o co pytają te testy: kiedy, na której Osi.
 * Powód ma własne pokrycie tam, gdzie o niego orzeka `closureProblems`.
 */
function blokada(dane: { id: string; laneId?: string; od: string; do: string }): LaneClosure {
  return {
    id: dane.id,
    laneId: dane.laneId ?? OS_PISTOLETOWA,
    startsAt: new Date(dane.od),
    endsAt: new Date(dane.do),
    reason: 'Serwis',
  }
}

/** Grafik dnia z domyślnie pustym wszystkim — test dokłada to, o co pyta. */
function grafikDnia(
  dane: Partial<DayAgendaInput<{ id: string; name: string }>> = {},
): ReturnType<typeof dayAgenda<{ id: string; name: string }>> {
  return dayAgenda({
    lanes: OSIE,
    bookings: [],
    closures: [],
    day: '2026-06-15',
    timeZone: STREFA,
    ...dane,
  })
}

/**
 * Co stanęło na Osi, znacznikiem i numerem. Znacznik jest tu treścią, nie
 * ozdobą asercji: kalendarz ma odróżniać Blokadę od Rezerwacji, a lista samych
 * numerów przeszłaby test także wtedy, gdyby wyglądały tak samo.
 */
function czym(entries: readonly LaneEntry[]): string[] {
  return entries.map((wpis) => `${wpis.kind}:${wpis.id}`)
}

describe('Kalendarz dnia z podziałem na Osie', () => {
  it('rozdziela Rezerwacje dnia po Osiach, każdą pod swoją', () => {
    const pistolet = rezerwacja({ id: 'p', laneId: OS_PISTOLETOWA })
    const karabin = rezerwacja({ id: 'k', laneId: OS_KARABINOWA })

    const grafik = grafikDnia({ bookings: [karabin, pistolet] })

    expect(grafik.map((os) => os.lane.name)).toEqual([
      'Oś pistoletowa nr 1',
      'Oś karabinowa nr 2',
    ])
    expect(czym(grafik[0]?.entries ?? [])).toEqual(['rezerwacja:p'])
    expect(czym(grafik[1]?.entries ?? [])).toEqual(['rezerwacja:k'])
  })

  it('układa Rezerwacje Osi w porządku godzin, nie w porządku odczytu', () => {
    const grafik = grafikDnia({
      bookings: [
        rezerwacja({ id: 'wieczor', godzina: 18 }),
        rezerwacja({ id: 'rano', godzina: 8 }),
        rezerwacja({ id: 'poludnie', godzina: 12 }),
      ],
    })

    expect(czym(grafik[0]?.entries ?? [])).toEqual([
      'rezerwacja:rano',
      'rezerwacja:poludnie',
      'rezerwacja:wieczor',
    ])
  })

  // Oś, na której dziś nic nie ma, jest odpowiedzią — i to tą, po którą obsługa
  // najczęściej tu zagląda. Zniknięcie wyglądałoby na Oś wycofaną z obiektu.
  it('zostawia Oś bez Rezerwacji na ekranie, z pustą listą', () => {
    const grafik = grafikDnia({ bookings: [rezerwacja({ id: 'p', laneId: OS_PISTOLETOWA })] })

    expect(grafik).toHaveLength(2)
    expect(grafik[1]?.entries).toEqual([])
  })

  it('nie wpuszcza Rezerwacji innego dnia', () => {
    const grafik = grafikDnia({ bookings: [rezerwacja({ id: 'jutro', day: '2026-06-16' })] })

    expect(grafik.flatMap((os) => os.entries)).toEqual([])
  })

  // Kalendarz odpowiada na pytanie „co dzieje się na Osi". Rezerwacja, która nie
  // trzyma już terminu, nie dzieje się na niej wcale — a pokazana zajmowałaby
  // godzinę, którą obsługa może komuś sprzedać przez telefon.
  it('pomija Rezerwacje, które terminu już nie trzymają', () => {
    const grafik = grafikDnia({
      bookings: [
        rezerwacja({ id: 'stoi' }),
        rezerwacja({
          id: 'anulowana',
          status: 'anulowana-przez-klienta',
          holdsTerm: false,
        }),
        rezerwacja({ id: 'wygasla', status: 'oczekujaca', holdsTerm: false }),
      ],
    })

    expect(czym(grafik[0]?.entries ?? [])).toEqual(['rezerwacja:stoi'])
  })

  // Rezerwacja oczekująca trzyma Oś tak samo jak potwierdzona, dopóki nie minie
  // Czas na potwierdzenie — więc obsługa ma ją w kalendarzu widzieć.
  it('pokazuje Rezerwację oczekującą, która wciąż trzyma termin', () => {
    const grafik = grafikDnia({
      bookings: [rezerwacja({ id: 'czeka', status: 'oczekujaca', holdsTerm: true })],
    })

    expect(czym(grafik[0]?.entries ?? [])).toEqual(['rezerwacja:czeka'])
  })

  // Blokada zajmuje Oś tak samo jak Rezerwacja, więc stoi w tym samym szeregu
  // i w tym samym porządku godzin — a nie w osobnej liście pod spodem, gdzie
  // czytający musiałby złożyć dzień Osi z dwóch miejsc.
  it('stawia Blokadę w szeregu z Rezerwacjami, w porządku godzin', () => {
    const grafik = grafikDnia({
      bookings: [rezerwacja({ id: 'rezerwacja', godzina: 10 })],
      closures: [
        blokada({ id: 'po', od: '2026-06-15T14:00:00Z', do: '2026-06-15T16:00:00Z' }),
        blokada({ id: 'przed', od: '2026-06-15T06:00:00Z', do: '2026-06-15T08:00:00Z' }),
      ],
    })

    expect(czym(grafik[0]?.entries ?? [])).toEqual([
      'blokada:przed',
      'rezerwacja:rezerwacja',
      'blokada:po',
    ])
  })

  it('trzyma Blokadę przy jej Osi', () => {
    const grafik = grafikDnia({
      closures: [
        blokada({
          id: 'karabinowa',
          laneId: OS_KARABINOWA,
          od: '2026-06-15T08:00:00Z',
          do: '2026-06-15T10:00:00Z',
        }),
      ],
    })

    expect(grafik[0]?.entries).toEqual([])
    expect(czym(grafik[1]?.entries ?? [])).toEqual(['blokada:karabinowa'])
  })

  // Blokada bierze dowolny zakres czasu, więc bywa dłuższa od doby: Oś
  // wyłączona na trzy dni serwisu jest wyłączona każdego z nich. Kalendarz
  // filtrujący po dniu **początku** pokazałby ją tylko pierwszego — i drugiego
  // dnia obsługa sprzedałaby termin, którego nie ma.
  it('pokazuje Blokadę zaczętą wcześniej i kończącą się później', () => {
    const grafik = grafikDnia({
      closures: [
        blokada({ id: 'trzydniowa', od: '2026-06-14T06:00:00Z', do: '2026-06-17T06:00:00Z' }),
      ],
    })

    expect(czym(grafik[0]?.entries ?? [])).toEqual(['blokada:trzydniowa'])
    expect(grafik[0]?.entries[0]).toMatchObject({ beyondDay: true })
  })

  it('nie mówi o wyjściu poza dzień przy Blokadzie, która się w nim mieści', () => {
    const grafik = grafikDnia({
      closures: [
        // Doba Strzelnicy 15 czerwca to 14.06 22:00 – 15.06 22:00 UTC; ta
        // Blokada trwa od jej pierwszej minuty do ostatniej.
        blokada({ id: 'calodobowa', od: '2026-06-14T22:00:00Z', do: '2026-06-15T22:00:00Z' }),
      ],
    })

    expect(grafik[0]?.entries[0]).toMatchObject({ beyondDay: false })
  })

  // Granice doby domknięte tak samo jak wszędzie: od początku włącznie, od
  // końca wyłącznie. Blokada kończąca się o północy należy do dnia, który się
  // nią domyka, a nie do następnego.
  it('nie wpuszcza Blokady, która kończy się z początkiem dnia', () => {
    const grafik = grafikDnia({
      closures: [
        blokada({ id: 'wczorajsza', od: '2026-06-14T18:00:00Z', do: '2026-06-14T22:00:00Z' }),
      ],
    })

    expect(grafik.flatMap((os) => os.entries)).toEqual([])
  })

  it('nie wpuszcza Blokady, która zaczyna się z końcem dnia', () => {
    const grafik = grafikDnia({
      closures: [
        blokada({ id: 'jutrzejsza', od: '2026-06-15T22:00:00Z', do: '2026-06-16T02:00:00Z' }),
      ],
    })

    expect(grafik.flatMap((os) => os.entries)).toEqual([])
  })
})

/**
 * Zajętość Osi złożona z tego, co Panel ma pod ręką. Idzie stąd wprost do
 * `closureProblems`, więc pomyłka tutaj znaczy Blokadę wpuszczoną na cudzy
 * termin albo odmowę na terminie wolnym.
 */
describe('Zajętość Osi widziana z Panelu', () => {
  it('bierze Rezerwacje trzymające termin, razem z ich Instruktorem', () => {
    const zajetosc = panelOccupancy({
      bookings: [rezerwacja({ id: 'stoi', godzina: 10 })],
      closures: [],
    })

    expect(zajetosc).toEqual([
      {
        laneId: OS_PISTOLETOWA,
        startsAt: new Date('2026-06-15T10:00:00Z'),
        endsAt: new Date('2026-06-15T12:00:00Z'),
        withInstructor: false,
      },
    ])
  })

  // Rezerwacja, która terminu nie trzyma, nie odbiera go nikomu — także
  // Blokadzie. Wpuszczona tutaj kazałaby obsłudze odwoływać coś, co już nie
  // istnieje, żeby wyłączyć Oś na serwis.
  it('pomija Rezerwacje, które terminu już nie trzymają', () => {
    const zajetosc = panelOccupancy({
      bookings: [rezerwacja({ id: 'wygasla', status: 'oczekujaca', holdsTerm: false })],
      closures: [],
    })

    expect(zajetosc).toEqual([])
  })

  it('bierze Blokady i nie daje im Instruktora', () => {
    const zajetosc = panelOccupancy({
      bookings: [],
      closures: [
        blokada({ id: 'serwis', od: '2026-06-15T08:00:00Z', do: '2026-06-15T10:00:00Z' }),
      ],
    })

    expect(zajetosc).toEqual([
      {
        laneId: OS_PISTOLETOWA,
        startsAt: new Date('2026-06-15T08:00:00Z'),
        endsAt: new Date('2026-06-15T10:00:00Z'),
        withInstructor: false,
      },
    ])
  })
})

describe('Lista Rezerwacji z filtrami', () => {
  const WSZYSTKIE = [
    rezerwacja({ id: 'pistolet-15', laneId: OS_PISTOLETOWA, day: '2026-06-15', godzina: 12 }),
    rezerwacja({ id: 'karabin-15', laneId: OS_KARABINOWA, day: '2026-06-15', godzina: 9 }),
    rezerwacja({ id: 'pistolet-16', laneId: OS_PISTOLETOWA, day: '2026-06-16' }),
  ]

  it('bez filtrów pokazuje wszystko, od najwcześniejszej', () => {
    expect(filterBookings(WSZYSTKIE, {}).map((wpis) => wpis.id)).toEqual([
      'karabin-15',
      'pistolet-15',
      'pistolet-16',
    ])
  })

  it('zawęża do dnia', () => {
    expect(filterBookings(WSZYSTKIE, { day: '2026-06-16' }).map((wpis) => wpis.id)).toEqual([
      'pistolet-16',
    ])
  })

  it('zawęża do Osi', () => {
    expect(
      filterBookings(WSZYSTKIE, { laneId: OS_PISTOLETOWA }).map((wpis) => wpis.id),
    ).toEqual(['pistolet-15', 'pistolet-16'])
  })

  it('składa oba filtry', () => {
    expect(
      filterBookings(WSZYSTKIE, { day: '2026-06-15', laneId: OS_PISTOLETOWA }).map(
        (wpis) => wpis.id,
      ),
    ).toEqual(['pistolet-15'])
  })

  // Puste znaczy „bez zawężenia", a nie „dzisiaj" ani „pierwsza Oś": lista, która
  // sama coś wybiera, przemilcza Rezerwacje stojące obok.
  it('puste filtry niczego nie zawężają', () => {
    expect(filterBookings(WSZYSTKIE, { day: null, laneId: null })).toHaveLength(3)
  })

  // Inaczej niż kalendarz: to tu obsługa szuka zgłoszenia, o które ktoś dzwoni,
  // a bywa nim właśnie to anulowane.
  it('pokazuje także Rezerwacje, które terminu nie trzymają', () => {
    const anulowana = rezerwacja({
      id: 'anulowana',
      status: 'anulowana-przez-klienta',
      holdsTerm: false,
    })

    expect(filterBookings([anulowana], {}).map((wpis) => wpis.id)).toEqual(['anulowana'])
  })
})

const GLOCK = 'Glock 17'
const SHADOW = 'CZ Shadow 2'
const PARABELLUM = '9 × 19 mm Parabellum'
const BOCZNY = '.22 Long Rifle'

/** Co i ile — pozycje zestawienia sprowadzone do jednego napisu na wiersz. */
function ile(pozycje: readonly TallyItem[]): string[] {
  return pozycje.map((pozycja) => `${pozycja.name}: ${pozycja.quantity}`)
}

describe('Zestawienie dnia', () => {
  const PORANNA = rezerwacja({
    id: 'poranna',
    godzina: 9,
    rentals: [{ name: GLOCK, quantity: 2 }],
    ammunition: [{ name: PARABELLUM, quantity: 100 }],
  })

  const POLUDNIOWA = rezerwacja({
    id: 'poludniowa',
    godzina: 12,
    rentals: [
      { name: SHADOW, quantity: 3 },
      { name: GLOCK, quantity: 1 },
    ],
    ammunition: [
      { name: BOCZNY, quantity: 200 },
      { name: PARABELLUM, quantity: 50 },
    ],
  })

  const DZIEN = '2026-06-15'

  it('sumuje Wypożyczenia po Typach broni', () => {
    const { weapons } = dayTally({ bookings: [PORANNA, POLUDNIOWA], day: DZIEN })

    expect(ile(weapons)).toEqual([`${SHADOW}: 3`, `${GLOCK}: 3`])
  })

  it('sumuje Zapotrzebowanie po Rodzajach amunicji', () => {
    const { ammunition } = dayTally({ bookings: [PORANNA, POLUDNIOWA], day: DZIEN })

    expect(ile(ammunition)).toEqual([`${BOCZNY}: 200`, `${PARABELLUM}: 150`])
  })

  // Instruktor jest człowiekiem do postawienia na Osi, więc liczy się każda
  // Rezerwacja, na której ma stanąć — nie tylko ta, której go brak Pozwolenia
  // narzucił. Grafik zmiany wychodzi z jednej liczby i z drugiej tak samo.
  it('liczy Rezerwacje z Instruktorem — wymaganym i zamówionym', () => {
    const bezPozwolenia = rezerwacja({ id: 'wymagany', hasPermit: false, withInstructor: true })
    const zamowiony = rezerwacja({ id: 'zamowiony', hasPermit: true, withInstructor: true })
    const sama = rezerwacja({ id: 'bez' })

    const { instructorBookings } = dayTally({
      bookings: [bezPozwolenia, zamowiony, sama],
      day: DZIEN,
    })

    expect(instructorBookings.map((wpis) => wpis.id)).toEqual(['wymagany', 'zamowiony'])
  })

  /**
   * Zestawienie jest listą do przygotowania, a nie obrazem zajętości: liczy się
   * to, po co ktoś naprawdę przyjedzie. Oczekująca odpada mimo że trzyma
   * jeszcze termin — pod zmyślony adres nie wykłada się broni z magazynu.
   */
  it.each([
    ['oczekująca', 'oczekujaca', true],
    ['wygasła', 'wygasla', false],
    ['anulowana przez klienta', 'anulowana-przez-klienta', false],
    ['odwołana przez Strzelnicę', 'odwolana-przez-strzelnice', false],
  ] as const)('nie wlicza Rezerwacji %s', (_nazwa, status, holdsTerm) => {
    const odpada = rezerwacja({
      id: 'odpada',
      status,
      holdsTerm,
      withInstructor: true,
      rentals: [{ name: GLOCK, quantity: 2 }],
      ammunition: [{ name: PARABELLUM, quantity: 100 }],
    })

    const zestawienie = dayTally({ bookings: [odpada], day: DZIEN })

    expect(zestawienie.weapons).toEqual([])
    expect(zestawienie.ammunition).toEqual([])
    expect(zestawienie.instructorBookings).toEqual([])
  })

  it('nie wlicza Rezerwacji innego dnia', () => {
    const jutrzejsza = rezerwacja({
      id: 'jutro',
      day: '2026-06-16',
      rentals: [{ name: GLOCK, quantity: 5 }],
    })

    expect(dayTally({ bookings: [PORANNA, jutrzejsza], day: DZIEN }).weapons).toEqual([
      { name: GLOCK, quantity: 2, shares: [{ booking: PORANNA, quantity: 2 }] },
    ])
  })

  /**
   * Po to zestawienie niesie Rezerwacje, a nie same liczby: „trzy Glocki" bez
   * nich jest liczbą, której nie da się z niczym skonfrontować, a obsługa pyta
   * dalej — czyje to i o której.
   */
  it('prowadzi z pozycji do Rezerwacji, z których wynikła, od najwcześniejszej', () => {
    const { weapons } = dayTally({ bookings: [POLUDNIOWA, PORANNA], day: DZIEN })
    const glock = weapons.find((pozycja) => pozycja.name === GLOCK)

    expect(glock?.shares).toEqual([
      { booking: PORANNA, quantity: 2 },
      { booking: POLUDNIOWA, quantity: 1 },
    ])
  })

  // Rezerwacja bez sprzętu nie staje przy żadnej pozycji — pusty wiersz „Glock
  // 17 — 0 szt." kazałby obsłudze wyjmować broń, której nikt nie zamówił.
  it('pomija Rezerwacje bez sprzętu', () => {
    const golasem = rezerwacja({ id: 'golasem' })

    const zestawienie = dayTally({ bookings: [golasem], day: DZIEN })

    expect(zestawienie.weapons).toEqual([])
    expect(zestawienie.ammunition).toEqual([])
  })
})

const REZERWACJA_ID = '00000000-0000-0000-0000-0000000000b1'

const WIERSZ: PanelBookingRows['bookings'][number] = {
  id: REZERWACJA_ID,
  facility_id: '00000000-0000-0000-0000-000000000001',
  lane_id: OS_PISTOLETOWA,
  starts_at: '2026-06-15T08:00:00Z',
  ends_at: '2026-06-15T10:00:00Z',
  status: 'potwierdzona',
  holds_term: true,
  participants: 2,
  has_permit: false,
  with_instructor: true,
  contact_name: 'Jan Przykładowy',
  contact_email: 'jan@example.pl',
  contact_phone: '600100200',
  amount_gr: 37000,
  revocation_reason: null,
  source: 'widget',
  limit_overrides: [],
}

const WIERSZE: PanelBookingRows = {
  bookings: [WIERSZ],
  facility: { name: 'Strzelnica Demo', timezone: 'Europe/Warsaw' },
  lanes: OSIE,
  rentals: [
    {
      booking_id: REZERWACJA_ID,
      weapon_type_id: '00000000-0000-0000-0000-0000000000c2',
      quantity: 1,
    },
  ],
  ammunition: [
    {
      booking_id: REZERWACJA_ID,
      ammunition_kind_id: '00000000-0000-0000-0000-0000000000e3',
      quantity: 200,
    },
  ],
  weaponTypes: [{ id: '00000000-0000-0000-0000-0000000000c2', name: 'CZ Shadow 2' }],
  ammunitionKinds: [{ id: '00000000-0000-0000-0000-0000000000e3', name: '.22 Long Rifle' }],
}

describe('Rezerwacje Panelu z wierszy bazy', () => {
  it('niosą pełne szczegóły: kontakt, Uczestników, sprzęt, Instruktora i Kwotę', () => {
    const [wpis] = panelBookingsFromRows(WIERSZE)

    expect(wpis?.id).toBe(REZERWACJA_ID)
    expect(wpis?.laneId).toBe(OS_PISTOLETOWA)
    expect(wpis?.status).toBe('potwierdzona')
    expect(wpis?.holdsTerm).toBe(true)
    expect(wpis?.booking.laneName).toBe('Oś pistoletowa nr 1')
    expect(wpis?.booking.participants).toBe(2)
    expect(wpis?.booking.hasPermit).toBe(false)
    expect(wpis?.booking.withInstructor).toBe(true)
    expect(wpis?.booking.rentals).toEqual([{ name: 'CZ Shadow 2', quantity: 1 }])
    expect(wpis?.booking.ammunition).toEqual([{ name: '.22 Long Rifle', quantity: 200 }])
    expect(wpis?.booking.amount).toBe(37000)
    expect(wpis?.booking.contact).toEqual({
      name: 'Jan Przykładowy',
      email: 'jan@example.pl',
      phone: '600100200',
    })
  })

  // Dzień liczony w strefie Strzelnicy, a nie w UTC: Blok zaczynający się o 23:30
  // czasu warszawskiego wciąż należy do dnia, na który go sprzedano.
  it('liczą dzień w strefie Strzelnicy', () => {
    const [wpis] = panelBookingsFromRows({
      ...WIERSZE,
      bookings: [{ ...WIERSZ, starts_at: '2026-06-15T21:30:00Z' }],
    })

    expect(wpis?.booking.day).toBe('2026-06-15')
  })

  it('rozdzielają pozycje po Rezerwacjach, do których należą', () => {
    const druga = { ...WIERSZ, id: '00000000-0000-0000-0000-0000000000b9' }
    const wpisy = panelBookingsFromRows({ ...WIERSZE, bookings: [WIERSZ, druga] })

    expect(wpisy[0]?.booking.rentals).toHaveLength(1)
    // Rezerwacja bez zamówionego sprzętu ma puste listy, a nie cudze pozycje.
    expect(wpisy[1]?.booking.rentals).toEqual([])
    expect(wpisy[1]?.booking.ammunition).toEqual([])
  })

  // Kolumny widoku są w wygenerowanych typach dopuszczalnie puste — Postgres nie
  // umie o widoku powiedzieć więcej. Brak zatrzymuje się na wejściu, zamiast
  // zamieniać się w Rezerwację bez terminu.
  it('zatrzymują wiersz bez terminu, zamiast pokazać Rezerwację bez godziny', () => {
    expect(() =>
      panelBookingsFromRows({ ...WIERSZE, bookings: [{ ...WIERSZ, starts_at: null }] }),
    ).toThrow(IncompletePanelBookingError)
  })

  // `false` i zero są tu wartościami, a nie brakiem: Rezerwacja bez Instruktora
  // i Rezerwacja za darmo mają przejść.
  it('przepuszczają Rezerwację bez Instruktora i bez Kwoty', () => {
    const [wpis] = panelBookingsFromRows({
      ...WIERSZE,
      bookings: [{ ...WIERSZ, has_permit: true, with_instructor: false, amount_gr: 0 }],
    })

    expect(wpis?.booking.withInstructor).toBe(false)
    expect(wpis?.booking.amount).toBe(0)
  })

  /**
   * Powód odwołania jedzie razem ze stanem, bo bez niego stan stałby na ekranie
   * bez wyjaśnienia — i obsługa dzwoniłaby po koleżankę, która odwoływała.
   */
  it('niosą powód odwołania razem ze stanem', () => {
    const [wpis] = panelBookingsFromRows({
      ...WIERSZE,
      bookings: [
        {
          ...WIERSZ,
          status: 'odwolana-przez-strzelnice',
          holds_term: false,
          revocation_reason: 'Awaria wentylacji na Osi.',
        },
      ],
    })

    expect(wpis?.status).toBe('odwolana-przez-strzelnice')
    expect(wpis?.revocationReason).toBe('Awaria wentylacji na Osi.')
  })

  // Puste znaczy Rezerwację nieodwołaną, a nie wiersz niepełny: powodu nie ma
  // żadna Rezerwacja poza odwołanymi.
  it('przepuszczają Rezerwację bez powodu odwołania', () => {
    expect(panelBookingsFromRows(WIERSZE)[0]?.revocationReason).toBeNull()
  })

  it('zatrzymują Rezerwację wskazującą Oś spoza Strzelnicy', () => {
    expect(() =>
      panelBookingsFromRows({
        ...WIERSZE,
        bookings: [{ ...WIERSZ, lane_id: '00000000-0000-0000-0000-00000000ffff' }],
      }),
    ).toThrow(UnknownLaneError)
  })

  it('niosą Źródło Rezerwacji i przekroczone przy niej limity', () => {
    const [wpis] = panelBookingsFromRows({
      ...WIERSZE,
      bookings: [
        {
          ...WIERSZ,
          source: 'panel',
          limit_overrides: ['poza-godzinami-otwarcia', 'ponad-pojemnosc-osi'],
        },
      ],
    })

    expect(wpis?.source).toBe('panel')
    expect(wpis?.limitOverrides).toEqual(['poza-godzinami-otwarcia', 'ponad-pojemnosc-osi'])
  })

  // Pusta lista znaczy Rezerwację mieszczącą się w regułach Strzelnicy, a nie
  // wiersz niepełny — i pusto ma każda Rezerwacja z Widgetu.
  it('przepuszczają Rezerwację bez przekroczonych limitów', () => {
    const [wpis] = panelBookingsFromRows(WIERSZE)

    expect(wpis?.source).toBe('widget')
    expect(wpis?.limitOverrides).toEqual([])
  })

  it.each(['source', 'limit_overrides'] as const)(
    'zatrzymują wiersz bez kolumny %s',
    (kolumna) => {
      expect(() =>
        panelBookingsFromRows({
          ...WIERSZE,
          bookings: [{ ...WIERSZ, [kolumna]: null }],
        }),
      ).toThrow(IncompletePanelBookingError)
    },
  )
})

/**
 * Sztuki Typów broni trzymane przez Rezerwacje Panelu. Widoku zajętości Panel
 * nie czyta wcale i nie ma do niego prawa (ADR 0009), więc składa ją z tego, co
 * ma pod ręką — a formularz ręcznego wpisu pyta o dostępność tą samą funkcją,
 * co kalendarz klienta.
 */
describe('sztuki broni trzymane przez Rezerwacje Panelu', () => {
  const GLOCK = '00000000-0000-0000-0000-0000000000c1'

  it('bierze termin z Rezerwacji, do której pozycja należy', () => {
    const wpis = rezerwacja({ id: 'r1', godzina: 10 })

    expect(
      panelWeaponOccupancy({
        bookings: [wpis],
        rentals: [{ bookingId: 'r1', weaponTypeId: GLOCK, quantity: 2 }],
      }),
    ).toEqual([
      {
        weaponTypeId: GLOCK,
        quantity: 2,
        startsAt: wpis.booking.startsAt,
        endsAt: wpis.booking.endsAt,
      },
    ])
  })

  // Anulowana oddaje broń tą samą zmianą stanu, którą oddaje Oś — osobnego
  // kroku nie ma tu ani jednego.
  it('pomija pozycje Rezerwacji, która terminu już nie trzyma', () => {
    expect(
      panelWeaponOccupancy({
        bookings: [rezerwacja({ id: 'r1', holdsTerm: false })],
        rentals: [{ bookingId: 'r1', weaponTypeId: GLOCK, quantity: 2 }],
      }),
    ).toEqual([])
  })

  // Okno odczytu Panelu zawęża Rezerwacje i pozycje osobnymi zapytaniami, więc
  // pozycja bez swojej Rezerwacji jest tu możliwa — i nie ma czym trzymać
  // sztuk, skoro nie wiadomo, w jakim terminie.
  it('pomija pozycję, której Rezerwacji nie ma pod ręką', () => {
    expect(
      panelWeaponOccupancy({
        bookings: [],
        rentals: [{ bookingId: 'nieznana', weaponTypeId: GLOCK, quantity: 2 }],
      }),
    ).toEqual([])
  })

  it('nie sumuje pozycji ze sobą — zajętość liczy się po terminach', () => {
    const rano = rezerwacja({ id: 'r1', godzina: 10 })
    const popoludniu = rezerwacja({ id: 'r2', godzina: 14 })

    expect(
      panelWeaponOccupancy({
        bookings: [rano, popoludniu],
        rentals: [
          { bookingId: 'r1', weaponTypeId: GLOCK, quantity: 1 },
          { bookingId: 'r2', weaponTypeId: GLOCK, quantity: 1 },
        ],
      }),
    ).toHaveLength(2)
  })
})

describe('okno, z którego Panel czyta Rezerwacje', () => {
  const STREFA = 'Europe/Warsaw'

  it('sięga tydzień wstecz i po horyzont Strzelnicy włącznie', () => {
    expect(
      panelWindow({
        timeZone: STREFA,
        horizonDays: 30,
        now: new Date('2026-06-15T09:00:00Z'),
      }),
    ).toEqual({ from: '2026-06-08', to: '2026-07-15' })
  })

  // Horyzont zerowy znaczy „wyłącznie dzisiaj", więc dzień dzisiejszy do okna
  // należy — inaczej Strzelnica przyjmująca Rezerwacje tylko na dziś nie
  // widziałaby w Panelu ani jednej.
  it('horyzont zerowy zostawia dzisiaj w oknie', () => {
    expect(
      panelWindow({ timeZone: STREFA, horizonDays: 0, now: new Date('2026-06-15T09:00:00Z') }).to,
    ).toBe('2026-06-15')
  })

  // Dzień liczy zegar Strzelnicy, a nie zegar obsługi: o 23:30 czasu
  // warszawskiego jest jeszcze 15 czerwca, choć w UTC już 21:30 tego samego dnia
  // — a o 00:30 jest już 16, choć w UTC wciąż 15.
  it('liczy dzisiaj zegarem Strzelnicy', () => {
    expect(
      panelWindow({ timeZone: STREFA, horizonDays: 0, now: new Date('2026-06-15T22:30:00Z') }).to,
    ).toBe('2026-06-16')
  })

  it('okno jest ruchome, więc nie rośnie z historią Strzelnicy', () => {
    const wczesniej = panelWindow({
      timeZone: STREFA,
      horizonDays: 30,
      now: new Date('2026-06-15T09:00:00Z'),
    })
    const pozniej = panelWindow({
      timeZone: STREFA,
      horizonDays: 30,
      now: new Date('2027-06-15T09:00:00Z'),
    })

    expect(pozniej.from).not.toBe(wczesniej.from)
    expect(PANEL_DAYS_BACK).toBeGreaterThan(0)
  })
})
