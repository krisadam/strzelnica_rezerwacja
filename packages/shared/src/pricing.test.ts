import { describe, expect, it } from 'vitest'
import type { AmmunitionKind, BookingDraft, Rates, WeaponType } from './index.ts'
import { bookingAmount, formatAmount, priceBooking, ratesFor, UnpricedItemError } from './index.ts'

/** Cennik do rachunków niżej: okrągłe stawki, żeby sumy dawały się przeczytać. */
const CENNIK: Rates = {
  blockRate: 12_000,
  participationRate: 3_000,
  instructorRate: 8_000,
}

const GLOCK: WeaponType = { id: 'glock', name: 'Glock 17', pool: 3, unitPrice: 5_000 }
const KARABINEK: WeaponType = { id: 'ar15', name: 'Karabinek AR-15', pool: 2, unitPrice: 9_000 }
const KATALOG_BRONI = [GLOCK, KARABINEK]

const PARABELLUM: AmmunitionKind = { id: '9x19', name: '9 × 19 mm Parabellum', unitPrice: 150 }
const LR: AmmunitionKind = { id: '22lr', name: '.22 Long Rifle', unitPrice: 40 }
const KATALOG_AMUNICJI = [PARABELLUM, LR]

function kwota(nadpisania: Partial<Parameters<typeof bookingAmount>[0]> = {}) {
  return bookingAmount({
    rates: CENNIK,
    participants: 1,
    instructor: false,
    rentals: [],
    ammunition: [],
    ...nadpisania,
  })
}

describe('Kwota do zapłaty', () => {
  it('Rezerwacja jednoosobowa bez dodatków płaci samą stawkę za Blok', () => {
    expect(kwota()).toEqual({
      block: 12_000,
      participation: 0,
      instructor: 0,
      rentals: 0,
      ammunition: 0,
      total: 12_000,
    })
  })

  it('sumuje wszystkie składniki naraz', () => {
    const rachunek = kwota({
      participants: 3,
      instructor: true,
      rentals: [{ unitPrice: 5_000, quantity: 2 }],
      ammunition: [{ unitPrice: 150, quantity: 100 }],
    })

    expect(rachunek).toEqual({
      block: 12_000,
      participation: 6_000,
      instructor: 8_000,
      rentals: 10_000,
      ammunition: 15_000,
      total: 51_000,
    })
    // Suma jest sumą składników, a nie osobnym rachunkiem obok nich: rozbicie
    // pokazywane Osobie rezerwującej musi dodawać się do tego, co zapłaci.
    const { total, ...skladniki } = rachunek
    expect(Object.values(skladniki).reduce((suma, skladnik) => suma + skladnik, 0)).toBe(total)
  })
})

/**
 * Reguła pierwszego Uczestnika: jest wliczony w stawkę za Blok, więc stawka za
 * uczestnictwo naliczana jest za osoby poza nim.
 */
describe('opłata za uczestnictwo', () => {
  it('nie nalicza jej za pierwszego Uczestnika', () => {
    expect(kwota({ participants: 1 }).participation).toBe(0)
  })

  it('nalicza ją za każdego kolejnego', () => {
    expect(kwota({ participants: 2 }).participation).toBe(3_000)
    expect(kwota({ participants: 4 }).participation).toBe(9_000)
  })

  // Liczba Uczestników bierze się z pola formularza, więc bywa pusta w trakcie
  // pisania. Kwota ma wtedy pokazać, co wiadomo, a nie „NaN zł": o liczbie
  // poza zakresem mówi zastrzeżenie, nie rachunek.
  it('nie psuje rachunku, gdy liczba Uczestników nie jest jeszcze liczbą', () => {
    expect(kwota({ participants: Number.NaN }).participation).toBe(0)
    expect(kwota({ participants: 0 }).participation).toBe(0)
    expect(kwota({ participants: 2.5 }).participation).toBe(0)
    expect(kwota({ participants: Number.NaN }).total).toBe(12_000)
  })
})

/**
 * Stawka za Instruktora zależy od jego obecności, nie od powodu — Rezerwacja
 * bez Pozwolenia płaci za niego tyle samo, co ta, która zamówiła go sama.
 */
describe('stawka za Instruktora', () => {
  it('nalicza się tak samo, gdy jest wymagany, jak gdy zamówiony dobrowolnie', () => {
    const wymagany = zgloszenieZKatalogu({ hasPermit: false, wantsInstructor: false })
    const zamowiony = zgloszenieZKatalogu({ hasPermit: true, wantsInstructor: true })

    expect(wymagany.instructor).toBe(8_000)
    expect(zamowiony.instructor).toBe(8_000)
    expect(wymagany.total).toBe(zamowiony.total)
  })

  it('nie nalicza się bez Instruktora', () => {
    expect(zgloszenieZKatalogu({ hasPermit: true, wantsInstructor: false }).instructor).toBe(0)
  })
})

function zgloszenie(nadpisania: Partial<BookingDraft> = {}): BookingDraft {
  return {
    participants: 1,
    contact: { name: 'Anna Kowalska', email: 'anna@example.pl', phone: '600100200' },
    consent: true,
    hasPermit: true,
    wantsInstructor: false,
    rentals: [],
    ammunition: [],
    ...nadpisania,
  }
}

