import type { WeaponAvailability, WeaponRental } from '@strzelnica/shared'
import { teksty } from './teksty.js'

/**
 * Wybór Typów broni i liczby sztuk. Ile sztuk zostało, liczy `remainingWeapons`
 * z `@strzelnica/shared` — ta sama funkcja, która orzeka o dostępności Bloku
 * i którą pyta serwer. Komponent nie ma własnej reguły „ile wolno": miałby
 * wtedy szansę pozwolić zamówić coś, czego Strzelnica nie wyda.
 *
 * Typ wyczerpany w tym terminie nie dostaje pola do wpisania liczby, tylko
 * wyjaśnienie. Pole ograniczone do zera i tak zbierałoby próby, a Osoba
 * rezerwująca nie dowiedziałaby się, dlaczego nic nie da się wpisać.
 *
 * Wyjątkiem jest Typ wyczerpany, który już siedzi w zamówieniu — tak kończy
 * zmiana terminu po jego zamówieniu. Pole zostaje, żeby dało się pozycję zdjąć:
 * bez niego zastrzeżenie „zamów mniej sztuk" wskazywałoby na kontrolkę, której
 * nie ma.
 *
 * Osoba rezerwująca może nie zamówić nic i przyjechać z własną bronią — dlatego
 * żadna pozycja nie jest wymagana, a zero sztuk zdejmuje ją z Rezerwacji
 * zamiast zapisywać pozycję na zero.
 */
export function Wypozyczenia({
  dostepne,
  rentals,
  onRentals,
}: {
  dostepne: readonly WeaponAvailability[]
  rentals: readonly WeaponRental[]
  onRentals: (rentals: WeaponRental[]) => void
}) {
  const zamowione = (weaponTypeId: string) =>
    rentals.find((pozycja) => pozycja.weaponTypeId === weaponTypeId)?.quantity ?? 0

  const zmien = (weaponTypeId: string, quantity: number) => {
    const bez = rentals.filter((pozycja) => pozycja.weaponTypeId !== weaponTypeId)
    // Puste pole daje `NaN`; traktujemy je jak zero, bo znaczy „nie biorę".
    onRentals(quantity > 0 ? [...bez, { weaponTypeId, quantity }] : bez)
  }

  return (
    <fieldset className="wypozyczenie">
      <legend>{teksty.wypozyczenie.legenda}</legend>

      {dostepne.length === 0 ? (
        <p className="wypozyczenie__uwaga">{teksty.wypozyczenie.brakKatalogu}</p>
      ) : (
        <>
          {dostepne.map(({ type, remaining }) =>
            remaining === 0 && zamowione(type.id) === 0 ? (
              <p key={type.id} className="wypozyczenie__wyczerpany">
                {type.name} — {teksty.wypozyczenie.wyczerpany}
              </p>
            ) : (
              <label key={type.id} className="pole">
                <span>{type.name}</span>
                <input
                  type="number"
                  min={0}
                  max={remaining}
                  value={zamowione(type.id)}
                  onChange={(zdarzenie) => zmien(type.id, zdarzenie.target.valueAsNumber || 0)}
                />
                <small>
                  {remaining === 0
                    ? teksty.wypozyczenie.wyczerpanyZamowiony
                    : teksty.wypozyczenie.pozostalo(remaining)}
                </small>
              </label>
            ),
          )}
          <p className="wypozyczenie__uwaga">{teksty.wypozyczenie.wyjasnienie}</p>
        </>
      )}
    </fieldset>
  )
}
