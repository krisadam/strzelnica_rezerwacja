import { describe, expect, it } from 'vitest'
import type { PanelBooking, PanelBookingRows } from './index.ts'
import {
  dayAgenda,
  filterBookings,
  IncompletePanelBookingError,
  PANEL_DAYS_BACK,
  panelBookingsFromRows,
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
}): PanelBooking {
  const day = dane.day ?? '2026-06-15'
  const startsAt = new Date(`${day}T${String(dane.godzina ?? 10).padStart(2, '0')}:00:00Z`)

  return {
    id: dane.id,
    laneId: dane.laneId ?? OS_PISTOLETOWA,
    status: dane.status ?? 'potwierdzona',
    holdsTerm: dane.holdsTerm ?? true,
    booking: {
      facilityName: 'Strzelnica Demo',
      laneName: 'Oś',
      day,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60_000),
      timeZone: 'Europe/Warsaw',
      participants: 2,
      hasPermit: true,
      withInstructor: false,
      rentals: [],
      ammunition: [],
      amount: 12000,
      contact: { name: 'Jan Przykładowy', email: 'jan@example.pl', phone: '600100200' },
    },
  }
}

describe('Kalendarz dnia z podziałem na Osie', () => {
  it('rozdziela Rezerwacje dnia po Osiach, każdą pod swoją', () => {
    const pistolet = rezerwacja({ id: 'p', laneId: OS_PISTOLETOWA })
    const karabin = rezerwacja({ id: 'k', laneId: OS_KARABINOWA })

    const grafik = dayAgenda({
      lanes: OSIE,
      bookings: [karabin, pistolet],
      day: '2026-06-15',
    })

    expect(grafik.map((os) => os.lane.name)).toEqual([
      'Oś pistoletowa nr 1',
      'Oś karabinowa nr 2',
    ])
    expect(grafik[0]?.bookings.map((wpis) => wpis.id)).toEqual(['p'])
    expect(grafik[1]?.bookings.map((wpis) => wpis.id)).toEqual(['k'])
  })

  it('układa Rezerwacje Osi w porządku godzin, nie w porządku odczytu', () => {
    const grafik = dayAgenda({
      lanes: OSIE,
      bookings: [
        rezerwacja({ id: 'wieczor', godzina: 18 }),
        rezerwacja({ id: 'rano', godzina: 8 }),
        rezerwacja({ id: 'poludnie', godzina: 12 }),
      ],
      day: '2026-06-15',
    })

    expect(grafik[0]?.bookings.map((wpis) => wpis.id)).toEqual([
      'rano',
      'poludnie',
      'wieczor',
    ])
  })

  // Oś, na której dziś nic nie ma, jest odpowiedzią — i to tą, po którą obsługa
  // najczęściej tu zagląda. Zniknięcie wyglądałoby na Oś wycofaną z obiektu.
  it('zostawia Oś bez Rezerwacji na ekranie, z pustą listą', () => {
    const grafik = dayAgenda({
      lanes: OSIE,
      bookings: [rezerwacja({ id: 'p', laneId: OS_PISTOLETOWA })],
      day: '2026-06-15',
    })

    expect(grafik).toHaveLength(2)
    expect(grafik[1]?.bookings).toEqual([])
  })

  it('nie wpuszcza Rezerwacji innego dnia', () => {
    const grafik = dayAgenda({
      lanes: OSIE,
      bookings: [rezerwacja({ id: 'jutro', day: '2026-06-16' })],
      day: '2026-06-15',
    })

    expect(grafik.flatMap((os) => os.bookings)).toEqual([])
  })

  // Kalendarz odpowiada na pytanie „co dzieje się na Osi". Rezerwacja, która nie
  // trzyma już terminu, nie dzieje się na niej wcale — a pokazana zajmowałaby
  // godzinę, którą obsługa może komuś sprzedać przez telefon.
  it('pomija Rezerwacje, które terminu już nie trzymają', () => {
    const grafik = dayAgenda({
      lanes: OSIE,
      bookings: [
        rezerwacja({ id: 'stoi' }),
        rezerwacja({
          id: 'anulowana',
          status: 'anulowana-przez-klienta',
          holdsTerm: false,
        }),
        rezerwacja({ id: 'wygasla', status: 'oczekujaca', holdsTerm: false }),
      ],
      day: '2026-06-15',
    })

    expect(grafik[0]?.bookings.map((wpis) => wpis.id)).toEqual(['stoi'])
  })

  // Rezerwacja oczekująca trzyma Oś tak samo jak potwierdzona, dopóki nie minie
  // Czas na potwierdzenie — więc obsługa ma ją w kalendarzu widzieć.
  it('pokazuje Rezerwację oczekującą, która wciąż trzyma termin', () => {
    const grafik = dayAgenda({
      lanes: OSIE,
      bookings: [rezerwacja({ id: 'czeka', status: 'oczekujaca', holdsTerm: true })],
      day: '2026-06-15',
    })

    expect(grafik[0]?.bookings.map((wpis) => wpis.id)).toEqual(['czeka'])
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

  it('zatrzymują Rezerwację wskazującą Oś spoza Strzelnicy', () => {
    expect(() =>
      panelBookingsFromRows({
        ...WIERSZE,
        bookings: [{ ...WIERSZ, lane_id: '00000000-0000-0000-0000-00000000ffff' }],
      }),
    ).toThrow(UnknownLaneError)
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
