import { describe, expect, it } from 'vitest'
import type { BookingSummary, ManagementViewWire } from './index.ts'
import {
  CONFIRMATION_PARAM,
  MANAGEMENT_PARAM,
  managementUrl,
  managementView,
  readManagementToken,
  readManagementView,
  writeManagementView,
} from './index.ts'

const LINK = managementUrl({
  widgetOrigin: 'https://widget.example.pl',
  facilitySlug: 'strzelnica-demo',
  token: 'abc123',
})

describe('Link do zarządzania Rezerwacją', () => {
  it('prowadzi do Widgetu podanego wprost, bo e-mail otwiera się poza witryną Strzelnicy', () => {
    expect(LINK.startsWith('https://widget.example.pl/?')).toBe(true)
  })

  it('niesie Strzelnicę i token', () => {
    const parametry = new URL(LINK).searchParams
    expect(parametry.get('strzelnica')).toBe('strzelnica-demo')
    expect(parametry.get(MANAGEMENT_PARAM)).toBe('abc123')
  })

  // Dwa różne parametry, bo dwa różne uprawnienia: potwierdzenie działa raz
  // i nic więcej, zarządzanie otwiera Rezerwację na cały czas jej trwania.
  it('nie podszywa się pod link potwierdzający', () => {
    expect(MANAGEMENT_PARAM).not.toBe(CONFIRMATION_PARAM)
    expect(new URL(LINK).searchParams.has(CONFIRMATION_PARAM)).toBe(false)
  })

  it('nie przyjmuje ścieżki w miejscu źródła Widgetu', () => {
    expect(
      managementUrl({
        widgetOrigin: 'https://widget.example.pl/gdziekolwiek',
        facilitySlug: 'demo',
        token: 'x',
      }),
    ).toBe(LINK.replace('strzelnica-demo', 'demo').replace('abc123', 'x'))
  })
})

describe('Token z adresu Widgetu', () => {
  it('bierze się z parametru linku do zarządzania', () => {
    expect(readManagementToken(new URL(LINK).search)).toBe('abc123')
  })

  it('zwyczajne wejście do kalendarza nie niesie tokenu', () => {
    expect(readManagementToken('?strzelnica=strzelnica-demo')).toBeNull()
  })

  // Dwa parametry, dwa uprawnienia: link potwierdzający nie ma otwierać widoku
  // Rezerwacji, choćby wyglądał identycznie.
  it('link potwierdzający nie jest tokenem do zarządzania', () => {
    expect(readManagementToken(`?${CONFIRMATION_PARAM}=abc123`)).toBeNull()
  })
})

const OPIS: ManagementViewWire['booking'] = {
  facilityName: 'Strzelnica Demo',
  laneName: 'Oś pistoletowa nr 1',
  day: '2026-06-15',
  startsAt: '2026-06-15T08:00:00.000Z',
  endsAt: '2026-06-15T09:00:00.000Z',
  timeZone: 'Europe/Warsaw',
  participants: 2,
  hasPermit: true,
  withInstructor: false,
  rentals: [],
  ammunition: [],
  amount: 15_000,
  contact: { name: 'Anna Kowalska', email: 'anna@example.pl', phone: '600100200' },
}

const WIDOK: ManagementViewWire = {
  status: 'potwierdzona',
  booking: OPIS,
  cancellation: { possible: true, deadline: '2026-06-14T08:00:00.000Z' },
  facility: { email: 'kontakt@strzelnica-demo.example.pl', phone: '123456789' },
}

