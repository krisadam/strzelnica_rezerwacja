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
 * Poza samym adresem mieszka tu kształt tego, co Widget pod nim pokazuje.
 * Identyfikator Rezerwacji nie występuje w nim ani razu: podstawienie cudzego
 * w adresie nie ma czego otworzyć, bo nie ma czego podstawić.
 */
import { cancellationState } from './cancellation.ts'
import type { CancellationState } from './cancellation.ts'
import type { Database } from './database.types.ts'
import { widgetLink } from './links.ts'
import type { WidgetLinkInput } from './links.ts'
import type { BookingSummary } from './mail.ts'

type BookingStatus = Database['public']['Enums']['booking_status']

/** Parametr adresu, którym Widget poznaje wejście z linku do Rezerwacji. */
export const MANAGEMENT_PARAM = 'rezerwacja'

/** Wejście `managementUrl` — kształt wspólny wszystkim linkom Widgetu. */
export type ManagementUrlInput = WidgetLinkInput

export function managementUrl(input: ManagementUrlInput): string {
  return widgetLink(MANAGEMENT_PARAM, input)
}

/** Token z adresu Widgetu; `null` znaczy zwykłe wejście do kalendarza. */
export function readManagementToken(search: string): string | null {
  return new URLSearchParams(search).get(MANAGEMENT_PARAM)
}

/**
 * Kontakt do Strzelnicy pokazywany Osobie rezerwującej, gdy okno anulowania
 * się domknęło. Odrębny od Adresu powiadomień: tamten jest skrzynką obsługi
 * i nie wychodzi publicznie, ten jest tym, co Strzelnica sama podaje klientom.
 *
 * Puste znaczy Strzelnicę, która kontaktu jeszcze nie wpisała — i wtedy zostaje
 * jej własna strona, na której Widget stoi osadzony.
 */
export type FacilityContact = {
  email: string | null
  phone: string | null
}

/**
 * Co Osoba rezerwująca widzi pod swoim linkiem: cała Rezerwacja, jej stan
 * i odpowiedź na jedyne pytanie, które może tu zadać — czy wolno ją jeszcze
 * anulować.
 *
 * Opis Rezerwacji jest tym samym `BookingSummary`, który jedzie w listach:
 * ekran i podsumowanie mówią o jednej Rezerwacji, więc opisuje ją jeden
 * kształt. Kwota jest jego częścią, bo klient przyjeżdża z gotówką.
 */
export type ManagementView = {
  status: BookingStatus
  booking: BookingSummary
  cancellation: CancellationState
  /** Kontakt do Strzelnicy — potrzebny wtedy, gdy klient nie może już sam. */
  facility: FacilityContact
  /**
   * Powód, dla którego Strzelnica odwołała tę Rezerwację; puste ma każda
   * nieodwołana. Klient dostaje go pocztą w chwili odwołania, ale list bywa
   * skasowany albo przeczytany w pośpiechu — a ten ekran jest tym miejscem, do
   * którego wraca się po szczegóły własnej Rezerwacji. Bez powodu zostałoby mu
   * tu samo „odwołana" i telefon do Strzelnicy.
   */
  revocationReason: string | null
}

export type ManagementViewInput = {
  status: BookingStatus
  booking: BookingSummary
  /** Okno anulowania Strzelnicy, w godzinach — jej pole konfiguracyjne. */
  cancellationWindowHours: number
  facility: FacilityContact
  revocationReason: string | null
  now: Date
}

/**
 * Cały ekran z jednego wywołania. Termin Rezerwacji bierze się z jej opisu,
 * a nie przychodzi osobno: dwie wartości dałyby się podać rozbieżnie, a wtedy
 * przycisk „Anuluj" odpowiadałby na inny termin niż ten wypisany nad nim.
 */
export function managementView({
  status,
  booking,
  cancellationWindowHours,
  facility,
  revocationReason,
  now,
}: ManagementViewInput): ManagementView {
  return {
    status,
    booking,
    cancellation: cancellationState({
      status,
      startsAt: booking.startsAt,
      cancellationWindowHours,
      now,
    }),
    facility,
    revocationReason,
  }
}

/**
 * Ten sam widok w postaci, w jakiej przechodzi przez JSON: momenty jako ISO
 * 8601, bo `Date` nie przeżywa serializacji. Typ liczony z `ManagementView`,
 * a nie przepisany obok — dwie listy pól rozjechałyby się przy pierwszym
 * dołożonym polu, a rozjazd tutaj znaczyłby ekran bez terminu.
 */
type Isoified<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] }

export type ManagementViewWire = Isoified<Omit<ManagementView, 'booking' | 'cancellation'>> & {
  booking: Isoified<BookingSummary>
  cancellation: Isoified<CancellationState>
}

/** Wynik wejścia w link do zarządzania. Nieznany token nie ma czego pokazać. */
export type ManagementOutcome =
  | { ok: true; view: ManagementViewWire }
  | { ok: false; problem: 'link-nieznany' }

/** Momenty z powrotem jako `Date`. Jedna kopia, bo jedna jest droga tego widoku. */
export function readManagementView(wire: ManagementViewWire): ManagementView {
  return {
    status: wire.status,
    booking: {
      ...wire.booking,
      startsAt: new Date(wire.booking.startsAt),
      endsAt: new Date(wire.booking.endsAt),
    },
    cancellation: wire.cancellation.possible
      ? { possible: true, deadline: new Date(wire.cancellation.deadline) }
      : wire.cancellation.reason === 'po-oknie'
        ? { possible: false, reason: 'po-oknie', deadline: new Date(wire.cancellation.deadline) }
        : { possible: false, reason: 'nie-do-anulowania' },
    facility: wire.facility,
    revocationReason: wire.revocationReason,
  }
}

/**
 * Widok w postaci do wysłania. `JSON.stringify` zamieniłby momenty na te same
 * ciągi znaków sam, ale po cichu i bez wiedzy kontroli typów — a wtedy jedyną
 * gwarancją, że nadawca i odbiorca mówią o tym samym kształcie, byłaby uwaga
 * czytającego. Tędy gwarantuje to typ, a `readManagementView` jest tego
 * odwrotnością.
 */
export function writeManagementView(view: ManagementView): ManagementViewWire {
  return {
    status: view.status,
    booking: {
      ...view.booking,
      startsAt: view.booking.startsAt.toISOString(),
      endsAt: view.booking.endsAt.toISOString(),
    },
    cancellation: view.cancellation.possible
      ? { possible: true, deadline: view.cancellation.deadline.toISOString() }
      : view.cancellation.reason === 'po-oknie'
        ? {
            possible: false,
            reason: 'po-oknie',
            deadline: view.cancellation.deadline.toISOString(),
          }
        : { possible: false, reason: 'nie-do-anulowania' },
    facility: view.facility,
    revocationReason: view.revocationReason,
  }
}
