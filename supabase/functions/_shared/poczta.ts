/**
 * Wysyłka poczty. Treść wiadomości składają czyste funkcje z `packages/shared`
 * — tutaj jest wyłącznie to, czego czysta funkcja zrobić nie może: podanie jej
 * dalej.
 *
 * Dwie drogi, wybierane obecnością klucza dostawcy:
 *
 * — z `RESEND_API_KEY` wiadomość idzie do Resend, tak jak przewiduje spec;
 * — bez niego nie ma czym wysyłać, więc wiadomość ląduje w `mail_outbox`.
 *
 * Ta druga droga jest jednocześnie owym „przechwytywaniem wysyłki w środowisku
 * testowym", którego wymaga spec: praca lokalna i CI klucza nie mają, a testy
 * przeglądarkowe czytają stamtąd link, którego inaczej nie zobaczyłyby wcale.
 * Nie ma tu żadnego przełącznika „tryb testowy" — jest brak dostawcy, i to on
 * jest prawdziwym powodem.
 */
import type { MailMessage } from '../../../packages/shared/src/index.ts'
import type { Client } from './baza.ts'

/** Czyja to poczta — żeby przechwycona wiadomość dała się z czymkolwiek zestawić. */
export type MailContext = {
  facilityId: string
  bookingId: string | null
}

export class MailNotSentError extends Error {
  constructor(message: string) {
    super(`Nie udało się wysłać wiadomości: ${message}`)
    this.name = 'MailNotSentError'
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

async function wyslijPrzezResend(apiKey: string, message: MailMessage): Promise<void> {
  // Nadawca jest konfiguracją platformy, nie danymi Strzelnicy: adres musi
  // stać w domenie zweryfikowanej u dostawcy, a tę mamy jedną dla wszystkich.
  const from = Deno.env.get('MAIL_FROM')
  if (!from) throw new MailNotSentError('brak MAIL_FROM w środowisku funkcji')

  const odpowiedz = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  })

  if (!odpowiedz.ok) {
    throw new MailNotSentError(`dostawca odpowiedział kodem ${odpowiedz.status}`)
  }
}

async function zapiszWSkrzynce(
  client: Client,
  message: MailMessage,
  context: MailContext,
): Promise<void> {
  const { error } = await client.from('mail_outbox').insert({
    facility_id: context.facilityId,
    booking_id: context.bookingId,
    recipient: message.to,
    subject: message.subject,
    body_text: message.text,
    body_html: message.html,
  })

  if (error) throw new MailNotSentError(error.message)
}

/**
 * Wysłanie albo przechwycenie — z punktu widzenia wołającego to samo:
 * wiadomość doszła tam, gdzie w tym środowisku dochodzi. Niepowodzenie leci
 * wyjątkiem, bo Rezerwacja bez e-maila z linkiem jest Rezerwacją, której nikt
 * nie potwierdzi.
 */
export async function wyslijPoczte(
  client: Client,
  message: MailMessage,
  context: MailContext,
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (apiKey) return wyslijPrzezResend(apiKey, message)
  return zapiszWSkrzynce(client, message, context)
}
