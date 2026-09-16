import { describe, expect, it } from 'vitest'
import type {
  AmmunitionKind,
  AmmunitionKindDraft,
  BookedRental,
  WeaponType,
  WeaponTypeDraft,
} from './index.ts'
import {
  ammunitionKindProblems,
  MalformedCatalogRequestError,
  MAX_UNIT_PRICE_GR,
  MAX_WEAPON_POOL,
  poolOverruns,
  readAmmunitionKindRequest,
  readWeaponTypeRequest,
  weaponTypeProblems,
} from './index.ts'

const GLOCK = 'glock'
const KARABINEK = 'ar15'

function typ(dane: Partial<WeaponType> = {}): WeaponType {
  return { id: GLOCK, name: 'Glock 17', pool: 3, unitPrice: 5_000, active: true, ...dane }
}

function rodzaj(dane: Partial<AmmunitionKind> = {}): AmmunitionKind {
  return { id: '9x19', name: '9 × 19 mm Parabellum', unitPrice: 150, active: true, ...dane }
}

/** Wypełniony formularz nowego Typu; `id` puste znaczy pozycję, której jeszcze nie ma. */
function zamiarTypu(dane: Partial<WeaponTypeDraft> = {}): WeaponTypeDraft {
  return { id: null, name: 'Beretta 92FS', pool: 2, unitPrice: 5_500, active: true, ...dane }
}

function zamiarRodzaju(dane: Partial<AmmunitionKindDraft> = {}): AmmunitionKindDraft {
  return { id: null, name: '.45 ACP', unitPrice: 220, active: true, ...dane }
}

describe('zastrzeżenia do Typu broni', () => {
  it('przepuszcza pozycję o nazwie, której katalog jeszcze nie używa', () => {
    expect(weaponTypeProblems({ draft: zamiarTypu(), weaponTypes: [typ()] })).toEqual([])
  })

  it('wytyka pozycję bez nazwy', () => {
    expect(weaponTypeProblems({ draft: zamiarTypu({ name: '  ' }), weaponTypes: [] })).toEqual([
      'brak-nazwy',
    ])
  })

  it('wytyka nazwę zajętą przez inną pozycję katalogu', () => {
    // Nazwa jest tym, po czym Osoba rezerwująca poznaje sprzęt w formularzu —
    // dwa „Glocki 17" znaczą wybór między pozycjami nie do odróżnienia.
    expect(
      weaponTypeProblems({ draft: zamiarTypu({ name: 'Glock 17' }), weaponTypes: [typ()] }),
    ).toEqual(['nazwa-zajeta'])
  })

  it('nie liczy jako zajętej nazwy, którą pozycja nosi sama', () => {
    expect(
      weaponTypeProblems({
        draft: zamiarTypu({ id: GLOCK, name: 'Glock 17' }),
        weaponTypes: [typ()],
      }),
    ).toEqual([])
  })

  it('zauważa nazwę zajętą przez pozycję wycofaną', () => {
    // Wycofana zostaje w katalogu, a jedyności nazwy pilnuje ograniczenie
    // w schemacie — które o wycofaniu nie wie nic. Zastrzeżenie przemilczane
    // tutaj wróciłoby i tak, ale dopiero z bazy.
    expect(
      weaponTypeProblems({
        draft: zamiarTypu({ name: 'Glock 17' }),
        weaponTypes: [typ({ active: false })],
      }),
    ).toEqual(['nazwa-zajeta'])
  })

  it('wytyka pulę, która nie jest liczbą sztuk', () => {
    expect(weaponTypeProblems({ draft: zamiarTypu({ pool: -1 }), weaponTypes: [] })).toEqual([
      'zla-pula',
    ])
    expect(weaponTypeProblems({ draft: zamiarTypu({ pool: 1.5 }), weaponTypes: [] })).toEqual([
      'zla-pula',
    ])
    expect(
      weaponTypeProblems({ draft: zamiarTypu({ pool: MAX_WEAPON_POOL + 1 }), weaponTypes: [] }),
    ).toEqual(['zla-pula'])
  })

  it('przepuszcza pulę zerową', () => {
    // Zero znaczy Typ w katalogu, którego nie ma czym obsłużyć — cały sprzęt
    // w serwisie — a nie Typ wycofany. Te dwie rzeczy mówi się osobno.
    expect(weaponTypeProblems({ draft: zamiarTypu({ pool: 0 }), weaponTypes: [] })).toEqual([])
  })

  it('wytyka cenę, która nie jest liczbą groszy', () => {
    expect(weaponTypeProblems({ draft: zamiarTypu({ unitPrice: -1 }), weaponTypes: [] })).toEqual([
      'zla-cena',
    ])
    expect(weaponTypeProblems({ draft: zamiarTypu({ unitPrice: 0.5 }), weaponTypes: [] })).toEqual(
      ['zla-cena'],
    )
    expect(
      weaponTypeProblems({
        draft: zamiarTypu({ unitPrice: MAX_UNIT_PRICE_GR + 1 }),
        weaponTypes: [],
      }),
    ).toEqual(['zla-cena'])
  })

  it('przepuszcza cenę zerową', () => {
    // Strzelnica, która czegoś nie liczy, ma to wyrazić danymi — tak samo jak
    // w cenniku, gdzie zero jest stawką, a nie brakiem stawki.
    expect(weaponTypeProblems({ draft: zamiarTypu({ unitPrice: 0 }), weaponTypes: [] })).toEqual([])
  })

  it('wypisuje wszystkie zastrzeżenia naraz', () => {
    expect(
      weaponTypeProblems({
        draft: zamiarTypu({ name: '', pool: -1, unitPrice: -1 }),
        weaponTypes: [],
      }),
    ).toEqual(['brak-nazwy', 'zla-pula', 'zla-cena'])
  })
})

