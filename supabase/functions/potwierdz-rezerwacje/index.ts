/**
 * Potwierdzenie adresu e-mail. Druga — obok zapisu — droga, którą Rezerwacja
 * zmienia stan, i tak samo jak tamta zamknięta dla klucza anonimowego: tabela
 * `bookings` nie ma żadnej polityki RLS (ADR 0003), a `confirm_booking` ma
 * odebrane prawo wykonania wszystkim poza rolą serwisową.
 *
 * Cała zmiana stanu dzieje się w bazie, w jednej transakcji i pod blokadą
 * doradczą na Strzelnicę: to tam jest jeden zegar, którym mierzy się
 * wygaśnięcie, i jedna kolejka, w której potwierdzenie mija się z cudzym
 * zgłoszeniem na ten sam termin. Tutaj zostaje przetłumaczenie odpowiedzi bazy
 * na zdanie dla Osoby rezerwującej — czystą funkcją, tą samą, którą testuje
 * `packages/shared`.
 *
 * Czego tu **nie ma**: sprawdzenia nagłówka `Origin`. Przy zapisie jest ono
 * bramką, bo tam o zapis prosi cudza strona w imieniu swojego gościa. Tutaj
 * jedynym upoważnieniem jest token z e-maila — nie ma ciasteczka ani sesji,
 * które dałoby się wykorzystać z obcej strony, więc lista domen niczego by nie
 * zamknęła. Zobacz ADR 0007.
 */
import type { ConfirmationOutcome, ConfirmationResult } from '../../../packages/shared/src/index.ts'
import { confirmationOutcome } from '../../../packages/shared/src/index.ts'
import { connect } from '../_shared/baza.ts'
import { corsHeaders, json, outcome } from '../_shared/http.ts'

/** Token ze zgłoszenia albo `null`, gdy żądanie w ogóle go nie niesie. */
function readToken(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const token = (value as Record<string, unknown>).token
  if (typeof token !== 'string' || token.trim() === '') return null
  return token.trim()
}

async function handle(token: string, origin: string | null): Promise<Response> {
  const client = connect()

  const { data, error } = await client.rpc('confirm_booking', { p_token: token })
  if (error) throw new Error(error.message)

  // Pusty wynik znaczy token, którego baza nie zna — a to jest odpowiedź
  // o zgłoszeniu, nie awaria. `confirmationOutcome` nazywa ją po polsku.
  const wiersz = data?.[0]
  const result: ConfirmationResult | null = wiersz
    ? { status: wiersz.final_status, justConfirmed: wiersz.just_confirmed }
    : null

  return outcome<ConfirmationOutcome>(confirmationOutcome(result), origin)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') return json({ error: 'Metoda nieobsługiwana.' }, 405, origin)

  const token = readToken(await req.json().catch(() => null))
  if (!token) return json({ error: 'Żądanie nie niesie tokenu potwierdzającego.' }, 400, origin)

  try {
    return await handle(token, origin)
  } catch (powod) {
    console.error(powod)
    return json({ error: 'Nie udało się potwierdzić Rezerwacji.' }, 500, origin)
  }
})
