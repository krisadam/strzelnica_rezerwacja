import type {
  CalendarDay,
  Lane,
  LaneClosure,
  LaneEntry,
  PanelBooking,
  PanelWindow,
} from '@strzelnica/shared'
import {
  addDays,
  dayAgenda,
  dayIn,
  formatDayLabel,
  formatMoment,
  formatTimeRange,
} from '@strzelnica/shared'
import { teksty } from './teksty.js'

/**
 * Kalendarz dnia z podziałem na Osie — dzień Strzelnicy ogarniany jednym
 * spojrzeniem. Osie stoją obok siebie, bo Oś jest wyłączna: to, co widać
 * w jednej kolumnie, nie dzieje się w żadnej innej.
 *
 * Układa go `dayAgenda` z `@strzelnica/shared`, razem z regułą, co na tym
 * ekranie w ogóle się liczy. Tutaj zostaje rysowanie.
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
    <button type="button" className="wpis" onClick={() => onWybierz(booking)}>
      <span className="wpis__czas">{formatTimeRange(startsAt, endsAt, timeZone)}</span>
      <span className="wpis__klient">{contact.name}</span>
      <span className="wpis__bok">
        {teksty.uczestnicy(participants)} · {teksty.stan[booking.status]}
      </span>
    </button>
  )
}

/**
 * Blokada w kolumnie Osi. Nie jest przyciskiem, bo nie ma ekranu, na który
 * miałaby prowadzić: cała jej treść stoi tutaj — kiedy i dlaczego. Odróżnia ją
 * od Rezerwacji znacznik i obwódka, a nie sam brak nazwiska; „bez klienta"
 * wyglądałoby na daną, której nie doczytaliśmy.
 *
 * Blokada wychodząca poza pokazany dzień pisze się pełnymi chwilami, a nie
 * zakresem godzin: „18:00–12:00" przy Blokadzie trzydniowej kłamałoby o jej
 * długości, i to w stronę, w którą kłamać nie wolno — obsługa sprzedałaby
 * termin, którego nie ma.
 */
function WpisBlokady({
  closure,
  beyondDay,
  timeZone,
}: {
  closure: LaneClosure
  beyondDay: boolean
  timeZone: string
}) {
  return (
    <div className="wpis wpis--blokada">
      <span className="wpis__czas">
        {beyondDay
          ? `${formatMoment(closure.startsAt, timeZone)} – ${formatMoment(closure.endsAt, timeZone)}`
          : formatTimeRange(closure.startsAt, closure.endsAt, timeZone)}
      </span>
      <span className="wpis__klient">{teksty.kalendarz.blokada}</span>
      <span className="wpis__bok">{closure.reason}</span>
    </div>
  )
}

/** Jeden wiersz kolumny Osi — Rezerwacja albo Blokada. */
function Pozycja({
  entry,
  timeZone,
  onWybierz,
}: {
  entry: LaneEntry
  timeZone: string
  onWybierz: (booking: PanelBooking) => void
}) {
  return (
    <li>
      {entry.kind === 'rezerwacja' ? (
        <Wpis booking={entry.booking} onWybierz={onWybierz} />
      ) : (
        <WpisBlokady
          closure={entry.closure}
          beyondDay={entry.beyondDay}
          timeZone={timeZone}
        />
      )}
    </li>
  )
}

export function Kalendarz({
  day,
  lanes,
  bookings,
  closures,
  okno,
  timeZone,
  onDzien,
  onWybierz,
}: {
  day: CalendarDay
  lanes: readonly Lane[]
  bookings: readonly PanelBooking[]
  /** Blokady Strzelnicy — w kolumnie Osi stoją obok Rezerwacji, bo zajmują ją tak samo. */
  closures: readonly LaneClosure[]
  /** Zakres dni, z którego Panel wczytał Rezerwacje — poza nim nie ma czego pokazać. */
  okno: PanelWindow
  /** Strefa Strzelnicy — jej zegar, nie zegar przeglądarki obsługi. */
  timeZone: string
  onDzien: (day: CalendarDay) => void
  onWybierz: (booking: PanelBooking) => void
}) {
  const grafik = dayAgenda({ lanes, bookings, closures, day, timeZone })

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
            // odpowiedź „Oś wolna" od ekranu, który o niego nie pytał.
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
        {grafik.map(({ lane, entries }) => (
          // Nazwą kolumny jest jej nagłówek, powiedziane wprost: kalendarz
          // czyta się kolumnami, a kolumna bez nazwy jest dla czytającego
          // ekranem jednym ciągiem Rezerwacji bez podziału na Osie.
          <section key={lane.id} className="os" aria-labelledby={`os-${lane.id}`}>
            <h3 id={`os-${lane.id}`}>{lane.name}</h3>
            {entries.length === 0 ? (
              <p className="komunikat">{teksty.kalendarz.pustaOs}</p>
            ) : (
              <ul className="os__wpisy">
                {entries.map((wpis) => (
                  <Pozycja
                    key={wpis.id}
                    entry={wpis}
                    timeZone={timeZone}
                    onWybierz={onWybierz}
                  />
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
