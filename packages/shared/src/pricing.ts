/**
 * Kwota do zapłaty: suma liniowa z cennika Strzelnicy. Czysta funkcja — cennik
 * i zamówienie są parametrami, więc ta sama kopia liczy rachunek pokazywany
 * w Widgecie na bieżąco i ten zapisywany przez Edge Function. Rozjazd między
 * nimi byłby Osobą rezerwującą, która płaci inną Kwotę, niż zobaczyła.
 *
 * Moduł Kwotę wyłącznie **prezentuje** — rozliczenie następuje na miejscu
 * w Strzelnicy, więc nie ma tu ani płatności, ani zadatku, ani zaokrągleń
 * kasowych. Wszystko liczy się w groszach jako liczby całkowite: waluta jest
 * jedna (PLN), a suma liniowa całkowitych nigdy nie wychodzi z całkowitych.
 *
 * Rachunek liczy się z **podanych** stawek i cen, nie z katalogu. To jest ten
 * jeden szew, na którym trzyma się zamrożenie Kwoty: Rezerwacja zapisuje
 * stawki użyte do jej wyliczenia, więc daje się przeliczyć po zmianie cennika
 * i wychodzi ta sama Kwota. Katalog dokłada dopiero `priceBooking`.
 */
import type { AmmunitionDemand, AmmunitionKind } from './ammunition.ts'
import { instructorAttends } from './availability.ts'
import type { WeaponRental, WeaponType } from './availability.ts'
import type { BookingDraft } from './booking.ts'

/**
 * Stawki Strzelnicy w groszach. Stawka za Blok jest własnością Osi, a nie
 * Strzelnicy — spec zostawia tak miejsce na cennik zależny od pory dnia bez
 * zmiany kształtu danych. Pozostałe dwie są wspólne dla całej Strzelnicy,
 * bo Instruktor i Uczestnik nie należą do żadnej Osi z osobna.
 */
export type Rates = {
  /** Stawka za Blok; obejmuje pierwszego Uczestnika. */
  blockRate: number
  /** Stawka za uczestnictwo, naliczana za Uczestników poza pierwszym. */
  participationRate: number
  /** Stawka za Instruktora, naliczana za samą jego obecność. */
  instructorRate: number
}

/**
 * Cennik złożony ze Strzelnicy i wybranej Osi. Jedna funkcja, a nie trzy
 * odczyty w każdym miejscu z osobna: stawka wzięta z niewłaściwego poziomu
 * dałaby rachunek, którego nikt nie umie wytłumaczyć.
 */
export function ratesFor(
  facility: { participationRate: number; instructorRate: number },
  lane: { blockRate: number },
): Rates {
  return {
    blockRate: lane.blockRate,
    participationRate: facility.participationRate,
    instructorRate: facility.instructorRate,
  }
}

/**
 * Pozycja Rezerwacji z ceną, po której ją policzono. Wypożyczenie wskazuje Typ
 * broni, Zapotrzebowanie — Rodzaj amunicji, ale rachunek jest w obu ten sam:
 * cena razy liczba sztuk. Cena jest tutaj wartością, a nie odczytem z katalogu,
 * bo Rezerwacja złożona wcześniej niesie własną.
 */
export type PricedQuantity = {
  unitPrice: number
  quantity: number
}

/**
 * Rozbicie Kwoty na składniki. Osoba rezerwująca widzi, z czego składa się to,
 * co zapłaci — więc składniki są wynikiem wyliczenia, a nie czymś składanym
 * obok niego. `total` jest ich sumą i nie ma innej drogi, którą mógłby się
 * policzyć.
 */
export type AmountBreakdown = {
  block: number
  participation: number
  instructor: number
  rentals: number
  ammunition: number
  total: number
}

/** Wypożyczenie z ceną, po której je policzono. */
export type PricedRental = WeaponRental & { unitPrice: number }

/** Zapotrzebowanie z ceną, po której je policzono. */
export type PricedDemand = AmmunitionDemand & { unitPrice: number }

/**
 * Wycenione zgłoszenie: Kwota i pozycje, z których się policzyła. To jest to,
 * co Rezerwacja zapisuje przy złożeniu — i wszystko, czego potrzeba, żeby
 * przeliczyć ją później, nie zaglądając do cennika.
 */
export type PricedBooking = {
  amount: AmountBreakdown
  rentals: readonly PricedRental[]
  ammunition: readonly PricedDemand[]
}

export type AmountInput = {
  rates: Rates
  participants: number
  /**
   * Czy przy Rezerwacji jest Instruktor. Sam fakt, nie powód: stawka nalicza
   * się tak samo, gdy jest wymagany, jak gdy zamówiony dobrowolnie.
   */
  instructor: boolean
  rentals: readonly PricedQuantity[]
  ammunition: readonly PricedQuantity[]
}

function sumOfLines(pozycje: readonly PricedQuantity[]): number {
  return pozycje.reduce((razem, pozycja) => razem + pozycja.unitPrice * pozycja.quantity, 0)
}

