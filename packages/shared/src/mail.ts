/**
 * Szablony poczty. Mieszkają w repozytorium — nie w panelu dostawcy — bo są
 * treścią modułu tak samo jak teksty Widgetu: zmiana zdania o wygasaniu jest
 * zmianą tego, co obiecujemy klientowi, i ma przejść przez przegląd kodu.
 *
 * Czyste funkcje: wiadomość składa się z danych podanych na wejściu, bez
 * odczytu zegara, bazy czy środowiska. Wysyłką zajmuje się Edge Function —
 * ona wie, czy jest do czego wysyłać.
 *
 * Jeden wygląd dla wszystkich Strzelnic, tak jak w Widgecie: nazwa Strzelnicy
 * jest jedynym, co odróżnia jedną wiadomość od drugiej.
 *
 * Plik ma trzy warstwy i warto je czytać w tej kolejności: `TEKSTY` — słownik
 * wszystkich zdań, jedyne miejsce z polszczyzną; `zloz` — składanie odcinków
 * w obie wersje wiadomości naraz; i na końcu same szablony, które są już tylko
 * listą odcinków.
 */
import type { BookingContact } from './booking.ts'
import { formatDayLabel, formatTimeRange } from './calendar.ts'
import type { CalendarDay } from './calendar.ts'
import { formatAmount } from './pricing.ts'

/** Złamanie wiersza. Nazwane, bo składa obie wersje wiadomości — tekstową i HTML. */
const LAMANIE = '\n'

/** Wiadomość gotowa do wysłania — w obu wersjach, bo klienci poczty bywają różni. */
export type MailMessage = {
  to: string
  subject: string
  text: string
  html: string
}

/** Pozycja zamówienia widziana w liście: nazwa z katalogu i liczba sztuk. */
export type OrderedItem = {
  name: string
  quantity: number
}

/**
 * Rezerwacja w kształcie, w jakim opisuje się ją na piśmie. Nie jest wierszem
 * bazy ani zgłoszeniem z formularza: pozycje mają tu **nazwy**, a nie
 * identyfikatory katalogu, bo „Glock 17" jest tym, co czyta człowiek. Zestawia
 * je Edge Function, która i tak czyta katalogi.
 *
 * Ta sama treść jedzie do Osoby rezerwującej i do Strzelnicy — różnią się tym,
 * co każda ze stron ma prawo wiedzieć, a nie tym, co się wydarzyło.
 */
export type BookingSummary = {
  facilityName: string
  laneName: string
  day: CalendarDay
  startsAt: Date
  endsAt: Date
  /** Strefa Strzelnicy: termin czyta człowiek, który o tej godzinie przyjedzie. */
  timeZone: string
  participants: number
  /** Deklaracja Pozwolenia; razem z `withInstructor` mówi, skąd wziął się Instruktor. */
  hasPermit: boolean
  withInstructor: boolean
  rentals: readonly OrderedItem[]
  ammunition: readonly OrderedItem[]
  /** Kwota zapisana przy Rezerwacji, w groszach. */
  amount: number
  contact: BookingContact
}

/**
 * Wszystkie zdania poczty w jednym miejscu — tak samo jak teksty Widgetu
 * w jego słowniku. Trzy szablony piszące własne wersje tych samych zdań
 * rozjechałyby się przy pierwszej poprawce wymowy, a klient dostawałby jedną
 * obietnicę w liście z linkiem, a inną w podsumowaniu.
 */
