import { describe, expect, it } from 'vitest'
import type {
  BookingDraft,
  Block,
  Lane,
  LimitOverride,
  ManualBookingRequest,
  Unavailability,
} from './index.ts'
import {
  LIMIT_OVERRIDES,
  MalformedBookingRequestError,
  manualBookingReview,
  readManualBookingRequest,
  unconfirmedOverrides,
} from './index.ts'

/** Oś czteroosobowa — pojemność jest tu limitem, który da się przekroczyć. */
const OS: Lane = {
  id: 'os-1',
  name: 'Oś pistoletowa nr 1',
  capacity: 4,
  blockRate: 12_000,
  active: true,
}

const KATALOG_AMUNICJI = [{ id: '9x19', name: '9 × 19 mm Parabellum', unitPrice: 150 }]

/**
 * Blok z grafiku dnia wraz z powodami, dla których nie jest wolny. Powody
 * podaje się wprost, a `available` i `refusals` składa ten pomocnik: Blok wolny
 * z powodem albo niedostępny bez powodu jest kształtem, którego dostępność nie
 * wystawia.
 */
function blok(...powody: Unavailability[]): Block {
  return {
    scheduleId: 'blok-1-600',
    laneId: OS.id,
    startMinute: 600,
    startsAt: new Date('2026-06-15T08:00:00Z'),
    endsAt: new Date('2026-06-15T10:00:00Z'),
    available: powody.length === 0,
    refusals: powody,
  }
}

function zgloszenie(nadpisania: Partial<BookingDraft> = {}): BookingDraft {
  return {
    participants: 2,
    contact: { name: 'Jan Przykładowy', email: 'jan@example.pl', phone: '600100200' },
    consent: true,
    hasPermit: true,
    wantsInstructor: false,
    rentals: [],
    ammunition: [],
    ...nadpisania,
  }
}

function osad(draft: BookingDraft = zgloszenie(), block: Block | undefined = blok()) {
  return manualBookingReview({ draft, lane: OS, block, ammunitionKinds: KATALOG_AMUNICJI })
}

describe('ręczny wpis Rezerwacji', () => {
  it('nie ma zastrzeżeń ani przekroczeń, gdy wpis mieści się w regułach', () => {
    expect(osad()).toEqual({ problems: [], exceeded: [] })
  })

  it('wypisuje wszystkie zastrzeżenia naraz, a nie pierwsze z brzegu', () => {
    const { problems } = osad(zgloszenie({ contact: { name: '', email: '', phone: '' } }))

    expect(problems).toEqual(['brak-imienia', 'niepoprawny-email', 'brak-telefonu'])
  })

  /**
   * Zastrzeżenia do samego formularza są te same, co w Widgecie — obsługa
   * wpisuje przez telefon dokładnie te dane, które klient wpisuje sobie sam,
   * więc pozycja na zero sztuk jest pomyłką po obu stronach.
   */
  it('odsiewa pozycje i kontakt tak samo jak zgłoszenie z Widgetu', () => {
    const { problems } = osad(
      zgloszenie({
        rentals: [{ weaponTypeId: 'glock', quantity: 0 }],
        ammunition: [{ ammunitionKindId: 'nieznany', quantity: 50 }],
        consent: false,
      }),
    )

    expect(problems).toEqual([
      'niepoprawne-wypozyczenie',
      'niepoprawne-zapotrzebowanie',
      'brak-zgody',
    ])
  })
})

/**
 * Trzy limity Strzelnicy, o których Użytkownik panelu wie więcej niż system.
 * Nie są zastrzeżeniem — wpis wchodzi, a odstępstwo zostaje przy nim.
 */
