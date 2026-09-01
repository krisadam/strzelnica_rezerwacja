import { describe, expect, it } from 'vitest'
import type { Block, BookingDraft, BookingRequest, Lane } from './index.ts'
import {
  bookingProblems,
  concernsTheTerm,
  MalformedBookingRequestError,
  readBookingRequest,
} from './index.ts'

const OS: Lane = { id: 'os-1', name: 'Oś pistoletowa nr 1', capacity: 4 }

function blok(nadpisania: Partial<Block> = {}): Block {
  return {
    scheduleId: 'blok-1-600',
    laneId: OS.id,
    startMinute: 600,
    startsAt: new Date('2026-06-15T08:00:00Z'),
    endsAt: new Date('2026-06-15T10:00:00Z'),
    available: true,
    ...nadpisania,
  }
}

function zgloszenie(nadpisania: Partial<BookingDraft> = {}): BookingDraft {
  return {
    participants: 2,
    contact: { name: 'Anna Kowalska', email: 'anna@example.pl', phone: '600100200' },
    consent: true,
    hasPermit: true,
    wantsInstructor: false,
    rentals: [],
    ...nadpisania,
  }
}

function zastrzezenia(draft: BookingDraft, block: Block = blok()) {
  return bookingProblems({ draft, lane: OS, block })
}

describe('zgłoszenie Rezerwacji', () => {
  it('nie ma zastrzeżeń do kompletnego zgłoszenia na wolny Blok', () => {
    expect(zastrzezenia(zgloszenie())).toEqual([])
  })

  it('wypisuje wszystkie zastrzeżenia naraz, a nie pierwsze z brzegu', () => {
    const problemy = zastrzezenia(
      zgloszenie({ contact: { name: '', email: '', phone: '' }, consent: false }),
    )

    expect(problemy).toEqual([
      'brak-imienia',
      'niepoprawny-email',
      'brak-telefonu',
      'brak-zgody',
    ])
  })
})

/**
 * Instruktor przy Rezerwacji. Zastrzeżenie nie liczy tu Puli — o niej orzeka
 * dostępność Bloku, ta sama dla kalendarza i dla serwera. Tutaj rozstrzyga się
 * wyłącznie, jak nazwać odmowę, żeby Osoba rezerwująca wiedziała, czy zmiana
 * deklaracji cokolwiek da.
 */
describe('Instruktor', () => {
  it('nie ma zastrzeżeń do zgłoszenia bez Pozwolenia na wolny Blok', () => {
    expect(zastrzezenia(zgloszenie({ hasPermit: false }))).toEqual([])
  })

  it('nazywa odmowę brakiem Instruktora, a nie zajętym terminem', () => {
    expect(
      zastrzezenia(
        zgloszenie({ hasPermit: false }),
        blok({ available: false, unavailableBecause: 'brak-instruktora' }),
      ),
    ).toEqual(['brak-instruktora'])
  })

  it('zostaje przy terminie niedostępnym, gdy powód mówi o samym Bloku', () => {
    expect(
      zastrzezenia(
        zgloszenie({ hasPermit: false }),
        blok({ available: false, unavailableBecause: 'termin-zajety' }),
      ),
    ).toEqual(['termin-niedostepny'])
  })
})

/**
 * Wypożyczenie broni. Ile sztuk zostało w tym terminie, orzeka dostępność
 * Bloku — ta sama dla kalendarza i dla serwera. Tutaj rozstrzyga się kształt
 * samego zamówienia i nazwa odmowy.
 */
describe('Wypożyczenie broni', () => {
  it('nie ma zastrzeżeń do Rezerwacji bez Wypożyczeń — z własną bronią', () => {
    expect(zastrzezenia(zgloszenie({ rentals: [] }))).toEqual([])
  })

  it('nie ma zastrzeżeń do kilku Typów naraz w jednej Rezerwacji', () => {
    expect(
      zastrzezenia(
        zgloszenie({
          rentals: [
            { weaponTypeId: 'glock', quantity: 2 },
            { weaponTypeId: 'shadow', quantity: 1 },
          ],
        }),
      ),
    ).toEqual([])
  })

  it('nazywa odmowę brakiem sztuk, a nie zajętym terminem', () => {
    expect(
      zastrzezenia(
        zgloszenie({ rentals: [{ weaponTypeId: 'glock', quantity: 4 }] }),
        blok({ available: false, unavailableBecause: 'brak-sztuk-broni' }),
      ),
    ).toEqual(['brak-sztuk-broni'])
  })

  it('odrzuca pozycję na zero sztuk — Wypożyczeniem nie jest', () => {
    expect(zastrzezenia(zgloszenie({ rentals: [{ weaponTypeId: 'glock', quantity: 0 }] }))).toEqual(
      ['niepoprawne-wypozyczenie'],
    )
  })

  it('odrzuca liczbę sztuk, która nie jest liczbą całkowitą', () => {
    expect(
      zastrzezenia(zgloszenie({ rentals: [{ weaponTypeId: 'glock', quantity: 1.5 }] })),
    ).toEqual(['niepoprawne-wypozyczenie'])
  })

  // Dwie pozycje tego samego Typu byłyby dwiema odpowiedziami na pytanie
  // „ile sztuk" — i sumowałyby się inaczej u klienta niż w bazie.
  it('odrzuca dwie pozycje tego samego Typu', () => {
    expect(
      zastrzezenia(
        zgloszenie({
          rentals: [
            { weaponTypeId: 'glock', quantity: 1 },
            { weaponTypeId: 'glock', quantity: 1 },
          ],
        }),
      ),
    ).toEqual(['niepoprawne-wypozyczenie'])
  })

  it('odrzuca pozycję bez wskazanego Typu', () => {
    expect(zastrzezenia(zgloszenie({ rentals: [{ weaponTypeId: '  ', quantity: 1 }] }))).toEqual([
      'niepoprawne-wypozyczenie',
    ])
  })
})

