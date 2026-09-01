import type { BookingDraft } from '@strzelnica/shared'
import { bookingProblems } from '@strzelnica/shared'
import { useState } from 'react'
import type { Wybor } from './krok.js'
import { teksty } from './teksty.js'
import { Wybrany } from './Wybrany.js'
import { Zastrzezenia } from './Zastrzezenia.js'

/**
 * Formularz Rezerwacji. Zastrzeżenia liczy `bookingProblems` — ta sama czysta
 * funkcja, którą pyta Edge Function przed zapisem. Formularz nie ma własnej
 * reguły „co jest poprawne": miałby wtedy szansę przepuścić coś, co serwer
 * odrzuci, albo zatrzymać coś, co serwer by przyjął.
 *
 * Zastrzeżenia pokazują się dopiero po pierwszej próbie przejścia dalej —
 * pole, którego jeszcze nikt nie tknął, nie jest wypełnione błędnie.
 */
export function Formularz({
  wybor,
  timeZone,
  draft,
  onDraft,
  onDalej,
  onZmienTermin,
}: {
  wybor: Wybor
  timeZone: string
  draft: BookingDraft
  onDraft: (draft: BookingDraft) => void
  onDalej: () => void
  onZmienTermin: () => void
}) {
  const [pokaz, setPokaz] = useState(false)
  const zastrzezenia = bookingProblems({ draft, lane: wybor.lane, block: wybor.block })

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

      {pokaz && <Zastrzezenia problems={zastrzezenia} />}

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
