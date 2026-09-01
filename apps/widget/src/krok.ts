/**
 * Krok, na którym stoi Osoba rezerwująca, i wybór, który go tam zaprowadził.
 * Osobny plik, bo kształt wyboru czytają wszystkie kroki, a stan trzyma `App` —
 * import z komponentu do komponentu robiłby z tego pierścień.
 */
import type { Block, BookingDraft, BookingProblem, CalendarDay, Lane } from '@strzelnica/shared'

/** Termin wybrany w kalendarzu: Oś, dzień i Blok, którego dotyczy zgłoszenie. */
export type Wybor = {
  lane: Lane
  day: CalendarDay
  block: Block
}

export type Krok =
  /**
   * `powrot` niesie zastrzeżenie, które odesłało Osobę rezerwującą do
   * kalendarza — samo zastrzeżenie, nie jego zdanie po polsku. Teksty mieszkają
   * w jednym słowniku i składa je dopiero komponent.
   */
  | { nazwa: 'kalendarz'; powrot?: BookingProblem }
  | { nazwa: 'formularz'; wybor: Wybor }
  | { nazwa: 'podsumowanie'; wybor: Wybor }
  | { nazwa: 'potwierdzenie'; wybor: Wybor; draft: BookingDraft; id: string }

/** Puste zgłoszenie: jeden Uczestnik, bo Osoba rezerwująca zwykle jest nim sama. */
export const PUSTY_DRAFT: BookingDraft = {
  participants: 1,
  contact: { name: '', email: '', phone: '' },
  consent: false,
}
