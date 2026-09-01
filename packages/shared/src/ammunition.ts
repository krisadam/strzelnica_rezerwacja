/**
 * Zapotrzebowanie na amunicję: co Osoba rezerwująca zamawia i z czego wybiera.
 *
 * Osobny plik od `availability.ts` nie z ciasnoty, tylko z decyzji. Tamten
 * trzyma wszystko, co rozstrzyga o dostępności terminu — Typy broni trafiły
 * tam, bo ich pule odbierają Bloki. Amunicja nie odbiera nic i nigdy nie
 * będzie (ADR 0004): system nie prowadzi jej stanu magazynowego, bo schodzi
 * głównie ze sprzedaży na miejscu, więc każdy stan byłby trwale nieprawdziwy.
 *
 * Rozdział jest tu regułą wyrażoną w typach: dostępność nie dostaje amunicji
 * na wejściu, więc nie ma jak się na nią powołać — nawet przez pomyłkę.
 */

/**
 * Pozycja katalogu Strzelnicy (np. „9 × 19 mm Parabellum"). Bez puli —
 * inaczej niż `WeaponType` — ale z ceną, tak samo jak on.
 */
export type AmmunitionKind = {
  id: string
  name: string
  /** Cena jednej sztuki w groszach; jedyne, do czego katalog służy poza nazwą. */
  unitPrice: number
}

/**
 * Zamówienie sztuk jednego Rodzaju: pozycja Rezerwacji. Zapowiedź dla
 * Strzelnicy, nie rezerwacja towaru — nikt nie odkłada tych sztuk na bok,
 * a Osoba rezerwująca ma o tym usłyszeć wprost w formularzu.
 */
export type AmmunitionDemand = {
  ammunitionKindId: string
  quantity: number
}