const TEKSTY = {
  powitanie: (imie: string) => `Cześć, ${imie}!`,
  /** Termin jednym zdaniem — tak samo, jak widzi go Osoba rezerwująca w Widgecie. */
  termin: (dzien: string, godziny: string, os: string) => `${dzien}, ${godziny} — ${os}`,
  uczestnicy: (ilu: number) => `Uczestnicy: ${ilu}`,
  pozwolenie: (ma: boolean) =>
    ma ? 'Pozwolenie na broń: zadeklarowane.' : 'Pozwolenie na broń: niezadeklarowane.',
  instruktor: {
    wymagany: 'Instruktor: tak — wymagany, bo Pozwolenie na broń nie jest zadeklarowane.',
    zamowiony: 'Instruktor: tak — zamówiony dobrowolnie.',
    brak: 'Instruktor: nie.',
  },
  wypozyczenie: {
    naglowek: 'Wypożyczenie broni:',
    brak: 'Wypożyczenie broni: brak — własna broń.',
  },
  amunicja: {
    naglowek: 'Zapotrzebowanie na amunicję:',
    brak: 'Zapotrzebowanie na amunicję: brak — bez zapotrzebowania.',
  },
  /** Jednostka wspólna dla Wypożyczeń i amunicji — jedno i drugie liczy się w sztukach. */
  pozycja: (nazwa: string, sztuki: number) => `${nazwa} — ${sztuki} szt.`,
  rachunek: (kwota: number) =>
    `Kwota do zapłaty: ${formatAmount(kwota)} — płatne na miejscu w Strzelnicy.`,

  potwierdzenie: {
    temat: (strzelnica: string) => `Potwierdź adres e-mail — Rezerwacja w Strzelnicy „${strzelnica}"`,
    wstep: (strzelnica: string) => `Mamy Twoje zgłoszenie do Strzelnicy „${strzelnica}":`,
    wezwanie: (minuty: number) =>
      'Potwierdź adres e-mail, klikając w link. Trzymamy dla Ciebie ten termin przez ' +
      `${minuty} minut — potem wraca do puli.`,
    stopka: 'Jeśli to nie Ty zamawiałeś, nie rób nic — Rezerwacja wygaśnie sama.',
  },

  podsumowanie: {
    temat: (strzelnica: string) => `Rezerwacja potwierdzona — Strzelnica „${strzelnica}"`,
    wstep: (strzelnica: string) =>
      `Adres potwierdzony, termin jest Twój. Oto, co zamówiłeś w Strzelnicy „${strzelnica}":`,
    zarzadzanie: 'Szczegóły Rezerwacji i jej anulowanie znajdziesz pod tym adresem:',
    stopka: 'Do zobaczenia na Osi!',
  },

  powiadomienie: {
    temat: (strzelnica: string, dzien: string) =>
      `Nowa Rezerwacja — ${dzien}, Strzelnica „${strzelnica}"`,
    wstep: 'Nowa Rezerwacja z potwierdzonym adresem:',
    kontakt: {
      naglowek: 'Osoba rezerwująca:',
      imie: (imie: string) => `Imię i nazwisko: ${imie}`,
      email: (adres: string) => `E-mail: ${adres}`,
      telefon: (numer: string) => `Telefon: ${numer}`,
    },
  },

  anulowanie: {
    temat: (strzelnica: string, dzien: string) =>
      `Anulowana Rezerwacja — ${dzien}, Strzelnica „${strzelnica}"`,
    wstep: 'Osoba rezerwująca anulowała swoją Rezerwację:',
    /** Zdanie o skutku, bo cały ten list mówi o czymś, co już się stało samo. */
    skutek: 'Termin wrócił do puli i jest znów do wzięcia — nie ma tu nic do zrobienia.',
  },
} as const

/**
 * Odcinek wiadomości. Szablon składa listę odcinków, a nie dwa ciągi znaków —
 * dzięki temu każde zdanie jest napisane **raz**, a wersja tekstowa i HTML
 * powstają z tego samego. Dwie listy zdań rozjechałyby się przy pierwszej
 * poprawce, a wtedy klient widziałby co innego w podglądzie, a co innego po
 * włączeniu HTML-a.
 */
type Odcinek =
  | { rodzaj: 'akapit'; wiersze: readonly Wiersz[] }
  | { rodzaj: 'lista'; naglowek: string; pozycje: readonly string[] }
  | { rodzaj: 'link'; adres: string }

/** Wiersz akapitu; wyróżniony trafia do HTML-a w `<strong>`, do tekstu bez zmian. */
type Wiersz = string | { mocny: string }

function akapit(...wiersze: readonly Wiersz[]): Odcinek {
  return { rodzaj: 'akapit', wiersze }
}

function lista(naglowek: string, pozycje: readonly string[]): Odcinek {
  return { rodzaj: 'lista', naglowek, pozycje }
}

function link(adres: string): Odcinek {
  return { rodzaj: 'link', adres }
}