describe('limity do przekroczenia', () => {
  it('bierze skład ponad pojemność Osi za przekroczenie, nie za odmowę', () => {
    expect(osad(zgloszenie({ participants: 6 }))).toEqual({
      problems: [],
      exceeded: ['ponad-pojemnosc-osi'],
    })
  })

  it('nie odnotowuje niczego przy składzie dokładnie równym pojemności', () => {
    expect(osad(zgloszenie({ participants: 4 })).exceeded).toEqual([])
  })

  it('bierze termin poza godzinami otwarcia za przekroczenie', () => {
    expect(osad(zgloszenie(), blok('poza-godzinami-otwarcia'))).toEqual({
      problems: [],
      exceeded: ['poza-godzinami-otwarcia'],
    })
  })

  it('bierze wyczerpaną Pulę instruktorów za przekroczenie', () => {
    expect(osad(zgloszenie({ hasPermit: false }), blok('brak-instruktora'))).toEqual({
      problems: [],
      exceeded: ['brak-instruktora'],
    })
  })

  it('odnotowuje wszystkie przekroczenia naraz, w jednej i tej samej kolejności', () => {
    const { problems, exceeded } = osad(
      zgloszenie({ participants: 9, hasPermit: false }),
      blok('poza-godzinami-otwarcia', 'brak-instruktora'),
    )

    expect(problems).toEqual([])
    expect(exceeded).toEqual(LIMIT_OVERRIDES)
  })

  /**
   * Kolejność listy nie bierze się z kolejności sprawdzeń, bo dwa jednakowe
   * wpisy mają zostać w bazie odnotowane jednakowo — inaczej porównanie dwóch
   * Rezerwacji zależałoby od tego, w jakim porządku ktoś napisał `if`-y.
   */
  it('porządkuje odnotowane przekroczenia zawsze tak samo', () => {
    const zTerminu = osad(
      zgloszenie({ participants: 6 }),
      blok('poza-godzinami-otwarcia'),
    ).exceeded

    expect(zTerminu).toEqual(['poza-godzinami-otwarcia', 'ponad-pojemnosc-osi'])
  })
})

/**
 * Czego przekroczyć nie wolno. Wyłączność Osi nie jest limitem Strzelnicy,
 * tylko cudzą własnością; Pula sztuk mówi, ile sztuk Strzelnica ma; a termin,
 * który minął, nie jest odstępstwem, o którym ktokolwiek wie więcej.
 */
