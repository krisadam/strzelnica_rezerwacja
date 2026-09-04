import type { CalendarDay, Lane, PanelBooking, PanelWindow } from '@strzelnica/shared'
import {
  addDays,
  dayAgenda,
  dayIn,
  formatDayLabel,
  formatTimeRange,
} from '@strzelnica/shared'
import { teksty } from './teksty.js'

/**
 * Kalendarz dnia z podziałem na Osie — dzień Strzelnicy ogarniany jednym
 * spojrzeniem. Osie stoją obok siebie, bo Oś jest wyłączna: to, co widać
 * w jednej kolumnie, nie dzieje się w żadnej innej.
 *
 * Układa go `dayAgenda` z `@strzelnica/shared`, razem z regułą, które
 * Rezerwacje na tym ekranie w ogóle się liczą. Tutaj zostaje rysowanie.
 */
function Wpis({
  booking,
  onWybierz,
}: {
  booking: PanelBooking
  onWybierz: (booking: PanelBooking) => void
}) {
  const { startsAt, endsAt, timeZone, participants, contact } = booking.booking

  return (
    <li>
      <button type="button" className="wpis" onClick={() => onWybierz(booking)}>
        <span className="wpis__czas">{formatTimeRange(startsAt, endsAt, timeZone)}</span>
        <span className="wpis__klient">{contact.name}</span>
        <span className="wpis__bok">
          {teksty.uczestnicy(participants)} · {teksty.stan[booking.status]}
        </span>
      </button>
    </li>
  )
}

export function Kalendarz({
  day,
  lanes,
  bookings,
  okno,
  timeZone,
  onDzien,
  onWybierz,
}: {
  day: CalendarDay
  lanes: readonly Lane[]
  bookings: readonly PanelBooking[]
  /** Zakres dni, z którego Panel wczytał Rezerwacje — poza nim nie ma czego pokazać. */
  okno: PanelWindow
  /** Strefa Strzelnicy — jej zegar, nie zegar przeglądarki obsługi. */
  timeZone: string
  onDzien: (day: CalendarDay) => void
  onWybierz: (booking: PanelBooking) => void
}) {
  const grafik = dayAgenda({ lanes, bookings, day })

  return (
    <section className="kalendarz">
      <h2>{teksty.kalendarz.naglowek}</h2>

      <div className="dzien">
        <button
          type="button"
          className="przycisk"
          onClick={() => onDzien(addDays(day, -1))}
        >
          {teksty.kalendarz.poprzedniDzien}
        </button>
        <strong className="dzien__etykieta">{formatDayLabel(day)}</strong>
        <button type="button" className="przycisk" onClick={() => onDzien(addDays(day, 1))}>
          {teksty.kalendarz.nastepnyDzien}
        </button>
      </div>

      {/* Data wpisywana wprost, nie tylko krok po kroku: obsługa pyta o sobotę
          za trzy tygodnie równie często, co o jutro, a dwadzieścia kliknięć
          w „Następny dzień" nie jest odpowiedzią na to pytanie. Pusta wartość
          nie znaczy tu nic — kalendarz zawsze stoi na jakimś dniu — więc
          wyczyszczone pole wraca na dzień dzisiejszy Strzelnicy. */}
      <div className="dzien dzien--wybor">
        <label className="pole">
          <span>{teksty.kalendarz.dzien}</span>
          <input
            type="date"
            value={day}
            // Granice okna odczytu, nie ozdoba: dzień spoza niego dostałby
            // odpowiedź „Brak Rezerwacji" od ekranu, który o niego nie pytał.
            min={okno.from}
            max={okno.to}
            onChange={(zdarzenie) =>
              onDzien(zdarzenie.target.value || dayIn(timeZone, new Date()))
            }
          />
        </label>
        <button
          type="button"
          className="przycisk"
          onClick={() => onDzien(dayIn(timeZone, new Date()))}
        >
          {teksty.kalendarz.dzisiaj}
        </button>
      </div>

      <div className="osie">
        {grafik.map(({ lane, bookings: dnia }) => (
          // Nazwą kolumny jest jej nagłówek, powiedziane wprost: kalendarz
          // czyta się kolumnami, a kolumna bez nazwy jest dla czytającego
          // ekranem jednym ciągiem Rezerwacji bez podziału na Osie.
          <section key={lane.id} className="os" aria-labelledby={`os-${lane.id}`}>
            <h3 id={`os-${lane.id}`}>{lane.name}</h3>
            {dnia.length === 0 ? (
              <p className="komunikat">{teksty.kalendarz.pustaOs}</p>
            ) : (
              <ul className="os__wpisy">
                {dnia.map((wpis) => (
                  <Wpis key={wpis.id} booking={wpis} onWybierz={onWybierz} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {/* Strefa wypisana wprost: obsługa patrzy na zegar Strzelnicy, a Panel
          bywa otwarty gdzie indziej niż ona. */}
      <p className="kalendarz__strefa">{timeZone}</p>
    </section>
  )
}