/**
 * Treść od Osoby rezerwującej trafia do HTML-a jako tekst. Imię wpisuje ona
 * sama, a wiadomość ogląda w kliencie poczty, który znaczniki wykonuje.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function tekstWiersza(wiersz: Wiersz): string {
  return typeof wiersz === 'string' ? wiersz : wiersz.mocny
}

function htmlWiersza(wiersz: Wiersz): string {
  return typeof wiersz === 'string'
    ? escapeHtml(wiersz)
    : `<strong>${escapeHtml(wiersz.mocny)}</strong>`
}

/** Obie wersje wiadomości z jednej listy odcinków. */
function zloz(odcinki: readonly Odcinek[]): { text: string; html: string } {
  const text = odcinki
    .map((odcinek) => {
      switch (odcinek.rodzaj) {
        case 'akapit':
          return odcinek.wiersze.map(tekstWiersza).join(LAMANIE)
        case 'lista':
          return [odcinek.naglowek, ...odcinek.pozycje.map((pozycja) => `- ${pozycja}`)].join(
            LAMANIE,
          )
        case 'link':
          return odcinek.adres
      }
    })
    .join(LAMANIE + LAMANIE)

  const html = odcinki
    .map((odcinek) => {
      switch (odcinek.rodzaj) {
        case 'akapit':
          return `<p>${odcinek.wiersze.map(htmlWiersza).join('<br>' + LAMANIE)}</p>`
        case 'lista':
          return [
            `<p>${escapeHtml(odcinek.naglowek)}</p>`,
            '<ul>',
            ...odcinek.pozycje.map((pozycja) => `<li>${escapeHtml(pozycja)}</li>`),
            '</ul>',
          ].join(LAMANIE)
        case 'link':
          return `<p><a href="${escapeHtml(odcinek.adres)}">${escapeHtml(odcinek.adres)}</a></p>`
      }
    })
    .join(LAMANIE)

  return { text, html }
}

/** Termin jednym zdaniem: dzień słownie, godziny w strefie Strzelnicy, Oś po nazwie. */
function termin(input: {
  day: CalendarDay
  startsAt: Date
  endsAt: Date
  timeZone: string
  laneName: string
}): string {
  return TEKSTY.termin(
    formatDayLabel(input.day),
    formatTimeRange(input.startsAt, input.endsAt, input.timeZone),
    input.laneName,
  )
}

/**
 * Zamówienie jednego rodzaju: nagłówek z pozycjami albo jedno zdanie o tym, że
 * nie zamówiono nic. Brak jest tu odpowiedzią, a nie luką — Osoba rezerwująca
 * ma zobaczyć, że przyjedzie z własną bronią, zamiast domyślać się z ciszy.
 */
function zamowienie(
  pozycje: readonly OrderedItem[],
  slowa: { naglowek: string; brak: string },
): Odcinek {
  if (pozycje.length === 0) return akapit(slowa.brak)
  return lista(
    slowa.naglowek,
    pozycje.map((pozycja) => TEKSTY.pozycja(pozycja.name, pozycja.quantity)),
  )
}

/** Skąd wziął się Instruktor — albo dlaczego go nie ma. */
function instruktor(booking: BookingSummary): string {
  if (!booking.withInstructor) return TEKSTY.instruktor.brak
  return booking.hasPermit ? TEKSTY.instruktor.zamowiony : TEKSTY.instruktor.wymagany
}

/**
 * Rdzeń obu listów po potwierdzeniu: co, kiedy, na czym i za ile. Jedna kopia,
 * bo Strzelnica przygotowuje stanowisko z tego samego opisu, który klient
 * dostaje na piśmie — lista sprzętu krótsza po jednej ze stron byłaby pustym
 * stanowiskiem albo nieprzygotowanym sprzętem.
 */
function szczegoly(booking: BookingSummary): readonly Odcinek[] {
  return [
    akapit(
      { mocny: termin(booking) },
      TEKSTY.uczestnicy(booking.participants),
      TEKSTY.pozwolenie(booking.hasPermit),
      instruktor(booking),
    ),
    zamowienie(booking.rentals, TEKSTY.wypozyczenie),
    zamowienie(booking.ammunition, TEKSTY.amunicja),
    akapit(TEKSTY.rachunek(booking.amount)),
  ]
}

export type ConfirmationEmailInput = {
  facilityName: string
  recipientName: string
  recipientEmail: string
  laneName: string
  day: CalendarDay
  startsAt: Date
  endsAt: Date
  /** Strefa Strzelnicy: termin czyta człowiek, który o tej godzinie przyjedzie. */
  timeZone: string
  /** Kwota zapisana przy Rezerwacji, w groszach. */
  amount: number
  /** Link potwierdzający, złożony przez `confirmationUrl`. */
  url: string
  /** Ile minut Rezerwacja czeka na kliknięcie. */
  holdMinutes: number
}

/**
 * E-mail z linkiem potwierdzającym adres. Zdanie o wygasaniu stoi przy linku,
 * a nie na końcu: to ono tłumaczy, po co w ogóle klikać.
 *
 * Zamówionego sprzętu tu nie ma i być nie musi: ten list prosi o jedno
 * kliknięcie, a wszystko, co Osoba rezerwująca zamówiła, dostanie na piśmie
 * w podsumowaniu — czyli dopiero wtedy, gdy Rezerwacja naprawdę stoi.
 */
