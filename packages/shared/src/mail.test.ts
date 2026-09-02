import { describe, expect, it } from 'vitest'
import type { ConfirmationEmailInput } from './index.ts'
import { confirmationEmail } from './index.ts'

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