describe('zastrzeżenia mówiące o samym terminie', () => {
  it.each(['termin-niedostepny', 'brak-instruktora', 'brak-sztuk-broni'] as const)(
    'rozpoznaje %s',
    (problem) => {
      expect(concernsTheTerm(problem)).toBe(true)
    },
  )

  // Puste pole formularza mówi o tym, czego Osoba rezerwująca jeszcze nie
  // wypełniła — i dlatego wolno je pokazać dopiero po próbie przejścia dalej.
  it.each([
    'liczba-uczestnikow-poza-zakresem',
    'ponad-pojemnosc-osi',
    'brak-imienia',
    'niepoprawny-email',
    'brak-telefonu',
    'brak-zgody',
    'niepoprawne-wypozyczenie',
  ] as const)('nie bierze za nie zastrzeżenia do pola: %s', (problem) => {
    expect(concernsTheTerm(problem)).toBe(false)
  })
})

describe('wybrany termin', () => {
  it('odrzuca Blok, którego dostępność zdjęła', () => {
    expect(zastrzezenia(zgloszenie(), blok({ available: false }))).toEqual([
      'termin-niedostepny',
    ])
  })

  // Zgłoszenie na Blok spoza rozkładu Osi nie jest ani wolne, ani zajęte —
  // takiego terminu Strzelnica nigdy nie wystawiła.
  it('odrzuca termin, którego rozkład Osi nie zna', () => {
    expect(bookingProblems({ draft: zgloszenie(), lane: OS, block: undefined })).toEqual([
      'termin-niedostepny',
    ])
  })
})

describe('liczba Uczestników', () => {
  it('dopuszcza skład dokładnie równy pojemności Osi', () => {
    expect(zastrzezenia(zgloszenie({ participants: 4 }))).toEqual([])
  })

  it('odrzuca skład o jedną osobę większy', () => {
    expect(zastrzezenia(zgloszenie({ participants: 5 }))).toEqual(['ponad-pojemnosc-osi'])
  })

  it('odrzuca Rezerwację bez Uczestników', () => {
    expect(zastrzezenia(zgloszenie({ participants: 0 }))).toEqual([
      'liczba-uczestnikow-poza-zakresem',
    ])
  })

  it('odrzuca liczbę Uczestników, która nie jest liczbą całkowitą', () => {
    expect(zastrzezenia(zgloszenie({ participants: 2.5 }))).toEqual([
      'liczba-uczestnikow-poza-zakresem',
    ])
  })
})

describe('dane kontaktowe', () => {
  function kontakt(nadpisania: Partial<BookingDraft['contact']>) {
    return zastrzezenia(zgloszenie({ contact: { ...zgloszenie().contact, ...nadpisania } }))
  }

  it('nie uznaje samych spacji za wypełnione pole', () => {
    expect(kontakt({ name: '   ' })).toEqual(['brak-imienia'])
  })

  it('odrzuca adres bez małpy', () => {
    expect(kontakt({ email: 'anna.example.pl' })).toEqual(['niepoprawny-email'])
  })

  it('odrzuca adres bez domeny', () => {
    expect(kontakt({ email: 'anna@' })).toEqual(['niepoprawny-email'])
  })

  it('przyjmuje adres z kropką i znakiem plus', () => {
    expect(kontakt({ email: 'anna.kowalska+strzelnica@example.co.uk' })).toEqual([])
  })

  it('wymaga zaakceptowania zgody', () => {
    expect(zastrzezenia(zgloszenie({ consent: false }))).toEqual(['brak-zgody'])
  })
})

/**
 * Treść żądania przychodzi z sieci, więc nie jest niczym więcej niż `unknown`.
 * Ten sam kształt składa Widget i rozkłada Edge Function — jedna definicja
 * zamiast dwóch zgodnych z założenia.
 */
