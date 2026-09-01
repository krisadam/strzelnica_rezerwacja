import type { BookingProblem } from '@strzelnica/shared'
import { teksty } from './teksty.js'

/**
 * Lista zastrzeżeń do zgłoszenia. `role="alert"` czyta ją na głos w chwili
 * pojawienia się — Osoba rezerwująca, która właśnie nacisnęła „Dalej", patrzy
 * na przycisk, a nie na miejsce, w którym wyrósł komunikat.
 */
export function Zastrzezenia({ problems }: { problems: readonly BookingProblem[] }) {
  if (problems.length === 0) return null

  return (
    <ul className="zastrzezenia" role="alert">
      {problems.map((problem) => (
        <li key={problem}>{teksty.zastrzezenie[problem]}</li>
      ))}
    </ul>
  )
}