describe('Widok Rezerwacji spod linku', () => {
  // `Date` nie przeżywa JSON-a, więc momenty jadą tekstem i wracają tutaj.
  // Bez tego przejścia ekran formatowałby godzinę z ciągu znaków.
  it('przywraca momenty Rezerwacji', () => {
    const widok = readManagementView(WIDOK)
    expect(widok.booking.startsAt).toEqual(new Date('2026-06-15T08:00:00Z'))
    expect(widok.booking.endsAt).toEqual(new Date('2026-06-15T09:00:00Z'))
  })

  it('przywraca chwilę domknięcia okna anulowania', () => {
    const widok = readManagementView(WIDOK)
    expect(widok.cancellation).toEqual({
      possible: true,
      deadline: new Date('2026-06-14T08:00:00Z'),
    })
  })

  it('przywraca chwilę domknięcia także przy odmowie z jej powodu', () => {
    const widok = readManagementView({
      ...WIDOK,
      cancellation: { possible: false, reason: 'po-oknie', deadline: '2026-06-14T08:00:00.000Z' },
    })
    expect(widok.cancellation).toEqual({
      possible: false,
      reason: 'po-oknie',
      deadline: new Date('2026-06-14T08:00:00Z'),
    })
  })

  // Odmowa z innego powodu chwili domknięcia nie niesie: Rezerwacja, która
  // terminu nie trzyma, nie ma okna, o którego upływie dałoby się mówić.
  it('odmowa niezależna od zegara przechodzi bez chwili domknięcia', () => {
    expect(
      readManagementView({
        ...WIDOK,
        status: 'wygasla',
        cancellation: { possible: false, reason: 'nie-do-anulowania' },
      }).cancellation,
    ).toEqual({ possible: false, reason: 'nie-do-anulowania' })
  })

  it('przenosi opis Rezerwacji i kontakt do Strzelnicy bez zmian', () => {
    const widok = readManagementView(WIDOK)
    expect(widok.status).toBe('potwierdzona')
    expect(widok.booking.amount).toBe(15_000)
    expect(widok.booking.contact.email).toBe('anna@example.pl')
    expect(widok.facility).toEqual(WIDOK.facility)
  })
})

const REZERWACJA: BookingSummary = {
  ...OPIS,
  startsAt: new Date('2026-06-15T08:00:00Z'),
  endsAt: new Date('2026-06-15T09:00:00Z'),
}

describe('Składanie widoku Rezerwacji', () => {
  it('odpowiada o anulowanie z terminu tej Rezerwacji, a nie z osobnej daty', () => {
    const widok = managementView({
      status: 'potwierdzona',
      booking: REZERWACJA,
      cancellationWindowHours: 24,
      facility: { email: null, phone: '123456789' },
      now: new Date('2026-06-10T09:00:00Z'),
    })

    expect(widok.cancellation).toEqual({
      possible: true,
      deadline: new Date('2026-06-14T08:00:00Z'),
    })
    expect(widok.booking).toBe(REZERWACJA)
    expect(widok.facility.phone).toBe('123456789')
  })

  // Ten sam widok po upływie okna: Rezerwacja stoi, ale zwolnić termin może
  // już tylko Strzelnica — i dlatego jej kontakt jedzie tu zawsze, a nie
  // dokładany osobno w chwili odmowy.
  it('po upływie okna odmawia i podaje chwilę domknięcia', () => {
    const widok = managementView({
      status: 'potwierdzona',
      booking: REZERWACJA,
      cancellationWindowHours: 24,
      facility: { email: 'kontakt@example.pl', phone: null },
      now: new Date('2026-06-15T07:00:00Z'),
    })

    expect(widok.cancellation).toEqual({
      possible: false,
      reason: 'po-oknie',
      deadline: new Date('2026-06-14T08:00:00Z'),
    })
  })
})

describe('Widok w drodze przez JSON', () => {
  // Wysłanie i odczytanie muszą się składać w tożsamość, bo to jedna droga
  // przejechana w dwie strony. Rozjazd między nimi znaczyłby ekran, na którym
  // termin jest o godzinę inny niż w bazie — i nikt by tego nie zauważył.
  it.each([
    { possible: true, deadline: new Date('2026-06-14T08:00:00Z') },
    { possible: false, reason: 'po-oknie', deadline: new Date('2026-06-14T08:00:00Z') },
    { possible: false, reason: 'nie-do-anulowania' },
  ] as const)('wraca bez zmiany przy anulowaniu %#', (cancellation) => {
    const widok = {
      status: 'potwierdzona',
      booking: REZERWACJA,
      cancellation,
      facility: { email: 'kontakt@example.pl', phone: null },
    } as const

    expect(readManagementView(writeManagementView(widok))).toEqual(widok)
  })
})