describe('odmowy nie do przekroczenia', () => {
  it('nie wpuszcza wpisu na termin zajęty przez Rezerwację albo Blokadę', () => {
    expect(osad(zgloszenie(), blok('termin-zajety'))).toEqual({
      problems: ['termin-zajety'],
      exceeded: [],
    })
  })

  /**
   * „Termin zajęty" zostaje przy swojej nazwie, a nie schodzi do „terminu
   * niedostępnego" jak w Widgecie: obsługa naprawia go inaczej niż resztę —
   * odwołaniem tamtej Rezerwacji albo zdjęciem Blokady, a nie zmianą dnia.
   */
  it('nazywa zajęty termin po swojemu, a nie terminem niedostępnym', () => {
    expect(osad(zgloszenie(), blok('termin-zajety')).problems).not.toContain('termin-niedostepny')
  })

  it.each(['przeszlosc', 'ponizej-wyprzedzenia', 'poza-horyzontem'] as const)(
    'nie wpuszcza wpisu na termin, o którym rozstrzyga zegar: %s',
    (powod) => {
      expect(osad(zgloszenie(), blok(powod)).problems).toEqual(['termin-niedostepny'])
    },
  )

  it('nie wpuszcza wpisu, dla którego nie ma sztuk broni', () => {
    expect(
      osad(zgloszenie({ rentals: [{ weaponTypeId: 'glock', quantity: 4 }] }), blok('brak-sztuk-broni'))
        .problems,
    ).toEqual(['brak-sztuk-broni'])
  })

  // Wołane wprost, a nie przez pomocnik: brak Bloku jest tu wartością, którą
  // pomocnik z wartością domyślną podmieniłby na Blok wolny.
  it('nie wpuszcza wpisu na termin, którego rozkład Osi nie zna', () => {
    const bezBloku = manualBookingReview({
      draft: zgloszenie(),
      lane: OS,
      block: undefined,
      ammunitionKinds: KATALOG_AMUNICJI,
    })

    expect(bezBloku).toEqual({ problems: ['termin-niedostepny'], exceeded: [] })
  })

  /**
   * Osi wolno nie być: w Panelu znika z listy między odczytem a kliknięciem,
   * a w Edge Function baza nie przypisuje jej tej Strzelnicy. Odpowiedź jest
   * wtedy jedna i mówi o Osi, a nie o terminie — bez Osi nie ma rozkładu,
   * w którym termin mógłby być zajęty albo wolny.
   */
  it('odpowiada o Osi, gdy Osi nie ma — i nie mówi przy tym o terminie', () => {
    const bezOsi = manualBookingReview({
      draft: zgloszenie({ participants: 9 }),
      lane: undefined,
      block: undefined,
      ammunitionKinds: KATALOG_AMUNICJI,
    })

    expect(bezOsi).toEqual({ problems: ['nieznana-os'], exceeded: [] })
  })

  it('nie bierze składu zerowego ani ułamkowego za przekroczenie pojemności', () => {
    expect(osad(zgloszenie({ participants: 0 }))).toEqual({
      problems: ['liczba-uczestnikow-poza-zakresem'],
      exceeded: [],
    })
    expect(osad(zgloszenie({ participants: 2.5 })).exceeded).toEqual([])
  })

  /**
   * Sedno decyzji o liście powodów zamiast jednego: odmowa schowana za
   * przekroczeniem byłaby wpisem przyjętym na termin, który już minął. Panel
   * ma zobaczyć jedno i drugie.
   */
  it('widzi odmowę stojącą za przekroczeniem, a nie tylko powód pierwszy', () => {
    const { problems, exceeded } = osad(
      zgloszenie(),
      blok('poza-godzinami-otwarcia', 'przeszlosc'),
    )

    expect(problems).toEqual(['termin-niedostepny'])
    expect(exceeded).toEqual(['poza-godzinami-otwarcia'])
  })

  it('mówi o dwóch powodach schodzących do jednego zdania raz, a nie dwa razy', () => {
    expect(osad(zgloszenie(), blok('poza-horyzontem', 'ponizej-wyprzedzenia')).problems).toEqual([
      'termin-niedostepny',
    ])
  })
})

/**
 * Jawne potwierdzenie. Ta sama funkcja odpowiada Panelowi, o co jeszcze zapytać,
 * i serwerowi, czy wolno zapisać — bo pytanie jest jedno: czy obsługa wie, co
 * robi.
 */
describe('potwierdzenie przekroczeń', () => {
  it('nie ma o co pytać, gdy wpis niczego nie przekracza', () => {
    expect(unconfirmedOverrides([], [])).toEqual([])
  })

  it('wskazuje przekroczenie, którego nikt nie potwierdził', () => {
    expect(unconfirmedOverrides(['ponad-pojemnosc-osi'], [])).toEqual(['ponad-pojemnosc-osi'])
  })

  it('wskazuje to jedno przekroczenie, które zostało bez potwierdzenia', () => {
    expect(
      unconfirmedOverrides(
        ['poza-godzinami-otwarcia', 'ponad-pojemnosc-osi'],
        ['poza-godzinami-otwarcia'],
      ),
    ).toEqual(['ponad-pojemnosc-osi'])
  })

  it('nie ma zastrzeżeń, gdy potwierdzono każde przekroczenie', () => {
    expect(unconfirmedOverrides(LIMIT_OVERRIDES, LIMIT_OVERRIDES)).toEqual([])
  })

  /**
   * Potwierdzenie limitu, którego wpis nie przekracza, nie jest niczyją zgodą
   * na nic: przy Rezerwacji zostaje osąd serwera, nie treść żądania.
   */
  it('przepuszcza potwierdzenie limitu, którego wpis nie przekracza', () => {
    expect(unconfirmedOverrides([], ['ponad-pojemnosc-osi'])).toEqual([])
  })
})

