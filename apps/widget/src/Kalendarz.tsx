import type { Block } from '@strzelnica/shared'
import { addDays, dayIn, formatDayLabel, formatTimeRange, scheduleForDay } from '@strzelnica/shared'
import { useMemo, useState } from 'react'
import type { Grafik } from './grafik.js'
import { teksty } from './teksty.js'

function Blok({ block, timeZone }: { block: Block; timeZone: string }) {
  const stan = block.available
    ? teksty.wolny
    : `${teksty.niedostepny} — ${teksty.powod[block.unavailableBecause ?? 'przeszlosc']}`

  return (
    <li className={block.available ? 'blok blok--wolny' : 'blok blok--niedostepny'}>
      <span className="blok__czas">
        {formatTimeRange(block.startsAt, block.endsAt, timeZone)}
      </span>
      <span className="blok__stan">{stan}</span>
    </li>
  )
}

/**
 * Kalendarz wolnych Bloków. Komponent nie zna żadnej reguły dostępności —
 * pyta o nią `scheduleForDay` i rysuje odpowiedź, łącznie z tym, czy dzień
 * jest w ogóle otwarty. „Teraz" przychodzi z zewnątrz, żeby ta sama zasada
 * obowiązywała także tutaj.
 */
export function Kalendarz({ grafik, now }: { grafik: Grafik; now: Date }) {
  const { facility, lanes } = grafik
  const [laneId, setLaneId] = useState(lanes[0]?.id ?? '')
  const [day, setDay] = useState(() => dayIn(facility.timezone, now))

  const grafikDnia = useMemo(
    () =>
      scheduleForDay({
        day,
        timeZone: facility.timezone,
        laneId,
        schedules: grafik.schedules,
        openingHours: grafik.openingHours,
        closedDates: grafik.closedDates,
        now,
      }),
    [day, laneId, grafik, facility.timezone, now],
  )

  if (lanes.length === 0) return <p className="komunikat">{teksty.brakOsi}</p>

  return (
    <div className="kalendarz">
      <fieldset className="osie">
        <legend>{teksty.wybierzOs}</legend>
        {lanes.map((lane) => (
          <label key={lane.id} className="osie__pozycja">
            <input
              type="radio"
              name="os"
              value={lane.id}
              checked={lane.id === laneId}
              onChange={() => setLaneId(lane.id)}
            />
            {lane.name} <span className="osie__pojemnosc">{teksty.pojemnosc(lane.capacity)}</span>
          </label>
        ))}
      </fieldset>

      <div className="dzien">
        <button type="button" onClick={() => setDay(addDays(day, -1))}>
          {teksty.poprzedniDzien}
        </button>
        <h2>{formatDayLabel(day)}</h2>
        <button type="button" onClick={() => setDay(addDays(day, 1))}>
          {teksty.nastepnyDzien}
        </button>
      </div>

      {!grafikDnia.open && <p className="komunikat">{teksty.dzienZamkniety}</p>}
      {grafikDnia.open && grafikDnia.blocks.length === 0 && (
        <p className="komunikat">{teksty.osBezBlokow}</p>
      )}
      {grafikDnia.open && grafikDnia.blocks.length > 0 && (
        <ul className="bloki">
          {grafikDnia.blocks.map((block) => (
            <Blok key={block.scheduleId} block={block} timeZone={facility.timezone} />
          ))}
        </ul>
      )}
    </div>
  )
}
