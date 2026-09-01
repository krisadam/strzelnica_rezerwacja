import type { Block, CalendarDay, Intent, Lane } from '@strzelnica/shared'
import { addDays, bookingHorizon, formatDayLabel, formatTimeRange } from '@strzelnica/shared'
import { useMemo } from 'react'
import { Deklaracje } from './Deklaracje.js'
import type { Grafik, Zajetosc } from './grafik.js'
import { grafikDnia } from './grafik.js'
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
 *
 * Deklaracje też stoją tutaj, bo dostępność zależy od nich tak samo jak od dnia:
 * ten sam Blok bywa wolny dla Osoby rezerwującej z Pozwoleniem i niedostępny
 * dla tej bez niego, więc ich zmiana przelicza grafik od razu.
 */
export function Kalendarz({
  grafik,
  zajetosc,
  now,
  lane,
  day,
  intent,
  onLane,
  onDay,
  onIntent,
  onWybierz,
}: {
  grafik: Grafik
  zajetosc: Zajetosc
  now: Date
  lane: Lane
  day: CalendarDay
  intent: Intent
  onLane: (lane: Lane) => void
  onDay: (day: CalendarDay) => void
  onIntent: (intent: Intent) => void
  onWybierz: (block: Block) => void
}) {
  const { facility, lanes } = grafik

  const ostatniDzien = useMemo(
    () => bookingHorizon({ timeZone: facility.timeZone, timeRules: facility.timeRules, now }),
    [facility, now],
  )

  const dzien = useMemo(
    () => grafikDnia(grafik, zajetosc, intent, lane, day, now),
    [grafik, zajetosc, intent, lane, day, now],
  )

  return (
    <div className="kalendarz">
      <Deklaracje intent={intent} onIntent={onIntent} />
      <p className="reguly">{teksty.deklaracje.wplyw}</p>

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

      {!dzien.open && <p className="komunikat">{teksty.dzienZamkniety}</p>}
      {dzien.open && dzien.blocks.length === 0 && (
        <p className="komunikat">{teksty.osBezBlokow}</p>
      )}
      {dzien.open && dzien.blocks.length > 0 && (
        <ul className="bloki">
          {dzien.blocks.map((block) => (
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
