import { describe, expect, it } from 'vitest'
import {
  confirmationOutcome,
  confirmationUrl,
  newConfirmationToken,
  readConfirmationToken,
} from './index.ts'

describe('Potwierdzenie adresu', () => {
  it('link nieznany bazie nie potwierdza niczego', () => {
    expect(confirmationOutcome(null)).toEqual({ ok: false, problem: 'link-nieznany' })
  })

  it('pierwsze wejście w link potwierdza Rezerwację', () => {
    expect(confirmationOutcome({ status: 'potwierdzona', justConfirmed: true })).toEqual({
      ok: true,
      alreadyConfirmed: false,
    })
  })

  // Jednorazowość linku widziana od strony klienta: drugie wejście niczego nie
  // zmienia, ale też nie straszy — Rezerwacja jest przecież potwierdzona.
  it('drugie wejście w ten sam link już nie potwierdza', () => {
    expect(confirmationOutcome({ status: 'potwierdzona', justConfirmed: false })).toEqual({
      ok: true,
      alreadyConfirmed: true,
    })
  })

  it('link Rezerwacji wygasłej nie działa', () => {
    expect(confirmationOutcome({ status: 'wygasla', justConfirmed: false })).toEqual({
      ok: false,
      problem: 'rezerwacja-wygasla',
    })
  })

  // Stany odwołania zaczną powstawać wraz z anulowaniem (tickety #12 i #15).
  // Odpowiedź „wygasła" byłaby wtedy nieprawdą, a milczenie — zagadką.
  it.each(['anulowana-przez-klienta', 'odwolana-przez-strzelnice'] as const)(
    'link Rezerwacji odwołanej (%s) mówi o odwołaniu, a nie o wygaśnięciu',
    (status) => {
      expect(confirmationOutcome({ status, justConfirmed: false })).toEqual({
        ok: false,
        problem: 'rezerwacja-nieaktualna',
      })
    },
  )

  // Rezerwacja oczekująca po przejściu przez `confirm_booking` znaczy, że
  // potwierdzenie nie weszło — a skoro nie weszło mimo żywego terminu, to
  // nie ma czego pokazać jako sukces.
  it('Rezerwacja pozostawiona oczekującą nie jest potwierdzeniem', () => {
    expect(confirmationOutcome({ status: 'oczekujaca', justConfirmed: false })).toEqual({
      ok: false,
      problem: 'rezerwacja-nieaktualna',
    })
  })
})

describe('Link potwierdzający', () => {
  it('prowadzi do Widgetu tej Strzelnicy, z tokenem w adresie', () => {
    const adres = confirmationUrl({
      widgetOrigin: 'https://widget.example.pl',
      facilitySlug: 'strzelnica-demo',
      token: 'abc123',
    })

    expect(adres).toBe(
      'https://widget.example.pl/?strzelnica=strzelnica-demo&potwierdzenie=abc123',
    )
  })

  // Konfiguracja wpisana „prawie dobrze" nie ma rozsypywać poczty.
  it('znosi ukośnik na końcu źródła', () => {
    expect(
      confirmationUrl({
        widgetOrigin: 'http://localhost:5173/',
        facilitySlug: 'demo',
        token: 'xyz',
      }),
    ).toBe('http://localhost:5173/?strzelnica=demo&potwierdzenie=xyz')
  })

  // Widget stoi pod źródłem, nie pod podstroną: `WIDGET_ORIGIN` jest tą samą
  // wartością, którą Edge Function porównuje z nagłówkiem `Origin`, a ten
  // ścieżki nie niesie. Ścieżka wpisana w konfiguracji jest więc pomyłką
  // i odpada tutaj tak samo, jak odpadłaby przy porównaniu źródeł.
  it('odrzuca ścieżkę wpisaną do źródła Widgetu', () => {
    expect(
      confirmationUrl({
        widgetOrigin: 'https://widget.example.pl/podstrona',
        facilitySlug: 'demo',
        token: 'xyz',
      }),
    ).toBe('https://widget.example.pl/?strzelnica=demo&potwierdzenie=xyz')
  })

  it('token przechodzi przez adres bez zniekształceń', () => {
    const token = newConfirmationToken()
    const adres = confirmationUrl({
      widgetOrigin: 'http://localhost:5173',
      facilitySlug: 'demo',
      token,
    })

    expect(readConfirmationToken(new URL(adres).search)).toBe(token)
  })

  it('adres bez tokenu nie jest wejściem w potwierdzenie', () => {
    expect(readConfirmationToken('?strzelnica=demo')).toBeNull()
  })
})

describe('Token potwierdzający', () => {
  // Token jest jedynym kluczem do potwierdzenia, więc nie może dać się zgadnąć
  // ani powtórzyć. Dwa tokeny z rzędu równe znaczyłyby, że losowanie nie działa.
  it('za każdym razem inny i dość długi, żeby nie dał się zgadnąć', () => {
    const tokeny = new Set(Array.from({ length: 50 }, () => newConfirmationToken()))
    expect(tokeny.size).toBe(50)
    for (const token of tokeny) expect(token).toMatch(/^[0-9a-f]{64}$/)
  })
})
