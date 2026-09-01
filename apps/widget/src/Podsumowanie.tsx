import type {
  AmmunitionKind,
  AmountBreakdown,
  BookingDraft,
  BookingProblem,
  WeaponType,
} from '@strzelnica/shared'
import { Kwota } from './Kwota.js'
import type { Wybor } from './krok.js'
import { opisInstruktora, opisWypozyczen, opisZapotrzebowania, teksty } from './teksty.js'
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
  kwota,
  weaponTypes,
  ammunitionKinds,
  draft,
  wysylanie,
  zastrzezenie,
  blad,
  onPopraw,
  onWyslij,
}: {
  wybor: Wybor
  timeZone: string
  /** Ta sama Kwota, co w formularzu, i z tego samego wyliczenia. */
  kwota: AmountBreakdown
  weaponTypes: readonly WeaponType[]
  ammunitionKinds: readonly AmmunitionKind[]
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
        <dt>{teksty.amunicja.etykieta}</dt>
        <dd>{opisZapotrzebowania(draft.ammunition, ammunitionKinds)}</dd>
        <dt>{teksty.formularz.imie}</dt>
        <dd>{draft.contact.name}</dd>
        <dt>{teksty.formularz.email}</dt>
        <dd>{draft.contact.email}</dd>
        <dt>{teksty.formularz.telefon}</dt>
        <dd>{draft.contact.phone}</dd>
      </dl>

      {/* Kwota jeszcze raz, przy przycisku, którym Osoba rezerwująca zajmuje
          termin — to ostatnia chwila, w której wolno jej zmienić zdanie. */}
      <Kwota amount={kwota} />

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
