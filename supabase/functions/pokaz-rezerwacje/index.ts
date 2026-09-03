/**
 * Rezerwacja pod linkiem do zarządzania. Odczyt, a nie zapis — i mimo to idzie
 * Edge Function, nie wprost z przeglądarki: tabela `bookings` nie ma żadnej
 * polityki RLS (ADR 0003), bo niesie dane osobowe, a Osoba rezerwująca nie ma
 * konta, którym dałoby się jej pokazać własny wiersz i tylko własny.
 *
 * Upoważnieniem jest token z linku i nic poza nim. Identyfikator Rezerwacji nie
 * występuje ani w żądaniu, ani w odpowiedzi: podstawienie cudzego w adresie nie
 * ma czego otworzyć, bo nie ma czego podstawić (ADR 0007).
 *
 * Skorupa żądania — metody, nagłówki i odczyt tokenu — jest wspólna dla
 * wszystkich funkcji otwieranych linkiem; stąd `tokenEndpoint`. Tam też stoi
 * powód, dla którego nie ma tu sprawdzenia nagłówka `Origin`.
 */
import type { ManagementOutcome } from '../../../packages/shared/src/index.ts'
import { managementView, writeManagementView } from '../../../packages/shared/src/index.ts'
import { connect } from '../_shared/baza.ts'
import { outcome, tokenEndpoint } from '../_shared/http.ts'
import { czytajPoTokenie } from '../_shared/rezerwacja.ts'

Deno.serve(
  tokenEndpoint(
    {
      brakTokenu: 'Żądanie nie niesie tokenu Rezerwacji.',
      awaria: 'Nie udało się odczytać Rezerwacji.',
    },
    async (token, origin) => {
      const client = connect()
      const rezerwacja = await czytajPoTokenie(client, token)

      // Token, którego baza nie zna. Odpowiedź o zgłoszeniu, nie awaria — i ta
      // sama dla linku uciętego przez klienta poczty, co dla podstawionego
      // z palca: rozróżnienie mówiłoby zgadującemu, jak blisko był.
      if (!rezerwacja) {
        return outcome<ManagementOutcome>({ ok: false, problem: 'link-nieznany' }, origin)
      }

      // „Teraz" bierze się z zegara tutaj, bo ten widok jest zdjęciem chwili,
      // w której klient patrzy. Samo anulowanie rozstrzyga później zegar bazy —
      // ten sam, którym mierzy się wygaśnięcie — więc przycisk pokazany
      // w ostatniej sekundzie okna bywa przyciskiem, który usłyszy „za późno".
      const view = managementView({
        status: rezerwacja.status,
        booking: rezerwacja.summary,
        cancellationWindowHours: rezerwacja.cancellationWindowHours,
        facility: rezerwacja.facilityContact,
        now: new Date(),
      })

      // Momenty jadą przez JSON tekstem. Widget przywraca je `readManagementView`
      // — odwrotnością tego, co robi się tutaj, i pokrytą tym samym testem.
      return outcome<ManagementOutcome>({ ok: true, view: writeManagementView(view) }, origin)
    },
  ),
)
