/**
 * Zapis Wyjątku kalendarzowego: jedna data, która nie idzie rytmem tygodnia.
 * Dziewiąta droga zapisu tego modułu i szósta, o którą prosi Panel, więc idzie
 * tą samą skorupą, co godziny otwarcia i rozkład (`panelEndpoint`, ADR 0003,
 * ADR 0010).
 *
 * Jedno żądanie na dopisanie, poprawkę i zdjęcie wyjątku — różnią się wyłącznie
 * tym, co na dacie ma zostać, a wyjątek pusty znaczy datę wracającą do rytmu
 * tygodnia. Data pojedynczo, a nie cały kalendarz naraz jak tydzień godzin:
 * wyjątków przybywa przez cały rok, więc zapis w całości kasowałby po drodze
 * święta wpisane poprzednią zmianą.
 *
 * Czego tu nie ma: rozstrzygania o Rezerwacjach stojących w tym dniu. Zostają —
 * wyjątek mówi, czego Strzelnica nie sprzedaje, a nie komu odbiera termin.
 * Wskazuje je ekran (`hoursConflicts`), a rozstrzyga człowiek: Odwołaniem
 * z powodem albo wcale, bo klient i tak przyjedzie.
 */
import type { ExceptionRequest, HoursOutcome } from '../../../packages/shared/src/index.ts'
import {
  exceptionProblems,
  MalformedHoursRequestError,
  readExceptionRequest,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

async function handle(
  request: ExceptionRequest,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Data i godziny sprawdzone tą samą czystą funkcją, którą pyta Panel, zanim
  // pokaże przycisk — serwer liczy to od nowa, bo walidacja w przeglądarce jest
  // wygodą, a nie zabezpieczeniem.
  const zastrzezenia = exceptionProblems(request)
  if (zastrzezenia[0]) {
    return outcome<HoursOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania: baza
  // pyta o jego Strzelnicę i tym warunkiem odcina wszystkie pozostałe.
  const zapis = request.exception
    ? await client.rpc('save_calendar_exception', {
        p_on_date: request.day,
        p_reason: request.exception.reason,
        // Godziny puste znaczą dzień zamknięty w całości — jedna kolumna pusta
        // nie przejdzie przez schemat, więc para idzie razem albo wcale.
        p_opens_minute: request.exception.hours?.opensMinute ?? null,
        p_closes_minute: request.exception.hours?.closesMinute ?? null,
        p_user_id: userId,
      })
    : await client.rpc('delete_calendar_exception', {
        p_on_date: request.day,
        p_user_id: userId,
      })

  if (zapis.error) throw new Error(zapis.error.message)

  // Pusto znaczy konto bez Strzelnicy — zdarza się między założeniem konta
  // a wpisem w `panel_users`. Brak konfiguracji, a nie awaria, więc wraca
  // nazwanym zastrzeżeniem.
  if (zapis.data !== true) {
    return outcome<HoursOutcome>({ ok: false, problem: 'nieznana-strzelnica' }, origin)
  }

  return outcome<HoursOutcome>({ ok: true }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Zmiana wyjątku kalendarzowego wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się zapisać wyjątku kalendarzowego.',
    },
    { read: readExceptionRequest, malformed: MalformedHoursRequestError },
    handle,
  ),
)
