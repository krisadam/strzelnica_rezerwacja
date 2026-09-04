import { describe, expect, it } from 'vitest'
import type { RevocationResult } from './index.ts'
import {
  MalformedRevocationRequestError,
  readRevocationRequest,
  revocable,
  revocationOutcome,
  revocationProblem,
} from './index.ts'

const REZERWACJA = '00000000-0000-0000-0000-0000000000b1'

describe('Powód odwołania', () => {
  // Cała treść listu do klienta: bez powodu zostaje mu zdanie „odwołana"
  // i telefon do Strzelnicy, po który i tak sięgnie.
  it('jest wymagany', () => {
    expect(revocationProblem('')).toBe('brak-powodu')
  })

  it('nie wystarcza sam odstęp', () => {
    expect(revocationProblem('   \n ')).toBe('brak-powodu')
  })

  it('podany nie budzi zastrzeżeń', () => {
    expect(revocationProblem('Awaria wentylacji na Osi.')).toBeNull()
  })
})

describe('Żądanie odwołania', () => {
  it('niesie Rezerwację i powód', () => {
    expect(
      readRevocationRequest({ bookingId: REZERWACJA, reason: 'Awaria wentylacji.' }),
    ).toEqual({ bookingId: REZERWACJA, reason: 'Awaria wentylacji.' })
  })

  // Odstępy z pola formularza nie są treścią powodu — a bez obcięcia sam
  // odstęp przeszedłby jako powód podany.
  it('obcina odstępy powodu', () => {
    expect(readRevocationRequest({ bookingId: REZERWACJA, reason: '  Serwis.  ' }).reason).toBe(
      'Serwis.',
    )
  })

  /**
   * Powód pusty przechodzi przez odczyt i zatrzymuje się dopiero na
   * `revocationProblem` — tej samej funkcji, którą pyta Panel, zanim pokaże
   * przycisk. Odsianie go już tutaj czyniłoby „brak-powodu" odpowiedzią,
   * której serwer nigdy nie udziela.
   */
  it('przepuszcza pusty powód, bo o nim orzeka zastrzeżenie', () => {
    expect(readRevocationRequest({ bookingId: REZERWACJA, reason: '' }).reason).toBe('')
  })

  it.each([
    { bookingId: REZERWACJA },
    { bookingId: '', reason: 'Serwis.' },
    { bookingId: REZERWACJA, reason: 7 },
    { reason: 'Serwis.' },
    null,
    'odwołaj',
  ])('odrzuca żądanie bez kształtu %#', (zadanie) => {
    expect(() => readRevocationRequest(zadanie)).toThrow(MalformedRevocationRequestError)
  })
})

describe('Co da się odwołać', () => {
  // Odwołanie nie zna Okna anulowania: cały ten ekran istnieje dla chwili,
  // w której klient sam już nie może, a Strzelnica musi.
  it('Rezerwacja potwierdzona — bez względu na to, jak blisko jest termin', () => {
    expect(revocable('potwierdzona')).toBe(true)
  })

  /**
   * Oczekująca nie: zniknie sama po Czasie na potwierdzenie, a listu z powodem
   * nie ma gdzie wysłać — adres nie został potwierdzony i bywa zmyślony.
   * Reszta stanów terminu już nie trzyma, więc nie ma czego zwalniać.
   */
  it.each(['oczekujaca', 'anulowana-przez-klienta', 'odwolana-przez-strzelnice', 'wygasla'] as const)(
    'Rezerwacja w stanie „%s" — nie',
    (status) => {
      expect(revocable(status)).toBe(false)
    },
  )
})

describe('Wynik odwołania', () => {
  const wynik = (nadpisania: Partial<RevocationResult> = {}) =>
    revocationOutcome({ status: 'odwolana-przez-strzelnice', justRevoked: true, ...nadpisania })

  it('odwołana właśnie teraz', () => {
    expect(wynik()).toEqual({ ok: true, alreadyRevoked: false })
  })

  /**
   * Drugie kliknięcie — choćby z drugiego stanowiska obsługi — zostawia
   * Rezerwację odwołaną, ale niczego nie zmieniło. Tylko pierwsze wysyła
   * klientowi list, żeby nie dostał dwóch o tym samym.
   */
  it('odwołana wcześniej', () => {
    expect(wynik({ justRevoked: false })).toEqual({ ok: true, alreadyRevoked: true })
  })

  // Rezerwacja, której ta Strzelnica nie ma — cudza albo skasowana. Jedna
  // odpowiedź na oba przypadki: rozróżnienie mówiłoby o cudzych Rezerwacjach.
  it('Rezerwacja nieznana tej Strzelnicy', () => {
    expect(revocationOutcome(null)).toEqual({ ok: false, problem: 'nieznana-rezerwacja' })
  })

  it.each(['oczekujaca', 'anulowana-przez-klienta', 'wygasla'] as const)(
    'Rezerwacja w stanie „%s" nie jest do odwołania',
    (status) => {
      expect(revocationOutcome({ status, justRevoked: false })).toEqual({
        ok: false,
        problem: 'nie-do-odwolania',
      })
    },
  )
})
