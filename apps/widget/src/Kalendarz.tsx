import type { Block } from '@strzelnica/shared'
import {
  addDays,
  bookingHorizon,
  dayIn,
  formatDayLabel,
  formatTimeRange,
  scheduleForDay,
} from '@strzelnica/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
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
 * jest w ogóle otwarty. Koniec nawigacji bierze z `bookingHorizon`, więc ostatni
 * dzień, do którego wolno dojść, jest ostatnim, w którym wolno rezerwować.
 * „Teraz" przychodzi z zewnątrz, żeby ta sama zasada obowiązywała także tutaj.
 */
export function Kalendarz({
  grafik,
  now,
  onZmianaWidoku,
}: {
  grafik: Grafik
  now: Date
  /**
   * Widok zmieniony kliknięciem. Osadzony Widget prosi wtedy stronę gospodarza
   * o przewinięcie do góry ramki, żeby nowa treść nie pojawiła się poza
   * ekranem. Tą samą drogą pójdą kolejne kroki formularza.
   */
  onZmianaWidoku: () => void
}) {
  const { facility, lanes } = grafik
  const [laneId, setLaneId] = useState(lanes[0]?.id ?? '')
  const [day, setDay] = useState(() => dayIn(facility.timeZone, now))

  // Widok to wybrana Oś i wybrany dzień; zgłaszamy jego zmianę w jednym
  // miejscu, a nie w każdym przycisku z osobna — kolejny sposób na zmianę
  // widoku nie może wtedy zapomnieć o zgłoszeniu. Pierwsze wejście zmianą
  // nie jest.
  const pierwszyWidok = useRef(true)
  useEffect(() => {
    if (pierwszyWidok.current) {
      pierwszyWidok.current = false
      return
    }
    onZmianaWidoku()
  }, [day, laneId, onZmianaWidoku])

  const ostatniDzien = useMemo(
    () => bookingHorizon({ timeZone: facility.timeZone, timeRules: facility.timeRules, now }),
    [facility, now],
  )

  const grafikDnia = useMemo(
    () =>
      scheduleForDay({
        day,
        timeZone: facility.timeZone,
        laneId,
        schedules: grafik.schedules,
        openingHours: grafik.openingHours,
        closedDates: grafik.closedDates,
        timeRules: facility.timeRules,
        now,
      }),
    [day, laneId, grafik, facility, now],
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
        <button
          type="button"
          disabled={day >= ostatniDzien}
          onClick={() => setDay(addDays(day, 1))}
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
            <Blok key={block.scheduleId} block={block} timeZone={facility.timeZone} />
          ))}
        </ul>
      )}
    </div>
  )
}
