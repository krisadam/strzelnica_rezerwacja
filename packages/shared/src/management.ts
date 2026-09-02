/**
 * Link do zarządzania Rezerwacją: jedyna droga, którą Osoba rezerwująca wraca
 * do własnego zgłoszenia. Konta nie ma (CONTEXT: „identyfikuje się adresem
 * e-mail, a dostęp do własnej Rezerwacji uzyskuje przez podpisany link"), więc
 * token w adresie jest tu całym uwierzytelnieniem.
 *
 * Odrębny od linku potwierdzającego, choć wyglądają identycznie. Tamten działa
 * raz i nie robi nic poza potwierdzeniem; ten otwiera Rezerwację na cały czas
 * jej trwania i to nim się ją anuluje. Jeden token dla obu spraw znaczyłby, że
 * adres zużyty przy potwierdzeniu nadal daje pełen dostęp.
 *
 * Widok, do którego ten link prowadzi, powstaje w ticketach #12 i #15. Adres
 * jest tutaj wcześniej, bo list z podsumowaniem musi go już nieść — i lepiej,
 * żeby był jeden, składany w jednym miejscu, niż sklejany na miejscu wysyłki.
 */
import { widgetLink } from './links.ts'
import type { WidgetLinkInput } from './links.ts'

/** Parametr adresu, którym Widget poznaje wejście z linku do Rezerwacji. */
export const MANAGEMENT_PARAM = 'rezerwacja'

/** Wejście `managementUrl` — kształt wspólny wszystkim linkom Widgetu. */
export type ManagementUrlInput = WidgetLinkInput

export function managementUrl(input: ManagementUrlInput): string {
  return widgetLink(MANAGEMENT_PARAM, input)
}
