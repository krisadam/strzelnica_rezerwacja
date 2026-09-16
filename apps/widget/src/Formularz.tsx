import type {
  AmmunitionKind,
  AmountBreakdown,
  BookingDraft,
  FacilityDocuments,
  WeaponOccupancy,
  WeaponType,
} from '@strzelnica/shared'
import { bookingProblems, concernsTheTerm, remainingWeapons } from '@strzelnica/shared'
import { useMemo, useState } from 'react'
import { Amunicja } from './Amunicja.js'
import { Deklaracje } from './Deklaracje.js'
import { Kwota } from './Kwota.js'
import type { Wybor } from './krok.js'
import { opisInstruktora, teksty } from './teksty.js'
import { Wybrany } from './Wybrany.js'
import { Wypozyczenia } from './Wypozyczenia.js'
import { Zastrzezenia } from './Zastrzezenia.js'

/**
 * Regulamin i polityka prywatności **tej** Strzelnicy, postawione przy zgodzie.
 * Nie nasze i nie ogólne: klient godzi się na warunki obiektu, na którym
 * stanie na Osi, więc zgoda bez jego dokumentów byłaby zgodą na nic.
 *
 * Regulamin zwinięty, a nie rozwinięty: wypełniany formularz jest tym, po co
 * Osoba rezerwująca przyszła, a kilka akapitów regulaminu odepchnęłoby
 * przycisk poza ekran. Zwinięty jest **obecny** — to jest różnica między
 * dokumentem do przeczytania a dokumentem, o którym się mówi, że istnieje.
 *
 * Dokumentu niepodanego nie ma tu wcale, zamiast pustego „Regulamin" do
 * kliknięcia: Strzelnica, która go nie wpisała, żadnego nie ma, a my nie mamy
 * czym go zastąpić.
 */
function Dokumenty({ documents }: { documents: FacilityDocuments }) {
  if (!documents.terms && !documents.privacyUrl) return null

  return (
    <div className="dokumenty">
      {documents.terms && (
        <details className="dokumenty__regulamin">
          <summary>{teksty.formularz.regulamin}</summary>
          {/* `white-space: pre-line` w stylach: regulamin jest tekstem
              wpisanym ręką, więc jego akapity są tam, gdzie ktoś je zrobił. */}
          <p>{documents.terms}</p>
        </details>
      )}
      {documents.privacyUrl && (
        <p className="dokumenty__polityka">
          {/* Nowa karta, bo Widget bywa ramką na cudzej stronie: odejście
              z niej skasowałoby wypełniony formularz. */}
          <a href={documents.privacyUrl} target="_blank" rel="noreferrer noopener">
            {teksty.formularz.polityka}
          </a>
        </p>
      )}
    </div>
  )
}

/**
 * Formularz Rezerwacji. Zastrzeżenia liczy `bookingProblems` — ta sama czysta
 * funkcja, którą pyta Edge Function przed zapisem. Formularz nie ma własnej
 * reguły „co jest poprawne": miałby wtedy szansę przepuścić coś, co serwer
 * odrzuci, albo zatrzymać coś, co serwer by przyjął.
 *
 * Zastrzeżenia do pól pokazują się dopiero po pierwszej próbie przejścia dalej
 * — pole, którego jeszcze nikt nie tknął, nie jest wypełnione błędnie.
 * Zastrzeżenie do samego terminu jest widoczne od razu: nie mówi o niczym, co
 * Osoba rezerwująca dopiero wypełni, a mówi o czymś, co właśnie zmieniła
 * deklaracją albo co zajął ktoś inny.
 */
