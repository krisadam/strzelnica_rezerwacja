import type { BookingFilter, Lane, PanelBooking, PanelWindow } from '@strzelnica/shared'
import { filterBookings, formatAmount, formatDayLabel, formatTimeRange } from '@strzelnica/shared'
import { teksty } from './teksty.js'

/** Identyfikator listy wyboru Osi; wiąże ją z jej etykietą. */
const POLE_OSI = 'filtr-osi'

/**
 * Lista Rezerwacji z filtrami po dacie i Osi — do szukania konkretnego
 * zgłoszenia, nie do ogarniania dnia. Dlatego przepuszcza każdy stan: dzwoni
 * się właśnie w sprawie tej anulowanej, a kalendarz jej nie pokazuje, bo ona
 * niczego już na Osi nie zajmuje.
 *
 * Zawężanie robi `filterBookings` z `@strzelnica/shared`; tutaj zostają same
 * pola i tabela.
 */
export function Lista({
  bookings,
  lanes,
  okno,
  filtr,
  onFiltr,
  onWybierz,
}: {
  bookings: readonly PanelBooking[]
  lanes: readonly Lane[]
  /** Zakres dni, z którego Panel wczytał Rezerwacje — filtr nie wychodzi poza niego. */
  okno: PanelWindow
  filtr: BookingFilter
  onFiltr: (filtr: BookingFilter) => void
  onWybierz: (booking: PanelBooking) => void
}) {
  const znalezione = filterBookings(bookings, filtr)
  const czysty = !filtr.day && !filtr.laneId

  return (
    <section className="lista">
      <h2>{teksty.lista.naglowek}</h2>

      <div className="filtry">
        <label className="pole">
          <span>{teksty.lista.dzien}</span>
          <input
            type="date"
            value={filtr.day ?? ''}
            min={okno.from}
            max={okno.to}
            onChange={(zdarzenie) =>
              onFiltr({ ...filtr, day: zdarzenie.target.value || null })
            }
          />
        </label>

        {/* Etykieta wskazuje pole przez `for`, a nie obejmuje go sobą jak
            pozostałe: etykieta obejmująca listę wyboru bierze jej nazwę
            z całej swojej treści — razem z nazwami wszystkich Osi. */}
        <div className="pole">
          <label htmlFor={POLE_OSI}>{teksty.lista.os}</label>
          <select
            id={POLE_OSI}
            value={filtr.laneId ?? ''}
            onChange={(zdarzenie) =>
              onFiltr({ ...filtr, laneId: zdarzenie.target.value || null })
            }
          >
            <option value="">{teksty.lista.wszystkieOsie}</option>
            {lanes.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="przycisk"
          onClick={() => onFiltr({ day: null, laneId: null })}
          disabled={czysty}
        >
          {teksty.lista.wyczysc}
        </button>
      </div>

      {/* Ile ich jest — bo filtr, który niczego nie znalazł, i filtr, który
          znalazł jedno, wyglądają na ekranie podobnie. */}
      <p className="lista__ile" aria-live="polite">
        {teksty.lista.ile(znalezione.length)}
      </p>

      {znalezione.length === 0 ? (
        <p className="komunikat">{teksty.lista.pusta}</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th scope="col">{teksty.lista.kolumny.termin}</th>
              <th scope="col">{teksty.lista.kolumny.os}</th>
              <th scope="col">{teksty.lista.kolumny.klient}</th>
              <th scope="col">{teksty.lista.kolumny.uczestnicy}</th>
              <th scope="col">{teksty.lista.kolumny.stan}</th>
              <th scope="col">{teksty.lista.kolumny.kwota}</th>
            </tr>
          </thead>
          <tbody>
            {znalezione.map((wpis) => {
              const { booking } = wpis
              return (
                <tr key={wpis.id}>
                  <td>
                    <button
                      type="button"
                      className="tabela__link"
                      onClick={() => onWybierz(wpis)}
                    >
                      {formatDayLabel(booking.day)},{' '}
                      {formatTimeRange(booking.startsAt, booking.endsAt, booking.timeZone)}
                    </button>
                  </td>
                  <td>{booking.laneName}</td>
                  <td>{booking.contact.name}</td>
                  <td>{teksty.uczestnicy(booking.participants)}</td>
                  <td>{teksty.stan[wpis.status]}</td>
                  <td>{formatAmount(booking.amount)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