describe('odczyt żądania', () => {
  const ZADANIE = {
    facilitySlug: 'strzelnica-demo',
    laneId: '00000000-0000-0000-0000-0000000000a1',
    day: '2026-06-15',
    startMinute: 600,
    participants: 2,
    contact: { name: 'Anna Kowalska', email: 'anna@example.pl', phone: '600100200' },
    consent: true,
    hasPermit: false,
    wantsInstructor: false,
    rentals: [{ weaponTypeId: '00000000-0000-0000-0000-0000000000c1', quantity: 2 }],
  } satisfies BookingRequest

  it('czyta poprawne żądanie', () => {
    expect(readBookingRequest(ZADANIE)).toEqual(ZADANIE)
  })

  it('obcina spacje wokół danych kontaktowych', () => {
    const odczytane = readBookingRequest({
      ...ZADANIE,
      contact: { name: '  Anna Kowalska ', email: ' anna@example.pl', phone: '600100200 ' },
    })

    expect(odczytane.contact).toEqual(ZADANIE.contact)
  })

  // Puste pole formularza przechodzi odczyt i zatrzymuje się dopiero na
  // zastrzeżeniach — inaczej serwer nigdy nie odpowiedziałby „brak imienia",
  // a klient omijający formularz dostawałby nieczytelny błąd kształtu.
  // Minuta spoza rozkładu Osi nie jest błędem kształtu — jest terminem, którego
  // Strzelnica nie wystawiła, i tak ma o niej usłyszeć Osoba rezerwująca.
  it('czyta Rezerwację bez Wypożyczeń jako pustą listę, a nie brak pola', () => {
    expect(readBookingRequest({ ...ZADANIE, rentals: [] }).rentals).toEqual([])
  })

  // Liczba sztuk poza zakresem przechodzi odczyt i zatrzymuje się dopiero na
  // zastrzeżeniach — tak samo jak liczba Uczestników.
  it('przepuszcza liczbę sztuk poza zakresem, zostawiając osąd zastrzeżeniom', () => {
    const odczytane = readBookingRequest({
      ...ZADANIE,
      rentals: [{ weaponTypeId: 'glock', quantity: 0 }],
    })

    expect(bookingProblems({ draft: odczytane, lane: OS, block: blok() })).toEqual([
      'niepoprawne-wypozyczenie',
    ])
  })

  it('przepuszcza minutę spoza siatki Slotów', () => {
    expect(readBookingRequest({ ...ZADANIE, startMinute: 605 }).startMinute).toBe(605)
  })

  it('przepuszcza liczbę Uczestników poza zakresem, zostawiając osąd zastrzeżeniom', () => {
    const odczytane = readBookingRequest({ ...ZADANIE, participants: 0 })

    expect(bookingProblems({ draft: odczytane, lane: OS, block: blok() })).toEqual([
      'liczba-uczestnikow-poza-zakresem',
    ])
  })

  it('przepuszcza puste pole kontaktu, zostawiając osąd zastrzeżeniom', () => {
    const odczytane = readBookingRequest({
      ...ZADANIE,
      contact: { ...ZADANIE.contact, name: '  ' },
    })

    expect(odczytane.contact.name).toBe('')
    expect(bookingProblems({ draft: odczytane, lane: OS, block: blok() })).toEqual([
      'brak-imienia',
    ])
  })

  it.each([
    ['brak pola', { ...ZADANIE, laneId: undefined }],
    ['pusty identyfikator Strzelnicy', { ...ZADANIE, facilitySlug: '  ' }],
    ['dzień w cudzym zapisie', { ...ZADANIE, day: '15.06.2026' }],
    ['minuta ujemna', { ...ZADANIE, startMinute: -30 }],
    ['minuta ułamkowa', { ...ZADANIE, startMinute: 600.5 }],
    ['liczba Uczestników jako napis', { ...ZADANIE, participants: '2' }],
    ['zgoda jako napis', { ...ZADANIE, consent: 'tak' }],
    ['deklaracja Pozwolenia jako napis', { ...ZADANIE, hasPermit: 'tak' }],
    ['brak deklaracji Pozwolenia', { ...ZADANIE, hasPermit: undefined }],
    ['chęć Instruktora jako napis', { ...ZADANIE, wantsInstructor: 'tak' }],
    ['kontakt nie będący obiektem', { ...ZADANIE, contact: 'Anna' }],
    ['brak Wypożyczeń', { ...ZADANIE, rentals: undefined }],
    ['Wypożyczenia nie będące listą', { ...ZADANIE, rentals: { glock: 1 } }],
    ['pozycja nie będąca obiektem', { ...ZADANIE, rentals: ['glock'] }],
    ['pozycja bez Typu broni', { ...ZADANIE, rentals: [{ quantity: 1 }] }],
    ['liczba sztuk jako napis', { ...ZADANIE, rentals: [{ weaponTypeId: 'glock', quantity: '1' }] }],
    ['treść nie będąca obiektem', 'Anna'],
    ['brak treści', null],
  ])('odrzuca żądanie: %s', (_opis, zadanie) => {
    expect(() => readBookingRequest(zadanie)).toThrow(MalformedBookingRequestError)
  })
})