describe('zastrzeżenia do Rodzaju amunicji', () => {
  it('przepuszcza pozycję o nazwie, której katalog jeszcze nie używa', () => {
    expect(ammunitionKindProblems({ draft: zamiarRodzaju(), ammunitionKinds: [rodzaj()] })).toEqual(
      [],
    )
  })

  it('wytyka pozycję bez nazwy i nazwę zajętą', () => {
    expect(
      ammunitionKindProblems({ draft: zamiarRodzaju({ name: ' ' }), ammunitionKinds: [] }),
    ).toEqual(['brak-nazwy'])
    expect(
      ammunitionKindProblems({
        draft: zamiarRodzaju({ name: '9 × 19 mm Parabellum' }),
        ammunitionKinds: [rodzaj()],
      }),
    ).toEqual(['nazwa-zajeta'])
  })

  it('wytyka cenę, która nie jest liczbą groszy', () => {
    expect(
      ammunitionKindProblems({ draft: zamiarRodzaju({ unitPrice: -1 }), ammunitionKinds: [] }),
    ).toEqual(['zla-cena'])
  })

  it('nie ma czym wytknąć puli, bo Rodzaj amunicji jej nie ma', () => {
    // ADR 0004: brak puli jest tu treścią, a nie przeoczeniem. Formularz, który
    // pytałby o pulę amunicji, kazałby prowadzić stan magazynowy trwale
    // nieprawdziwy.
    expect(Object.keys(zamiarRodzaju())).not.toContain('pool')
  })
})

describe('odczyt żądania Typu broni', () => {
  const ZADANIE = { id: null, name: 'Beretta 92FS', pool: 2, unitPriceGr: 5_500, active: true }

  it('czyta wypełnione żądanie', () => {
    expect(readWeaponTypeRequest(ZADANIE)).toEqual(zamiarTypu())
  })

  it('obcina spacje z nazwy i z numeru', () => {
    expect(readWeaponTypeRequest({ ...ZADANIE, id: ` ${GLOCK} `, name: '  Glock 17 ' })).toEqual(
      zamiarTypu({ id: GLOCK, name: 'Glock 17' }),
    )
  })

  it('odmawia żądaniu, które pomija pole id', () => {
    // Puste `id` znaczy pozycję nową, więc pole pominięte byłoby nie do
    // odróżnienia od niej — a wtedy literówka w jego nazwie zakładałaby nową
    // pozycję zamiast poprawić istniejącą. Ta sama ostrożność, co przy Osi.
    expect(() =>
      readWeaponTypeRequest({
        name: 'Beretta 92FS',
        pool: 2,
        unitPriceGr: 5_500,
        active: true,
      }),
    ).toThrow(MalformedCatalogRequestError)
  })

  it('odmawia żądaniu o złym kształcie', () => {
    expect(() => readWeaponTypeRequest(null)).toThrow(MalformedCatalogRequestError)
    expect(() => readWeaponTypeRequest({ ...ZADANIE, name: 17 })).toThrow(
      MalformedCatalogRequestError,
    )
    expect(() => readWeaponTypeRequest({ ...ZADANIE, pool: '2' })).toThrow(
      MalformedCatalogRequestError,
    )
    expect(() => readWeaponTypeRequest({ ...ZADANIE, unitPriceGr: 55.5 })).toThrow(
      MalformedCatalogRequestError,
    )
    expect(() => readWeaponTypeRequest({ ...ZADANIE, active: 'tak' })).toThrow(
      MalformedCatalogRequestError,
    )
  })

  it('przepuszcza liczby spoza zakresu, bo te wracają nazwanym zastrzeżeniem', () => {
    // Kształt i osąd to dwie różne odpowiedzi: „zły kształt" nie mówi obsłudze,
    // co wpisać, a `weaponTypeProblems` mówi.
    expect(readWeaponTypeRequest({ ...ZADANIE, pool: -3 }).pool).toBe(-3)
  })
})