export function Formularz({
  wybor,
  timeZone,
  kwota,
  documents,
  weaponTypes,
  weaponOccupancies,
  ammunitionKinds,
  draft,
  onDraft,
  onDalej,
  onZmienTermin,
}: {
  wybor: Wybor
  timeZone: string
  /** Kwota dla tego, co stoi w zgłoszeniu; przeliczana przy każdej zmianie. */
  kwota: AmountBreakdown
  /** Regulamin i polityka prywatności tej Strzelnicy — to, na co idzie zgoda. */
  documents: FacilityDocuments
  weaponTypes: readonly WeaponType[]
  weaponOccupancies: readonly WeaponOccupancy[]
  ammunitionKinds: readonly AmmunitionKind[]
  draft: BookingDraft
  onDraft: (draft: BookingDraft) => void
  onDalej: () => void
  onZmienTermin: () => void
}) {
  const [pokaz, setPokaz] = useState(false)
  // Ile sztuk zostało, jest własnością terminu — więc przelicza się razem
  // z wybranym Blokiem, a nie raz przy wejściu do formularza.
  const dostepne = useMemo(
    () =>
      remainingWeapons({
        weaponTypes,
        weaponOccupancies,
        startsAt: wybor.block.startsAt,
        endsAt: wybor.block.endsAt,
      }),
    [weaponTypes, weaponOccupancies, wybor.block.startsAt, wybor.block.endsAt],
  )
  const zastrzezenia = bookingProblems({
    draft,
    lane: wybor.lane,
    block: wybor.block,
    ammunitionKinds,
  })
  const widoczne = pokaz ? zastrzezenia : zastrzezenia.filter(concernsTheTerm)

  const zmien = (czesc: Partial<BookingDraft>) => onDraft({ ...draft, ...czesc })
  const kontakt = (czesc: Partial<BookingDraft['contact']>) =>
    zmien({ contact: { ...draft.contact, ...czesc } })

  return (
    <form
      className="krok"
      noValidate
      onSubmit={(zdarzenie) => {
        zdarzenie.preventDefault()
        setPokaz(true)
        if (zastrzezenia.length === 0) onDalej()
      }}
    >
      <h2>{teksty.formularz.naglowek}</h2>
      <Wybrany wybor={wybor} timeZone={timeZone} />

      <Deklaracje intent={draft} onIntent={(intent) => zmien(intent)} />
      <dl className="wybrany">
        <dt>{teksty.instruktor.etykieta}</dt>
        <dd>{opisInstruktora(draft)}</dd>
      </dl>

      <label className="pole">
        <span>{teksty.formularz.liczbaUczestnikow}</span>
        <input
          type="number"
          min={1}
          max={wybor.lane.capacity}
          value={draft.participants}
          onChange={(zdarzenie) => zmien({ participants: zdarzenie.target.valueAsNumber })}
        />
        <small>{teksty.formularz.limitUczestnikow(wybor.lane.capacity)}</small>
      </label>

      <Wypozyczenia
        dostepne={dostepne}
        rentals={draft.rentals}
        onRentals={(rentals) => zmien({ rentals })}
      />

      <Amunicja
        kinds={ammunitionKinds}
        ammunition={draft.ammunition}
        onAmmunition={(ammunition) => zmien({ ammunition })}
      />

      <label className="pole">
        <span>{teksty.formularz.imie}</span>
        <input
          type="text"
          autoComplete="name"
          value={draft.contact.name}
          onChange={(zdarzenie) => kontakt({ name: zdarzenie.target.value })}
        />
      </label>

      <label className="pole">
        <span>{teksty.formularz.email}</span>
        <input
          type="email"
          autoComplete="email"
          value={draft.contact.email}
          onChange={(zdarzenie) => kontakt({ email: zdarzenie.target.value })}
        />
      </label>

      <label className="pole">
        <span>{teksty.formularz.telefon}</span>
        <input
          type="tel"
          autoComplete="tel"
          value={draft.contact.phone}
          onChange={(zdarzenie) => kontakt({ phone: zdarzenie.target.value })}
        />
      </label>

      <label className="pole pole--zgoda">
        <input
          type="checkbox"
          checked={draft.consent}
          onChange={(zdarzenie) => zmien({ consent: zdarzenie.target.checked })}
        />
        <span>{teksty.formularz.zgoda}</span>
      </label>

      <Dokumenty documents={documents} />

      <Kwota amount={kwota} />

      <Zastrzezenia problems={widoczne} />

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={onZmienTermin}>
          {teksty.formularz.zmienTermin}
        </button>
        <button type="submit" className="przycisk przycisk--glowny">
          {teksty.formularz.dalej}
        </button>
      </div>
    </form>
  )
}
