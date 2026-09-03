import { describe, expect, it } from 'vitest'
import type { CancellationStateInput } from './index.ts'
import { cancellationDeadline, cancellationOutcome, cancellationState } from './index.ts'

/** Termin Rezerwacji: południe czasu uniwersalnego, żeby liczyło się w głowie. */
const TERMIN = new Date('2026-06-15T12:00:00Z')

/** Okno anulowania Strzelnicy demonstracyjnej — 24 godziny przed terminem. */
const OKNO = 24

/** Chwila, w której okno anulowania właśnie się domyka. */
const GRANICA = new Date('2026-06-14T12:00:00Z')

function stan(nadpisania: Partial<CancellationStateInput> = {}) {
  return cancellationState({
    status: 'potwierdzona',
    startsAt: TERMIN,
    cancellationWindowHours: OKNO,
    now: new Date('2026-06-10T09:00:00Z'),
    ...nadpisania,
  })
}

describe('Okno anulowania', () => {
  it('domyka się tyle godzin przed terminem, ile ustaliła Strzelnica', () => {
    expect(cancellationDeadline(TERMIN, OKNO)).toEqual(GRANICA)
  })

  // Okno zerowe znaczy Strzelnicę pozwalającą anulować do samego początku
  // Bloku — a nie Strzelnicę, u której anulować nie można wcale.
  it('okno zerowe sięga samego początku Bloku', () => {
    expect(cancellationDeadline(TERMIN, 0)).toEqual(TERMIN)
  })

  it('na długo przed terminem anulowanie jest możliwe', () => {
    expect(stan()).toEqual({ possible: true, deadline: GRANICA })
  })

  // Granica należy do klienta: „do upływu okna" znaczy, że w ostatniej jego
  // sekundzie anulowanie jeszcze wchodzi. Tak samo liczy się minimalne
  // wyprzedzenie po drugiej stronie ścieżki.
  it('w samej chwili domknięcia okna anulowanie jeszcze wchodzi', () => {
    expect(stan({ now: GRANICA })).toEqual({ possible: true, deadline: GRANICA })
  })

  it('sekundę po domknięciu okna anulowanie już nie wchodzi', () => {
    expect(stan({ now: new Date(GRANICA.getTime() + 1000) })).toEqual({
      possible: false,
      reason: 'po-oknie',
      deadline: GRANICA,
    })
  })

  it('po samym terminie anulowanie nie wchodzi tym bardziej', () => {
    expect(stan({ now: new Date('2026-06-16T00:00:00Z') })).toEqual({
      possible: false,
      reason: 'po-oknie',
      deadline: GRANICA,
    })
  })

  // Rezerwacja, która terminu już nie trzyma, nie ma czego zwalniać. Powód
  // jest inny niż spóźnienie i inaczej się o nim mówi: tam zostaje telefon do
  // Strzelnicy, tutaj nie ma o czym dzwonić.
  it.each([
    'oczekujaca',
    'anulowana-przez-klienta',
    'odwolana-przez-strzelnice',
    'wygasla',
  ] as const)('Rezerwacja w stanie %s nie daje się anulować niezależnie od zegara', (status) => {
    expect(stan({ status })).toEqual({ possible: false, reason: 'nie-do-anulowania' })
  })
})

describe('Anulowanie przez klienta', () => {
  it('link nieznany bazie nie anuluje niczego', () => {
    expect(cancellationOutcome(null)).toEqual({ ok: false, problem: 'link-nieznany' })
  })

  it('pierwsze anulowanie zwalnia termin', () => {
    expect(
      cancellationOutcome({ status: 'anulowana-przez-klienta', justCancelled: true }),
    ).toEqual({ ok: true, alreadyCancelled: false })
  })

  // Drugie kliknięcie „Anuluj" — na przykład z drugiej karty przeglądarki.
  // Niczego nie zmienia i nie ma czym straszyć: Rezerwacji już nie ma.
  it('drugie anulowanie tej samej Rezerwacji niczego nie zmienia', () => {
    expect(
      cancellationOutcome({ status: 'anulowana-przez-klienta', justCancelled: false }),
    ).toEqual({ ok: true, alreadyCancelled: true })
  })

  // Rezerwacja pozostawiona potwierdzoną znaczy, że baza odmówiła — a odmówić
  // mogła tylko z jednego powodu, bo tylko jeden sprawdza.
  it('Rezerwacja pozostawiona potwierdzoną znaczy okno już domknięte', () => {
    expect(cancellationOutcome({ status: 'potwierdzona', justCancelled: false })).toEqual({
      ok: false,
      problem: 'po-oknie',
    })
  })

  it.each(['oczekujaca', 'odwolana-przez-strzelnice', 'wygasla'] as const)(
    'Rezerwacja w stanie %s nie była do anulowania',
    (status) => {
      expect(cancellationOutcome({ status, justCancelled: false })).toEqual({
        ok: false,
        problem: 'nie-do-anulowania',
      })
    },
  )
})
