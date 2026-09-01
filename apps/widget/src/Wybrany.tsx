import { formatDayLabel, formatTimeRange } from '@strzelnica/shared'
import type { Wybor } from './krok.js'
import { teksty } from './teksty.js'

/**
 * Wybrany termin, powtarzany na każdym kroku — od formularza po potwierdzenie.
 * Osoba rezerwująca, która wypełnia dane albo czyta podsumowanie, ma widzieć,
 * czego one dotyczą, bez cofania się do kalendarza.
 */
export function Wybrany({ wybor, timeZone }: { wybor: Wybor; timeZone: string }) {
  return (
    <dl className="wybrany">
      <dt>{teksty.formularz.termin}</dt>
      <dd>
        {formatDayLabel(wybor.day)},{' '}
        {formatTimeRange(wybor.block.startsAt, wybor.block.endsAt, timeZone)}
      </dd>
      <dt>{teksty.formularz.os}</dt>
      <dd>{wybor.lane.name}</dd>
    </dl>
  )
}
