import type { AmmunitionDemand, AmmunitionKind } from '@strzelnica/shared'
import { teksty } from './teksty.js'

/**
 * Zamówienie amunicji: Rodzaj i liczba sztuk. Wyglądem siostrzane wobec
 * `Wypozyczenia`, zachowaniem — celowo uboższe. Nie ma tu górnej granicy pola
 * ani zdania „pozostało N sztuk", bo Rodzaj amunicji nie ma puli (ADR 0004):
 * system nie prowadzi stanu magazynowego i nigdy nie odmówi z powodu braku
 * amunicji. Ograniczenie wpisane tutaj byłoby zmyślone.
 *
 * Za to jest zdanie, którego przy broni nie ma: co to zamówienie znaczy.
 * Wypożyczenie odkłada sztukę na bok, a Zapotrzebowanie jest zapowiedzią dla
 * Strzelnicy — Osoba rezerwująca ma poznać tę różnicę tutaj, a nie na miejscu.
 *
 * Zero sztuk zdejmuje pozycję z Rezerwacji, zamiast zapisywać ją na zero:
 * własna amunicja i amunicja dokupiona na miejscu wyglądają w systemie tak
 * samo — jako brak zamówienia.
 */
export function Amunicja({
  kinds,
  ammunition,
  onAmmunition,
}: {
  kinds: readonly AmmunitionKind[]
  ammunition: readonly AmmunitionDemand[]
  onAmmunition: (ammunition: AmmunitionDemand[]) => void
}) {
  const zamowione = (ammunitionKindId: string) =>
    ammunition.find((pozycja) => pozycja.ammunitionKindId === ammunitionKindId)?.quantity ?? 0

  const zmien = (ammunitionKindId: string, quantity: number) => {
    const bez = ammunition.filter((pozycja) => pozycja.ammunitionKindId !== ammunitionKindId)
    onAmmunition(quantity > 0 ? [...bez, { ammunitionKindId, quantity }] : bez)
  }

  return (
    <fieldset className="amunicja">
      <legend>{teksty.amunicja.legenda}</legend>

      {kinds.length === 0 ? (
        <p className="amunicja__uwaga">{teksty.amunicja.brakKatalogu}</p>
      ) : (
        <>
          {kinds.map((kind) => (
            <label key={kind.id} className="pole">
              <span>{kind.name}</span>
              <input
                type="number"
                min={0}
                value={zamowione(kind.id)}
                // Puste pole daje `NaN`; traktujemy je jak zero, bo znaczy „nie zamawiam".
                onChange={(zdarzenie) => zmien(kind.id, zdarzenie.target.valueAsNumber || 0)}
              />
            </label>
          ))}
          <p className="amunicja__uwaga">{teksty.amunicja.wyjasnienie}</p>
        </>
      )}
    </fieldset>
  )
}
