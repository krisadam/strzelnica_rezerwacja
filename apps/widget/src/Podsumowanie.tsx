import type { BookingDraft, BookingProblem, WeaponType } from '@strzelnica/shared'
import type { Wybor } from './krok.js'
import { opisInstruktora, opisWypozyczen, teksty } from './teksty.js'
import { Wybrany } from './Wybrany.js'
import { Zastrzezenia } from './Zastrzezenia.js'

/**
 * Podsumowanie przed wysłaniem: wszystko, co pójdzie do Strzelnicy, na jednym
 * ekranie. Krok istnieje po to, żeby Osoba rezerwująca wyłapała własną pomyłkę
 * — literówkę w adresie, nie tę liczbę osób — zanim termin zostanie zajęty.
 */
export function Podsumowanie({
  wybor,
  timeZone,
  weaponTypes,
  draft,
  wysylanie,
  zastrzezenie,
  blad,
  onPopraw,
  onWyslij,
}: {
  wybor: Wybor
  timeZone: string
  weaponTypes: readonly WeaponType[]
  draft: BookingDraft
  wysylanie: boolean
  /** Zastrzeżenie zgłoszone przez serwer, gdy formularz go nie przewidział. */
  zastrzezenie: BookingProblem | null
  blad: string | null
  onPopraw: () => void
  onWyslij: () => void
}) {
  return (
    <section className="krok">
      <h2>{teksty.podsumowanie.naglowek}</h2>
      <Wybrany wybor={wybor} timeZone={timeZone} />

      <dl className="wybrany">
        <dt>{teksty.formularz.liczbaUczestnikow}</dt>
        <dd>{teksty.podsumowanie.uczestnicy(draft.participants)}</dd>
        <dt>{teksty.pozwolenie.etykieta}</dt>
        <dd>{draft.hasPermit ? teksty.pozwolenie.mam : teksty.pozwolenie.nieMam}</dd>
        <dt>{teksty.instruktor.etykieta}</dt>
        <dd>{opisInstruktora(draft)}</dd>
        <dt>{teksty.wypozyczenie.etykieta}</dt>
        <dd>{opisWypozyczen(draft.rentals, weaponTypes)}</dd>
        <dt>{teksty.formularz.imie}</dt>
        <dd>{draft.contact.name}</dd>
        <dt>{teksty.formularz.email}</dt>
        <dd>{draft.contact.email}</dd>
        <dt>{teksty.formularz.telefon}</dt>
        <dd>{draft.contact.phone}</dd>
      </dl>

      {zastrzezenie && <Zastrzezenia problems={[zastrzezenie]} />}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {blad}
        </p>
      )}

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={onPopraw} disabled={wysylanie}>
          {teksty.podsumowanie.poprawDane}
        </button>
        <button
          type="button"
          className="przycisk przycisk--glowny"
          onClick={onWyslij}
          disabled={wysylanie}
        >
          {wysylanie ? teksty.podsumowanie.wysylanie : teksty.podsumowanie.rezerwuje}
        </button>
      </div>
    </section>
  )
}