/**
 * Uczestnicy poza pierwszym. Pierwszy jest wliczony w stawkę za Blok, więc
 * Rezerwacja jednoosobowa nie płaci za uczestnictwo nic.
 *
 * Liczba spoza zakresu daje zero, a nie rachunek z `NaN`: bierze się z pola
 * formularza, więc w trakcie pisania bywa pusta, a Kwota ma wtedy pokazać to,
 * co już wiadomo. O liczbie Uczestników, której nie da się przyjąć, mówi
 * zastrzeżenie z `bookingProblems` — nie rachunek.
 */
function beyondFirst(participants: number): number {
  if (!Number.isInteger(participants) || participants < 2) return 0
  return participants - 1
}

/**
 * Kwota do zapłaty z gotowych stawek i cen. Suma liniowa: stawka za Blok +
 * stawka za uczestnictwo × (Uczestnicy − 1) + Σ (cena broni × sztuki) +
 * Σ (cena amunicji × sztuki) + stawka za Instruktora, jeśli jest obecny.
 */
export function bookingAmount({
  rates,
  participants,
  instructor,
  rentals,
  ammunition,
}: AmountInput): AmountBreakdown {
  const skladniki = {
    block: rates.blockRate,
    participation: rates.participationRate * beyondFirst(participants),
    instructor: instructor ? rates.instructorRate : 0,
    rentals: sumOfLines(rentals),
    ammunition: sumOfLines(ammunition),
  }

  return {
    ...skladniki,
    total: Object.values(skladniki).reduce((razem, skladnik) => razem + skladnik, 0),
  }
}

export class UnpricedItemError extends Error {
  constructor(what: string, id: string) {
    super(`Katalog Strzelnicy nie zna pozycji ${what} o identyfikatorze ${id}.`)
    this.name = 'UnpricedItemError'
  }
}

/**
 * Cena pozycji wzięta z katalogu. Pozycja, której katalog nie zna, zatrzymuje
 * rachunek, zamiast policzyć się na zero — cisza w tym miejscu znaczyłaby
 * Rezerwację wydaną za darmo.
 *
 * Do wyliczenia Kwoty z taką pozycją i tak nie dochodzi: Rodzaj amunicji
 * spoza katalogu odsiewa `bookingProblems`, a Typ broni spoza katalogu —
 * dostępność Bloku, bo nie ma ani jednej sztuki do wydania. Wyjątek jest tu
 * na wypadek, gdyby któraś z tych dwóch dróg kiedyś przestała prowadzić tutaj.
 */
function priceOf(
  katalog: readonly { id: string; unitPrice: number }[],
  id: string,
  what: string,
): number {
  const wpis = katalog.find((kandydat) => kandydat.id === id)
  if (!wpis) throw new UnpricedItemError(what, id)
  return wpis.unitPrice
}

export type PricedBookingInput = {
  rates: Rates
  draft: BookingDraft
  weaponTypes: readonly WeaponType[]
  ammunitionKinds: readonly AmmunitionKind[]
}

/**
 * Zgłoszenie wycenione po katalogu Strzelnicy: Kwota do zapłaty i pozycje
 * z cenami, po których ją policzono.
 *
 * Jedna funkcja daje jedno i drugie, bo jedno i drugie musi się zgadzać.
 * Widget bierze z niej samo rozbicie i pokazuje je Osobie rezerwującej;
 * Edge Function bierze także pozycje i zapisuje je razem z Kwotą, żeby dała
 * się przeliczyć po zmianie cennika. Ceny odczytane drugi raz, osobno dla
 * zapisu, byłyby Rezerwacją, której rachunek nie zgadza się z jej pozycjami.
 */
export function priceBooking({
  rates,
  draft,
  weaponTypes,
  ammunitionKinds,
}: PricedBookingInput): PricedBooking {
  const rentals = draft.rentals.map((pozycja) => ({
    ...pozycja,
    unitPrice: priceOf(weaponTypes, pozycja.weaponTypeId, 'Wypożyczenia'),
  }))
  const ammunition = draft.ammunition.map((pozycja) => ({
    ...pozycja,
    unitPrice: priceOf(ammunitionKinds, pozycja.ammunitionKindId, 'Zapotrzebowania'),
  }))

  return {
    rentals,
    ammunition,
    amount: bookingAmount({
      rates,
      participants: draft.participants,
      // Powód obecności Instruktora nie zmienia stawki, więc rachunek pyta
      // o sam fakt — tą samą funkcją, którą pyta o niego dostępność.
      instructor: instructorAttends(draft),
      rentals,
      ammunition,
    }),
  }
}

const formatter = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })

/**
 * Grosze jako złote z walutą. Formatowanie mieszka tutaj, obok wyliczenia,
 * a nie w słowniku tekstów Widgetu: Kwota jest jedna i ma wyglądać tak samo
 * w formularzu, w podsumowaniu i w e-mailu (ticket #11).
 */
export function formatAmount(grosze: number): string {
  return formatter.format(grosze / 100)
}
