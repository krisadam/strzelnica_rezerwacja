import type { Block, CalendarDay, Lane, Occupancy } from '@strzelnica/shared'
import {
  addDays,
  bookingHorizon,
  formatDayLabel,
  formatTimeRange,
  scheduleForDay,
} from '@strzelnica/shared'
import { useMemo } from 'react'
import type { Grafik } from './grafik.js'
import { teksty } from './teksty.js'

function Blok({
  block,
  timeZone,
  onWybierz,
}: {
  block: Block
  timeZone: string
  onWybierz: (block: Block) => void
}) {
  const czas = formatTimeRange(block.startsAt, block.endsAt, timeZone)

  // Wolny Blok jest przyciskiem, niedostępny — samym opisem. Przycisk, który
  // wygląda na wyłączony, i tak zbiera kliknięcia; brak przycisku nie zbiera.
  return (
    <li className={block.available ? 'blok blok--wolny' : 'blok blok--niedostepny'}>
      {block.available ? (
        <button type="button" className="blok__wybor" onClick={() => onWybierz(block)}>
          <span className="blok__czas">{czas}</span>
          <span className="blok__stan">{teksty.wolny}</span>
        </button>
      ) : (
        <>
          <span className="blok__czas">{czas}</span>
          <span className="blok__stan">
            {teksty.niedostepny} — {teksty.powod[block.unavailableBecause ?? 'przeszlosc']}
          </span>
        </>
      )}
    </li>
  )
}

/**
 * Kalendarz wolnych Bloków. Komponent nie zna żadnej reguły dostępności —
 * pyta o nią `scheduleForDay` i rysuje odpowiedź, łącznie z tym, czy dzień
 * jest w ogóle otwarty. Koniec nawigacji bierze z `bookingHorizon`, więc ostatni
 * dzień, do którego wolno dojść, jest ostatnim, w którym wolno rezerwować.
 * „Teraz" przychodzi z zewnątrz, żeby ta sama zasada obowiązywała także tutaj.
 *
 * Wybrana Oś i dzień mieszkają wyżej: Osoba rezerwująca, która wróci z formularza
 * po zajętym terminie, ma zastać kalendarz tam, gdzie go zostawiła.
 */
export function Kalendarz({
  grafik,
  occupancies,
  now,
  lane,
  day,
  onLane,
  onDay,
  onWybierz,
}: {
  grafik: Grafik
  occupancies: readonly Occupancy[]
  now: Date
  lane: Lane
  day: CalendarDay
  onLane: (lane: Lane) => void
  onDay: (day: CalendarDay) => void
  onWybierz: (block: Block) => void
}) {
  const { facility, lanes } = grafik

  const ostatniDzien = useMemo(
    () => bookingHorizon({ timeZone: facility.timeZone, timeRules: facility.timeRules, now }),
    [facility, now],
  )

  const grafikDnia = useMemo(
    () =>
      scheduleForDay({
        day,
        timeZone: facility.timeZone,
        laneId: lane.id,
        schedules: grafik.schedules,
        openingHours: grafik.openingHours,
        closedDates: grafik.closedDates,
        occupancies,
        timeRules: facility.timeRules,
        now,
      }),
    [day, lane, grafik, occupancies, facility, now],
  )

  return (
    <div className="kalendarz">
      <fieldset className="osie">
        <legend>{teksty.wybierzOs}</legend>
        {lanes.map((pozycja) => (
          <label key={pozycja.id} className="osie__pozycja">
            <input
              type="radio"
              name="os"
              value={pozycja.id}
              checked={pozycja.id === lane.id}
              onChange={() => onLane(pozycja)}
            />
            {pozycja.name}{' '}
            <span className="osie__pojemnosc">{teksty.pojemnosc(pozycja.capacity)}</span>
          </label>
        ))}
      </fieldset>

      <div className="dzien">
        <button type="button" onClick={() => onDay(addDays(day, -1))}>
          {teksty.poprzedniDzien}
        </button>
        <h2>{formatDayLabel(day)}</h2>
        <button
          type="button"
          disabled={day >= ostatniDzien}
          onClick={() => onDay(addDays(day, 1))}
        >
          {teksty.nastepnyDzien}
        </button>
      </div>

      <p className="reguly">{teksty.zasiegKalendarza(formatDayLabel(ostatniDzien))}</p>

      {!grafikDnia.open && <p className="komunikat">{teksty.dzienZamkniety}</p>}
      {grafikDnia.open && grafikDnia.blocks.length === 0 && (
        <p className="komunikat">{teksty.osBezBlokow}</p>
      )}
      {grafikDnia.open && grafikDnia.blocks.length > 0 && (
        <ul className="bloki">
          {grafikDnia.blocks.map((block) => (
            <Blok
              key={block.scheduleId}
              block={block}
              timeZone={facility.timeZone}
              onWybierz={onWybierz}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
