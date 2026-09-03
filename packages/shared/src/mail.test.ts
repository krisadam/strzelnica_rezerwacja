import { describe, expect, it } from 'vitest'
import type { BookingSummary, ConfirmationEmailInput } from './index.ts'
import {
  bookingSummaryEmail,
  clientCancellationEmail,
  confirmationEmail,
  facilityNotificationEmail,
} from './index.ts'

const ZGLOSZENIE: ConfirmationEmailInput = {
  facilityName: 'Strzelnica Demo',
  recipientName: 'Anna Kowalska',
  recipientEmail: 'anna@example.pl',
  laneName: 'Oś pistoletowa nr 1',
  day: '2026-06-15',
  startsAt: new Date('2026-06-15T08:00:00Z'),
  endsAt: new Date('2026-06-15T09:00:00Z'),
  timeZone: 'Europe/Warsaw',
  amount: 170_000,
  url: 'http://localhost:5173/?strzelnica=demo&potwierdzenie=abc',
  holdMinutes: 30,
}

function list(nadpisania: Partial<ConfirmationEmailInput> = {}) {
  return confirmationEmail({ ...ZGLOSZENIE, ...nadpisania })
}

describe('E-mail z linkiem potwierdzającym', () => {
  it('idzie na adres podany w zgłoszeniu', () => {
    expect(list().to).toBe('anna@example.pl')
  })

  it('w temacie mówi, o którą Strzelnicę chodzi', () => {
    expect(list().subject).toContain('Strzelnica Demo')
  })

  // Link jest jedyną rzeczą, po którą ten e-mail się pisze. Gdyby go
  // zabrakło, wszystko inne byłoby bez znaczenia.
  it('niesie link potwierdzający w wersji tekstowej', () => {
    expect(list().text).toContain(ZGLOSZENIE.url)
  })

  // W HTML-u ten sam link jedzie z ampersandem zapisanym encją — tak, jak
  // wymaga tego atrybut `href`. Klient poczty rozwija go z powrotem.
  it('niesie link potwierdzający jako odnośnik w wersji HTML', () => {
    expect(list().html).toContain(
      '<a href="http://localhost:5173/?strzelnica=demo&amp;potwierdzenie=abc">',
    )
  })

  // Termin w strefie Strzelnicy, a nie w UTC: 08:00 UTC to 10:00 w Warszawie
  // w czerwcu. E-mail czyta człowiek, który przyjedzie o tej godzinie.
  it.each(['text', 'html'] as const)('niesie termin w strefie Strzelnicy (%s)', (wersja) => {
    const tresc = list()[wersja]
    expect(tresc).toContain('10:00–11:00')
    expect(tresc).toContain('15 czerwca')
    expect(tresc).toContain('Oś pistoletowa nr 1')
  })

  it.each(['text', 'html'] as const)('niesie Kwotę do zapłaty (%s)', (wersja) => {
    expect(list()[wersja]).toMatch(/1\s*700,00/)
  })

  // Bez tego zdania link wygląda na uprzejmość, a nie na warunek. Liczba
  // przychodzi z zewnątrz, bo to ta sama, którą baza odmierza terminowi.
  it.each(['text', 'html'] as const)('mówi, ile jest czasu na kliknięcie (%s)', (wersja) => {
    expect(list({ holdMinutes: 45 })[wersja]).toContain('45 minut')
  })

  // Imię wpisuje Osoba rezerwująca, więc trafia do e-maila jako tekst, a nie
  // jako znaczniki. Wersja tekstowa zostaje nietknięta — tam nie ma czego psuć.
  it('nie wpuszcza znaczników z formularza do wersji HTML', () => {
    const wiadomosc = list({ recipientName: 'Anna <b>Kowalska</b>' })

    expect(wiadomosc.html).toContain('Anna &lt;b&gt;Kowalska&lt;/b&gt;')
    expect(wiadomosc.html).not.toContain('<b>Kowalska</b>')
    expect(wiadomosc.text).toContain('Anna <b>Kowalska</b>')
  })
})

const REZERWACJA: BookingSummary = {
  facilityName: 'Strzelnica Demo',
  laneName: 'Oś pistoletowa nr 1',
  day: '2026-06-15',
  startsAt: new Date('2026-06-15T08:00:00Z'),
  endsAt: new Date('2026-06-15T09:00:00Z'),
  timeZone: 'Europe/Warsaw',
  participants: 3,
  hasPermit: false,
  withInstructor: true,
  rentals: [{ name: 'Glock 17', quantity: 2 }],
  ammunition: [{ name: '9 × 19 mm Parabellum', quantity: 100 }],
  amount: 170_000,
  contact: { name: 'Anna Kowalska', email: 'anna@example.pl', phone: '600100200' },
}

const LINK_ZARZADZANIA = 'http://localhost:5173/?strzelnica=demo&rezerwacja=xyz'

