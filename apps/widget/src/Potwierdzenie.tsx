import type { AmmunitionKind, BookingDraft, WeaponType } from '@strzelnica/shared'
import { HOLD_MINUTES } from '@strzelnica/shared'
import type { Wybor } from './krok.js'
import { KwotaZapisana } from './Kwota.js'
import { opisInstruktora, opisWypozyczen, opisZapotrzebowania, teksty } from './teksty.js'
import { Wybrany } from './Wybrany.js'

/**
 * Ekran po zapisie. Rezerwacja istnieje i trzyma termin, ale czeka na
 * potwierdzenie adresu — i to jest tutaj najważniejsze zdanie, ważniejsze niż
 * numer Rezerwacji. E-mail z podsumowaniem — i link, którym Osoba rezerwująca
 * wróci do swojej Rezerwacji — wychodzi dopiero po potwierdzeniu adresu, więc
 * tutaj go nie ma i być nie może.
 */
export function Potwierdzenie({
  wybor,
  timeZone,
  weaponTypes,
  ammunitionKinds,
  draft,
  id,
  amount,
  onWroc,
}: {
  wybor: Wybor
  timeZone: string
  weaponTypes: readonly WeaponType[]
  ammunitionKinds: readonly AmmunitionKind[]
  draft: BookingDraft
  id: string
  /** Kwota zapisana przy Rezerwacji, w groszach; odesłana przez Edge Function. */
  amount: number
  onWroc: () => void
}) {
  return (
    <section className="krok krok--potwierdzenie">
      <h2>{teksty.potwierdzenie.naglowek}</h2>
      <p>{teksty.potwierdzenie.tresc(HOLD_MINUTES)}</p>

      <Wybrany wybor={wybor} timeZone={timeZone} />
      <dl className="wybrany">
        <dt>{teksty.formularz.liczbaUczestnikow}</dt>
        <dd>{teksty.podsumowanie.uczestnicy(draft.participants)}</dd>
        <dt>{teksty.instruktor.etykieta}</dt>
        <dd>{opisInstruktora(draft)}</dd>
        {/* Zamówiony sprzęt tylko wtedy, gdy jakiś jest: Osobie rezerwującej
            z własną bronią nie ma o czym przypominać. */}
        {draft.rentals.length > 0 && (
          <>
            <dt>{teksty.wypozyczenie.etykieta}</dt>
            <dd>{opisWypozyczen(draft.rentals, weaponTypes)}</dd>
          </>
        )}
        {/* Amunicja tak samo — a gdy jest, to właśnie tu Strzelnica zobaczy,
            co ma przygotować, i tu Osoba rezerwująca sprawdzi, że się zgadza. */}
        {draft.ammunition.length > 0 && (
          <>
            <dt>{teksty.amunicja.etykieta}</dt>
            <dd>{opisZapotrzebowania(draft.ammunition, ammunitionKinds)}</dd>
          </>
        )}
        <dt>{teksty.formularz.email}</dt>
        <dd>{draft.contact.email}</dd>
      </dl>

      <KwotaZapisana amount={amount} />

      <p className="numer">{teksty.potwierdzenie.numer(id)}</p>

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={onWroc}>
          {teksty.potwierdzenie.wrocDoKalendarza}
        </button>
      </div>
    </section>
  )
}