/** Wycena zgłoszenia po katalogu wyżej; samo rozbicie Kwoty. */
function zgloszenieZKatalogu(nadpisania: Partial<BookingDraft> = {}) {
  return wycena(nadpisania).amount
}

function wycena(nadpisania: Partial<BookingDraft> = {}) {
  return priceBooking({
    rates: CENNIK,
    draft: zgloszenie(nadpisania),
    weaponTypes: KATALOG_BRONI,
    ammunitionKinds: KATALOG_AMUNICJI,
  })
}

describe('Kwota zgłoszenia z katalogu Strzelnicy', () => {
  it('liczy Wypożyczenia po cenie Typu razy liczba sztuk', () => {
    expect(
      zgloszenieZKatalogu({
        rentals: [
          { weaponTypeId: GLOCK.id, quantity: 2 },
          { weaponTypeId: KARABINEK.id, quantity: 1 },
        ],
      }).rentals,
    ).toBe(19_000)
  })

  it('liczy Zapotrzebowanie po cenie Rodzaju razy liczba sztuk', () => {
    expect(
      zgloszenieZKatalogu({
        ammunition: [
          { ammunitionKindId: PARABELLUM.id, quantity: 200 },
          { ammunitionKindId: LR.id, quantity: 50 },
        ],
      }).ammunition,
    ).toBe(32_000)
  })

  it('nie dolicza niczego Osobie rezerwującej z własnym sprzętem', () => {
    expect(zgloszenieZKatalogu().total).toBe(12_000)
  })

  /**
   * Pozycja spoza katalogu zatrzymuje rachunek, zamiast policzyć się na zero.
   * Do wyliczenia Kwoty w ogóle nie dochodzi: zastrzeżenia odsiewają Rodzaj
   * spoza katalogu, a Typ spoza katalogu — dostępność Bloku. Cisza w tym
   * miejscu znaczyłaby Rezerwację wydaną za darmo.
   */
  it('zatrzymuje się na pozycji, której katalog nie zna', () => {
    expect(() => zgloszenieZKatalogu({ rentals: [{ weaponTypeId: 'obcy', quantity: 1 }] })).toThrow(
      UnpricedItemError,
    )
    expect(() =>
      zgloszenieZKatalogu({ ammunition: [{ ammunitionKindId: 'obcy', quantity: 1 }] }),
    ).toThrow(UnpricedItemError)
  })
})

describe('cennik złożony ze Strzelnicy i Osi', () => {
  it('bierze stawkę za Blok z Osi, a pozostałe ze Strzelnicy', () => {
    expect(
      ratesFor(
        { participationRate: 3_000, instructorRate: 8_000 },
        { blockRate: 12_000 },
      ),
    ).toEqual(CENNIK)
  })
})

/**
 * Zamrożenie Kwoty. Rachunek liczy się z podanych stawek i cen, a nie
 * z katalogu — dlatego Rezerwacja, która zapisała jedno i drugie, daje się
 * przeliczyć po zmianie cennika i wychodzi ta sama Kwota.
 */
describe('zmiana cennika', () => {
  it('nie zmienia Kwoty policzonej z zamrożonych stawek i cen', () => {
    const draft = zgloszenie({
      participants: 2,
      rentals: [{ weaponTypeId: GLOCK.id, quantity: 1 }],
    })
    const zlozona = priceBooking({
      rates: CENNIK,
      draft,
      weaponTypes: KATALOG_BRONI,
      ammunitionKinds: KATALOG_AMUNICJI,
    })

    // Strzelnica podnosi cennik: droższy Blok i droższy Glock.
    const poPodwyzce = priceBooking({
      rates: { ...CENNIK, blockRate: 20_000 },
      draft,
      weaponTypes: [{ ...GLOCK, unitPrice: 9_900 }, KARABINEK],
      ammunitionKinds: KATALOG_AMUNICJI,
    })

    expect(poPodwyzce.amount.total).not.toBe(zlozona.amount.total)
    // Ta sama Rezerwacja przeliczona wyłącznie z tego, co zapisała przy
    // złożeniu: ze stawek i z cen swoich pozycji, bez zaglądania do katalogu.
    expect(
      bookingAmount({
        rates: CENNIK,
        participants: 2,
        instructor: false,
        rentals: zlozona.rentals,
        ammunition: zlozona.ammunition,
      }).total,
    ).toBe(zlozona.amount.total)
  })
})

describe('Kwota po polsku', () => {
  it('podaje grosze jako złote z walutą', () => {
    // Polski zapis rozdziela grupy cyfr i walutę spacją nierozdzielającą.
    expect(formatAmount(12_000)).toBe('120,00 zł')
    expect(formatAmount(51_000)).toBe('510,00 zł')
    expect(formatAmount(50)).toBe('0,50 zł')
    expect(formatAmount(0)).toBe('0,00 zł')
    expect(formatAmount(123_456_789)).toBe('1 234 567,89 zł')
  })
})
