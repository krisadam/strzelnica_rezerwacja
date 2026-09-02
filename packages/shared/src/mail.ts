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
 */
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

/**
 * Termin jednym zdaniem — tak samo, jak widzi go Osoba rezerwująca w Widgecie:
 * dzień słownie, godziny w strefie Strzelnicy, Oś po nazwie.
 */
function termin(input: ConfirmationEmailInput): string {
  const godziny = formatTimeRange(input.startsAt, input.endsAt, input.timeZone)
  return `${formatDayLabel(input.day)}, ${godziny} — ${input.laneName}`
}

/**
 * E-mail z linkiem potwierdzającym adres. Zdanie o wygasaniu stoi przy linku,
 * a nie na końcu: to ono tłumaczy, po co w ogóle klikać.
 *
 * Każde zdanie napisane **raz** i złożone w obie wersje. Dwie listy zdań
 * rozjechałyby się przy pierwszej poprawce wymowy, a wtedy klient dostawałby
 * jedną obietnicę w podglądzie, a drugą po włączeniu HTML-a.
 */
export function confirmationEmail(input: ConfirmationEmailInput): MailMessage {
  const powitanie = `Cześć, ${input.recipientName}!`
  const wstep = `Mamy Twoje zgłoszenie do Strzelnicy „${input.facilityName}":`
  const kiedy = termin(input)
  const rachunek = `Kwota do zapłaty: ${formatAmount(input.amount)} — płatne na miejscu w Strzelnicy.`
  const wezwanie =
    'Potwierdź adres e-mail, klikając w link. Trzymamy dla Ciebie ten termin przez ' +
    `${input.holdMinutes} minut — potem wraca do puli.`
  const stopka = 'Jeśli to nie Ty zamawiałeś, nie rób nic — Rezerwacja wygaśnie sama.'

  const text = [
    powitanie,
    '',
    wstep,
    kiedy,
    rachunek,
    '',
    wezwanie,
    input.url,
    '',
    stopka,
  ].join(LAMANIE)

  const html = [
    `<p>${escapeHtml(powitanie)}</p>`,
    `<p>${escapeHtml(wstep)}<br>`,
    `<strong>${escapeHtml(kiedy)}</strong><br>`,
    `${escapeHtml(rachunek)}</p>`,
    `<p>${escapeHtml(wezwanie)}</p>`,
    `<p><a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>`,
    `<p>${escapeHtml(stopka)}</p>`,
  ].join(LAMANIE)

  return {
    to: input.recipientEmail,
    subject: `Potwierdź adres e-mail — Rezerwacja w Strzelnicy „${input.facilityName}"`,
    text,
    html,
  }
}
