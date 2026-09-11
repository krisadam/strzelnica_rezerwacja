/**
 * Zapis godzin otwarcia: cały tydzień Strzelnicy naraz. Ósma droga zapisu tego
 * modułu i piąta, o którą prosi Panel, więc idzie tą samą skorupą, co Blokada,
 * zapis Osi i rozkład (`panelEndpoint`, ADR 0003, ADR 0010).
 *
 * Tydzień, a nie pojedynczy dzień — z tego samego powodu, co przy rozkładzie
 * (ADR 0013): dzień dopisany, poprawiony i zamknięty są wtedy jednym żądaniem
 * i jednym zapisem. Dzień zamknięty jest przy tym dniem **pominiętym** na
 * liście, a nie osobnym stanem: brak wiersza znaczy zamknięte, więc żądanie
 * o siedmiu dniach i żądanie o pięciu różnią się dokładnie tym, co Strzelnica
 * chce zamknąć.
 *
 * Osi nie ma tu wcale, inaczej niż przy rozkładzie: godziny są własnością
 * Strzelnicy, a nie Osi — o czym Strzelnicy mowa, rozstrzyga baza po numerze
 * konta, więc w żądaniu nie ma czego podstawić z palca.
 *
 * Czego tu nie ma, a jest w Panelu: kolizji z Rezerwacjami. Rezerwacja stojąca
 * poza nowymi godzinami **zostaje** — niesie własny termin i o godziny nie pyta
 * nikogo po tym, jak powstała. Wskazuje ją ekran (`hoursConflicts`),
 * a rozstrzyga człowiek: Odwołaniem z powodem albo wcale.
 */
import type { HoursOutcome, HoursRequest } from '../../../packages/shared/src/index.ts'
import {
  MalformedHoursRequestError,
  readHoursRequest,
  weekHoursProblems,
} from '../../../packages/shared/src/index.ts'
import type { Client } from '../_shared/baza.ts'
import { outcome, panelEndpoint } from '../_shared/http.ts'

async function handle(
  request: HoursRequest,
  client: Client,
  userId: string,
  origin: string | null,
): Promise<Response> {
  // Godziny sprawdzone tą samą czystą funkcją, którą pyta Panel, zanim pokaże
  // przycisk — serwer liczy to od nowa, bo walidacja w przeglądarce jest
  // wygodą, a nie zabezpieczeniem.
  const zastrzezenia = weekHoursProblems(request.week)
  if (zastrzezenia[0]) {
    return outcome<HoursOutcome>({ ok: false, problem: zastrzezenia[0] }, origin)
  }

  const zapis = await client.rpc('set_opening_hours', {
    // Nazwy kolumn tabeli, a nie pól `OpeningHours`: `jsonb_to_recordset`
    // zestawia klucze z nazwami kolumn dosłownie. Przełożenie pojęcia domeny
    // na wiersz należy do brzegu — tak samo jak `…FromRow` w drugą stronę.
    p_week: request.week.map((hours) => ({
      weekday: hours.weekday,
      opens_minute: hours.opensMinute,
      closes_minute: hours.closesMinute,
    })),
    // Konto potwierdzone przez GoTrue, a nie przepisane z treści żądania:
    // baza pyta o jego Strzelnicę i tym warunkiem odcina wszystkie pozostałe.
    p_user_id: userId,
  })

  if (zapis.error) throw new Error(zapis.error.message)

  // Pusto znaczy konto bez Strzelnicy — zdarza się między założeniem konta
  // a wpisem w `panel_users`. Braku konfiguracji, a nie awarii, więc wraca
  // nazwanym zastrzeżeniem.
  if (zapis.data !== true) {
    return outcome<HoursOutcome>({ ok: false, problem: 'nieznana-strzelnica' }, origin)
  }

  return outcome<HoursOutcome>({ ok: true }, origin)
}

Deno.serve(
  panelEndpoint(
    {
      bezKonta: 'Zmiana godzin otwarcia wymaga zalogowania do Panelu.',
      awaria: 'Nie udało się zapisać godzin otwarcia.',
    },
    { read: readHoursRequest, malformed: MalformedHoursRequestError },
    handle,
  ),
)
