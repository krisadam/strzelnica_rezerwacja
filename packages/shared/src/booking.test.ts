import { describe, expect, it } from 'vitest'
import type { Block, BookingDraft, BookingRequest, Lane } from './index.ts'
import { bookingProblems, MalformedBookingRequestError, readBookingRequest } from './index.ts'

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
    ['kontakt nie będący obiektem', { ...ZADANIE, contact: 'Anna' }],
    ['treść nie będąca obiektem', 'Anna'],
    ['brak treści', null],
  ])('odrzuca żądanie: %s', (_opis, zadanie) => {
    expect(() => readBookingRequest(zadanie)).toThrow(MalformedBookingRequestError)
  })
})