function podsumowanie(nadpisania: Partial<BookingSummary> = {}) {
  return bookingSummaryEmail({
    booking: { ...REZERWACJA, ...nadpisania },
    url: LINK_ZARZADZANIA,
  })
}

function anulowanie(nadpisania: Partial<BookingSummary> = {}) {
  return clientCancellationEmail({
    booking: { ...REZERWACJA, ...nadpisania },
    to: 'recepcja@example.pl',
  })
}

function powiadomienie(nadpisania: Partial<BookingSummary> = {}) {
  return facilityNotificationEmail({
    booking: { ...REZERWACJA, ...nadpisania },
    to: 'recepcja@example.pl',
  })
}

const OBIE_WERSJE = ['text', 'html'] as const

describe('E-mail z podsumowaniem Rezerwacji', () => {
  it('idzie do Osoby rezerwującej', () => {
    expect(podsumowanie().to).toBe('anna@example.pl')
  })

  it('w temacie mówi, o którą Strzelnicę chodzi', () => {
    expect(podsumowanie().subject).toContain('Strzelnica Demo')
  })

  // To jest cały powód, dla którego ten list istnieje: Osoba rezerwująca ma
  // mieć na piśmie wszystko, co zamówiła, bez zaglądania nigdzie indziej.
  it.each(OBIE_WERSJE)('niesie termin, Oś i liczbę Uczestników (%s)', (wersja) => {
    const tresc = podsumowanie()[wersja]
    expect(tresc).toContain('15 czerwca')
    expect(tresc).toContain('10:00–11:00')
    expect(tresc).toContain('Oś pistoletowa nr 1')
    expect(tresc).toContain('Uczestnicy: 3')
  })

  it.each(OBIE_WERSJE)('wylicza zamówiony sprzęt z nazwy i liczby sztuk (%s)', (wersja) => {
    const tresc = podsumowanie()[wersja]
    expect(tresc).toContain('Glock 17')
    expect(tresc).toContain('2 szt.')
    expect(tresc).toContain('9 × 19 mm Parabellum')
    expect(tresc).toContain('100 szt.')
  })

  // Brak zamówienia jest odpowiedzią, a nie luką: Osoba rezerwująca ma
  // zobaczyć, że przyjedzie z własną bronią, a nie zgadywać z ciszy.
  it.each(OBIE_WERSJE)('mówi wprost, gdy sprzętu nie zamówiono (%s)', (wersja) => {
    const tresc = podsumowanie({ rentals: [], ammunition: [] })[wersja]
    expect(tresc).toContain('własna broń')
    expect(tresc).toContain('bez zapotrzebowania')
  })

  it.each(OBIE_WERSJE)('mówi, że Instruktor jest wymagany bez Pozwolenia (%s)', (wersja) => {
    expect(podsumowanie()[wersja]).toContain('wymagany')
  })

  it.each(OBIE_WERSJE)('odróżnia Instruktora zamówionego dobrowolnie (%s)', (wersja) => {
    const tresc = podsumowanie({ hasPermit: true, withInstructor: true })[wersja]
    expect(tresc).toContain('zamówiony')
    expect(tresc).not.toContain('wymagany')
  })

  it.each(OBIE_WERSJE)('mówi wprost o Rezerwacji bez Instruktora (%s)', (wersja) => {
    const tresc = podsumowanie({ hasPermit: true, withInstructor: false })[wersja]
    expect(tresc).toContain('Instruktor: nie')
  })

  it.each(OBIE_WERSJE)('niesie Kwotę i to, że płatna na miejscu (%s)', (wersja) => {
    const tresc = podsumowanie()[wersja]
    expect(tresc).toMatch(/1\s*700,00/)
    expect(tresc).toContain('na miejscu')
  })

  it('niesie link do zarządzania Rezerwacją w obu wersjach', () => {
    const wiadomosc = podsumowanie()
    expect(wiadomosc.text).toContain(LINK_ZARZADZANIA)
    expect(wiadomosc.html).toContain(
      '<a href="http://localhost:5173/?strzelnica=demo&amp;rezerwacja=xyz">',
    )
  })

  // Ten list nie prosi już o nic: adres jest potwierdzony, a Rezerwacja stoi.
  it('nie każe niczego potwierdzać', () => {
    expect(podsumowanie().text).not.toContain('Potwierdź')
  })

  it('nie wpuszcza znaczników z formularza do wersji HTML', () => {
    const wiadomosc = podsumowanie({
      contact: { ...REZERWACJA.contact, name: 'Anna <b>Kowalska</b>' },
    })
    expect(wiadomosc.html).toContain('Anna &lt;b&gt;Kowalska&lt;/b&gt;')
    expect(wiadomosc.html).not.toContain('<b>Kowalska</b>')
  })
})

