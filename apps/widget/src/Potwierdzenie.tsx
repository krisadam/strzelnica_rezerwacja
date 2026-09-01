import type { BookingDraft } from '@strzelnica/shared'
import type { Wybor } from './krok.js'
import { opisInstruktora, teksty } from './teksty.js'
import { Wybrany } from './Wybrany.js'

/**
 * Potwierdzenie po zapisie. Numer Rezerwacji jest jedynym, co Osoba
 * rezerwująca dostaje na ręce w tej fazie — e-mail z podsumowaniem dochodzi
 * wraz z powiadomieniami (ticket #11), a link do własnej Rezerwacji wraz
 * z zarządzaniem nią (ticket #12).
 */
export function Potwierdzenie({
  wybor,
  timeZone,
  draft,
  id,
  onWroc,
}: {
  wybor: Wybor
  timeZone: string
  draft: BookingDraft
  id: string
  onWroc: () => void
}) {
  return (
    <section className="krok krok--potwierdzenie">
      <h2>{teksty.potwierdzenie.naglowek}</h2>
      <p>{teksty.potwierdzenie.tresc}</p>

      <Wybrany wybor={wybor} timeZone={timeZone} />
      <dl className="wybrany">
        <dt>{teksty.formularz.liczbaUczestnikow}</dt>
        <dd>{teksty.podsumowanie.uczestnicy(draft.participants)}</dd>
        <dt>{teksty.instruktor.etykieta}</dt>
        <dd>{opisInstruktora(draft)}</dd>
        <dt>{teksty.formularz.email}</dt>
        <dd>{draft.contact.email}</dd>
      </dl>

      <p className="numer">{teksty.potwierdzenie.numer(id)}</p>

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={onWroc}>
          {teksty.potwierdzenie.wrocDoKalendarza}
        </button>
      </div>
    </section>
  )
}