export function confirmationEmail(input: ConfirmationEmailInput): MailMessage {
  const { text, html } = zloz([
    akapit(TEKSTY.powitanie(input.recipientName)),
    akapit(
      TEKSTY.potwierdzenie.wstep(input.facilityName),
      { mocny: termin(input) },
      TEKSTY.rachunek(input.amount),
    ),
    akapit(TEKSTY.potwierdzenie.wezwanie(input.holdMinutes)),
    link(input.url),
    akapit(TEKSTY.potwierdzenie.stopka),
  ])

  return {
    to: input.recipientEmail,
    subject: TEKSTY.potwierdzenie.temat(input.facilityName),
    text,
    html,
  }
}

export type BookingSummaryEmailInput = {
  booking: BookingSummary
  /** Link do zarządzania Rezerwacją, złożony przez `managementUrl`. */
  url: string
}

/**
 * Podsumowanie Rezerwacji dla Osoby rezerwującej: wszystko, co zamówiła, wraz
 * z Kwotą i adresem, pod którym wróci do swojego zgłoszenia. Wychodzi dopiero
 * po potwierdzeniu adresu — przed nim nie ma czego podsumowywać, bo termin
 * jeszcze nie jest niczyj na stałe.
 */
export function bookingSummaryEmail({ booking, url }: BookingSummaryEmailInput): MailMessage {
  const { text, html } = zloz([
    akapit(TEKSTY.powitanie(booking.contact.name)),
    akapit(TEKSTY.podsumowanie.wstep(booking.facilityName)),
    ...szczegoly(booking),
    akapit(TEKSTY.podsumowanie.zarzadzanie),
    link(url),
    akapit(TEKSTY.podsumowanie.stopka),
  ])

  return {
    to: booking.contact.email,
    subject: TEKSTY.podsumowanie.temat(booking.facilityName),
    text,
    html,
  }
}

export type FacilityNotificationEmailInput = {
  booking: BookingSummary
  /** Adres powiadomień Strzelnicy — jej pole konfiguracyjne, nie adres klienta. */
  to: string
}

/**
 * Powiadomienie Strzelnicy o nowej Rezerwacji. Te same szczegóły, co u klienta,
 * plus dane kontaktowe — bo obsługa czasem musi zadzwonić.
 *
 * Czego tu nie ma: linku do zarządzania Rezerwacją. Jest on uprawnieniem Osoby
 * rezerwującej, a Strzelnica ma do tego Panel — link przesłany jej pozwalałby
 * anulować cudzą Rezerwację jej ręką i z pominięciem Okna anulowania.
 */
export function facilityNotificationEmail({
  booking,
  to,
}: FacilityNotificationEmailInput): MailMessage {
  const { text, html } = zloz([
    akapit(TEKSTY.powiadomienie.wstep),
    ...szczegoly(booking),
    akapit(
      TEKSTY.powiadomienie.kontakt.naglowek,
      TEKSTY.powiadomienie.kontakt.imie(booking.contact.name),
      TEKSTY.powiadomienie.kontakt.email(booking.contact.email),
      TEKSTY.powiadomienie.kontakt.telefon(booking.contact.phone),
    ),
  ])

  return {
    to,
    subject: TEKSTY.powiadomienie.temat(booking.facilityName, formatDayLabel(booking.day)),
    text,
    html,
  }
}

export type ClientCancellationEmailInput = {
  booking: BookingSummary
  /** Adres powiadomień Strzelnicy — jej pole konfiguracyjne, nie adres klienta. */
  to: string
}

/**
 * Powiadomienie Strzelnicy o Rezerwacji anulowanej przez klienta. Ten sam opis,
 * co w powiadomieniu o nowej — obsługa zestawia go z tym, co ma zapisane,
 * i z tej samej listy odwołuje przygotowany sprzęt.
 *
 * Czego tu nie ma: prośby o cokolwiek. Termin wrócił do puli sam, w tej samej
 * transakcji, w której Rezerwacja zmieniła stan; list donosi o skutku, a nie
 * zleca jego wywołanie.
 */
export function clientCancellationEmail({ booking, to }: ClientCancellationEmailInput): MailMessage {
  const { text, html } = zloz([
    akapit(TEKSTY.anulowanie.wstep),
    ...szczegoly(booking),
    akapit(
      TEKSTY.powiadomienie.kontakt.naglowek,
      TEKSTY.powiadomienie.kontakt.imie(booking.contact.name),
      TEKSTY.powiadomienie.kontakt.email(booking.contact.email),
      TEKSTY.powiadomienie.kontakt.telefon(booking.contact.phone),
    ),
    akapit(TEKSTY.anulowanie.skutek),
  ])

  return {
    to,
    subject: TEKSTY.anulowanie.temat(booking.facilityName, formatDayLabel(booking.day)),
    text,
    html,
  }
}