describe('E-mail do Strzelnicy o nowej Rezerwacji', () => {
  it('idzie pod adres powiadomień Strzelnicy, nie do klienta', () => {
    expect(powiadomienie().to).toBe('recepcja@example.pl')
  })

  it('w temacie mówi, że to nowa Rezerwacja', () => {
    expect(powiadomienie().subject).toContain('Nowa Rezerwacja')
  })

  // Te same szczegóły, co u klienta — obsługa przygotowuje stanowisko z tego
  // listu, więc lista sprzętu nie może być krótsza niż jego.
  it.each(OBIE_WERSJE)('niesie te same szczegóły Rezerwacji (%s)', (wersja) => {
    const tresc = powiadomienie()[wersja]
    expect(tresc).toContain('Oś pistoletowa nr 1')
    expect(tresc).toContain('10:00–11:00')
    expect(tresc).toContain('Glock 17')
    expect(tresc).toContain('9 × 19 mm Parabellum')
    expect(tresc).toContain('wymagany')
    expect(tresc).toMatch(/1\s*700,00/)
  })

  // Tym ten list różni się od klienckiego: obsługa musi mieć jak zadzwonić.
  it.each(OBIE_WERSJE)('niesie dane kontaktowe Osoby rezerwującej (%s)', (wersja) => {
    const tresc = powiadomienie()[wersja]
    expect(tresc).toContain('Anna Kowalska')
    expect(tresc).toContain('anna@example.pl')
    expect(tresc).toContain('600100200')
  })

  // Link do zarządzania jest uprawnieniem Osoby rezerwującej. Przesłany
  // Strzelnicy pozwalałby jej anulować Rezerwację cudzą ręką, w dodatku
  // z pominięciem Okna anulowania.
  it('nie niesie linku do zarządzania Rezerwacją', () => {
    expect(powiadomienie().text).not.toContain('rezerwacja=')
  })

  it('nie wpuszcza znaczników z formularza do wersji HTML', () => {
    const wiadomosc = powiadomienie({
      contact: { ...REZERWACJA.contact, name: 'Anna <b>Kowalska</b>' },
    })
    expect(wiadomosc.html).toContain('Anna &lt;b&gt;Kowalska&lt;/b&gt;')
    expect(wiadomosc.html).not.toContain('<b>Kowalska</b>')
  })
})

describe('E-mail do Strzelnicy o anulowaniu przez klienta', () => {
  it('idzie pod adres powiadomień Strzelnicy, nie do klienta', () => {
    expect(anulowanie().to).toBe('recepcja@example.pl')
  })

  // Temat czyta się na liście, nie po otwarciu: obsługa musi od razu wiedzieć,
  // że termin się zwolnił, i który to termin.
  it('w temacie mówi o anulowaniu i o który dzień chodzi', () => {
    const temat = anulowanie().subject
    expect(temat).toContain('Anulowana Rezerwacja')
    expect(temat).toContain('15 czerwca')
  })

  // Ten sam opis, co w powiadomieniu o nowej Rezerwacji: obsługa zestawia go
  // z tym, co ma zapisane, a stanowisko odwołuje z tej samej listy sprzętu.
  it.each(OBIE_WERSJE)('niesie te same szczegóły Rezerwacji (%s)', (wersja) => {
    const tresc = anulowanie()[wersja]
    expect(tresc).toContain('Oś pistoletowa nr 1')
    expect(tresc).toContain('10:00–11:00')
    expect(tresc).toContain('Glock 17')
    expect(tresc).toMatch(/1\s*700,00/)
  })

  it.each(OBIE_WERSJE)('niesie dane kontaktowe Osoby rezerwującej (%s)', (wersja) => {
    const tresc = anulowanie()[wersja]
    expect(tresc).toContain('Anna Kowalska')
    expect(tresc).toContain('anna@example.pl')
    expect(tresc).toContain('600100200')
  })

  // Termin wrócił do puli sam — obsługa nie ma nic robić, i to jest tutaj
  // wiadomością. List, który tego nie mówi, każe zaglądać do Panelu.
  it.each(OBIE_WERSJE)('mówi, że termin wrócił do puli (%s)', (wersja) => {
    expect(anulowanie()[wersja]).toContain('wrócił do puli')
  })

  // Anulował klient, nie Strzelnica: link do zarządzania jest jego
  // uprawnieniem i nie jedzie w listach do obsługi.
  it('nie niesie linku do zarządzania Rezerwacją', () => {
    expect(anulowanie().text).not.toContain('rezerwacja=')
  })

  it('nie wpuszcza znaczników z formularza do wersji HTML', () => {
    const wiadomosc = anulowanie({
      contact: { ...REZERWACJA.contact, name: 'Anna <b>Kowalska</b>' },
    })
    expect(wiadomosc.html).toContain('Anna &lt;b&gt;Kowalska&lt;/b&gt;')
    expect(wiadomosc.html).not.toContain('<b>Kowalska</b>')
  })
})
