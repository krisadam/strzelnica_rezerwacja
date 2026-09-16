import type { PanelBooking } from '@strzelnica/shared'
import { formatDayLabel, formatTimeRange } from '@strzelnica/shared'
import { useId } from 'react'
import { teksty } from './teksty.js'

/**
 * Rezerwacje, które po zmianie konfiguracji przestają się w niej mieścić:
 * stojące poza nowymi godzinami otwarcia albo trzymające sztuki, których
 * zmniejszona pula już nie obejmuje.
 *
 * Wskazanie, a nie przeszkoda — i jest to reguła wspólna całej konfiguracji:
 * zmiana wchodzi i tak, a Rezerwacja zostaje. Niesie własny termin, własne
 * sztuki i własną Kwotę, i o konfigurację nie pyta nikogo po tym, jak powstała.
 * Znika wyłącznie Odwołaniem, z powodem wysłanym klientowi, więc przycisk
 * prowadzi do jej szczegółów, a nie do żadnego „napraw".
 *
 * Jedna kopia dla obu ekranów, bo obie listy odpowiadają na to samo pytanie —
 * „co obsługa ma rozstrzygnąć, zanim naciśnie przycisk" — i wyglądać mają tak
 * samo. Różni je zdanie wstępne, bo dotyczą dwóch różnych zmian; każdy ekran
 * podaje więc własne, razem z nagłówkiem.
 */
export function Kolizje({
  naglowek,
  poziom,
  wstep,
  bookings,
  dopisek,
  onWybierz,
}: {
  naglowek: string
  /**
   * Poziom nagłówka listy. Podaje go ekran, bo tylko on wie, pod czym ta lista
   * stoi: w godzinach otwarcia pod nagłówkiem sekcji, a w katalogu — wewnątrz
   * pojedynczej pozycji, czyli o dwa stopnie niżej. Nagłówek wpisany tu na
   * sztywno przeskakiwałby poziom i czytnik ekranu zgubiłby, do czego lista
   * należy.
   */
  poziom?: 'h3' | 'h4' | 'h5'
  /** Czego dotyczy ta lista — zdanie ekranu, który ją pokazuje. */
  wstep: string
  bookings: readonly PanelBooking[]
  /** Co dopisać przy wierszu poza opisem Rezerwacji; puste znaczy nic. */
  dopisek?: (booking: PanelBooking) => string
  onWybierz: (booking: PanelBooking) => void
}) {
  const naglowekId = useId()
  const Naglowek = poziom ?? 'h3'

  if (bookings.length === 0) return null

  return (
    <section className="kolizje" aria-labelledby={naglowekId}>
      <Naglowek id={naglowekId}>{naglowek}</Naglowek>
      <p className="komunikat komunikat--blad" role="alert">
        {wstep}
      </p>
      <ul className="kolizje__lista">
        {bookings.map((wpis) => {
          const { day, startsAt, endsAt, timeZone, laneName, contact } = wpis.booking
          return (
            <li key={wpis.id}>
              <button type="button" className="tabela__link" onClick={() => onWybierz(wpis)}>
                {teksty.kolizje.pozycja(
                  formatDayLabel(day),
                  formatTimeRange(startsAt, endsAt, timeZone),
                  laneName,
                  contact.name,
                )}
                {dopisek && ` ${dopisek(wpis)}`}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="komunikat">{teksty.kolizje.okno}</p>
    </section>
  )
}