describe('odczyt żądania', () => {
  const ZADANIE = {
    laneId: 'os-1',
    day: '2026-06-15',
    startMinute: 600,
    participants: 6,
    contact: { name: 'Jan Przykładowy', email: 'jan@example.pl', phone: '600100200' },
    consent: true,
    hasPermit: true,
    wantsInstructor: false,
    rentals: [],
    ammunition: [],
    overrides: ['ponad-pojemnosc-osi'],
  }

  it('czyta poprawne żądanie', () => {
    expect(readManualBookingRequest(ZADANIE)).toEqual({
      ...ZADANIE,
      overrides: ['ponad-pojemnosc-osi'],
    } satisfies ManualBookingRequest)
  })

  /**
   * Strzelnicy w żądaniu nie ma i nie ma jej czym podstawić: o to, czyj jest
   * ten Panel, pyta się konta (ADR 0010). Pole przysłane mimo to nie znaczy
   * nic — odczyt go nie widzi.
   */
  it('nie czyta Strzelnicy, choćby ktoś ją do żądania dopisał', () => {
    const wynik = readManualBookingRequest({ ...ZADANIE, facilitySlug: 'obca-strzelnica' })

    expect(wynik).not.toHaveProperty('facilitySlug')
  })

  it('czyta wpis bez przekroczeń jako pustą listę', () => {
    expect(readManualBookingRequest({ ...ZADANIE, overrides: [] }).overrides).toEqual([])
  })

  it('odrzuca żądanie bez pola przekroczeń, zamiast brać je za brak zgody', () => {
    const { overrides, ...bez } = ZADANIE
    expect(overrides).toBeDefined()

    expect(() => readManualBookingRequest(bez)).toThrow(MalformedBookingRequestError)
  })

  it('odrzuca limit, którego ta domena nie zna', () => {
    expect(() =>
      readManualBookingRequest({ ...ZADANIE, overrides: ['wylacznosc-osi'] }),
    ).toThrow(MalformedBookingRequestError)
  })

  /**
   * Zastrzeżenia formularza przechodzą przez odczyt bez śladu — orzeka o nich
   * `manualBookingReview`, ta sama funkcja, którą pyta Panel. Odsianie ich już
   * tutaj czyniłoby „brak imienia" odpowiedzią, której serwer nigdy nie udziela.
   */
  it('przepuszcza puste pole kontaktu, zostawiając osąd zastrzeżeniom', () => {
    const wynik = readManualBookingRequest({
      ...ZADANIE,
      contact: { name: '  ', email: '', phone: '' },
    })

    expect(wynik.contact).toEqual({ name: '', email: '', phone: '' })
  })

  it.each(['laneId', 'day', 'startMinute', 'participants', 'consent'] as const)(
    'odrzuca żądanie bez pola %s',
    (pole) => {
      const bez: Record<string, unknown> = { ...ZADANIE }
      delete bez[pole]

      expect(() => readManualBookingRequest(bez)).toThrow(MalformedBookingRequestError)
    },
  )
})

/**
 * Zbiór limitów do przekroczenia jest zamknięty i jest to jego treść: wartość
 * dopisana do niego znaczy nowy limit oddany obsłudze do złamania. Ten test
 * stoi tu po to, żeby dopisanie jej wymagało dopisania także zdania w tym
 * miejscu — razem z kolumną w bazie i zdaniem w Panelu.
 */
describe('zbiór limitów do przekroczenia', () => {
  it('obejmuje pojemność Osi, godziny otwarcia i Pulę instruktorów — i nic ponad to', () => {
    expect([...LIMIT_OVERRIDES].sort()).toEqual(
      ['brak-instruktora', 'ponad-pojemnosc-osi', 'poza-godzinami-otwarcia'] satisfies
        LimitOverride[],
    )
  })
})