describe('odczyt żądania Rodzaju amunicji', () => {
  const ZADANIE = { id: null, name: '.45 ACP', unitPriceGr: 220, active: true }

  it('czyta wypełnione żądanie', () => {
    expect(readAmmunitionKindRequest(ZADANIE)).toEqual(zamiarRodzaju())
  })

  it('odmawia żądaniu, które pomija pole id albo ma zły kształt', () => {
    expect(() => readAmmunitionKindRequest({ name: '.45 ACP', unitPriceGr: 220, active: true })).toThrow(
      MalformedCatalogRequestError,
    )
    expect(() => readAmmunitionKindRequest({ ...ZADANIE, unitPriceGr: null })).toThrow(
      MalformedCatalogRequestError,
    )
  })
})

/** Termin Rezerwacji w chwilach; godziny wybrane tak, żeby dało się je czytać. */
function termin(odGodziny: number, doGodziny: number) {
  return {
    startsAt: new Date(`2026-09-21T${String(odGodziny).padStart(2, '0')}:00:00Z`),
    endsAt: new Date(`2026-09-21T${String(doGodziny).padStart(2, '0')}:00:00Z`),
  }
}

function wypozyczenie(
  bookingId: string,
  quantity: number,
  odGodziny: number,
  doGodziny: number,
  weaponTypeId = GLOCK,
): BookedRental {
  return { bookingId, weaponTypeId, quantity, ...termin(odGodziny, doGodziny) }
}

describe('przekroczenia puli', () => {
  it('milczy, gdy pula starcza na wszystkie Rezerwacje', () => {
    expect(
      poolOverruns({
        weaponTypeId: GLOCK,
        pool: 3,
        rentals: [wypozyczenie('a', 2, 10, 12), wypozyczenie('b', 1, 10, 12)],
      }),
    ).toEqual([])
  })

  it('wypisuje Rezerwacje, którym pula po zmniejszeniu już nie starcza', () => {
    // Zmniejszenie puli Rezerwacji nie rusza — niesie własne sztuki — więc
    // odpowiedzią jest lista do rozstrzygnięcia, a nie odmowa zapisu.
    expect(
      poolOverruns({
        weaponTypeId: GLOCK,
        pool: 1,
        rentals: [wypozyczenie('a', 2, 10, 12), wypozyczenie('b', 1, 10, 12)],
      }),
    ).toEqual([
      { bookingId: 'a', issued: 3 },
      { bookingId: 'b', issued: 3 },
    ])
  })

  it('liczy sztuki wyłącznie z Rezerwacji nachodzących na siebie w czasie', () => {
    // Dwie Rezerwacje po sobie dzielą tę samą sztukę: pierwsza oddaje broń,
    // zanim druga po nią przyjdzie.
    expect(
      poolOverruns({
        weaponTypeId: GLOCK,
        pool: 2,
        rentals: [wypozyczenie('a', 2, 10, 12), wypozyczenie('b', 2, 12, 14)],
      }),
    ).toEqual([])
  })

  it('nie liczy sztuk innego Typu', () => {
    expect(
      poolOverruns({
        weaponTypeId: GLOCK,
        pool: 1,
        rentals: [wypozyczenie('a', 1, 10, 12), wypozyczenie('b', 5, 10, 12, KARABINEK)],
      }),
    ).toEqual([])
  })

  it('wypisuje pojedynczą Rezerwację ponad pulę', () => {
    // Bierze się to z ręcznego wpisu obsługi ponad limit albo ze zmniejszenia
    // puli — a nie z błędu, więc jest do wypisania, nie do naprawienia.
    expect(
      poolOverruns({ weaponTypeId: GLOCK, pool: 0, rentals: [wypozyczenie('a', 1, 10, 12)] }),
    ).toEqual([{ bookingId: 'a', issued: 1 }])
  })
})
