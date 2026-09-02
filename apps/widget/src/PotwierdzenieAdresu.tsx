import type { ConfirmationOutcome, SupabaseConfig } from '@strzelnica/shared'
import { useEffect, useState } from 'react'
import { potwierdzRezerwacje } from './potwierdzanie.js'
import { teksty } from './teksty.js'

/**
 * Ekran linku z e-maila. Widget staje tu samodzielnie — bez kalendarza, bez
 * grafiku, bez zgłoszenia — bo Osoba rezerwująca przychodzi wprost ze skrzynki
 * i niczego z poprzedniej sesji nie ma przy sobie.
 *
 * Potwierdzenie wychodzi od razu przy wejściu, a nie po kliknięciu przycisku:
 * kliknięciem było wejście w link. Ekran z drugim przyciskiem „potwierdź"
 * kazałby potwierdzać dwa razy to samo.
 */
export function PotwierdzenieAdresu({
  config,
  token,
  onDoKalendarza,
}: {
  config: SupabaseConfig
  token: string
  /** Powrót do kalendarza tej samej Strzelnicy, już bez tokenu w adresie. */
  onDoKalendarza: () => void
}) {
  const [stan, setStan] = useState<
    { faza: 'wczytywanie' } | { faza: 'gotowe'; wynik: ConfirmationOutcome } | { faza: 'blad' }
  >({ faza: 'wczytywanie' })

  useEffect(() => {
    let aktualne = true
    potwierdzRezerwacje(config, token)
      .then((wynik) => {
        if (aktualne) setStan({ faza: 'gotowe', wynik })
      })
      .catch((powod: unknown) => {
        console.error(powod)
        if (aktualne) setStan({ faza: 'blad' })
      })
    return () => {
      aktualne = false
    }
  }, [config, token])

  if (stan.faza === 'wczytywanie') {
    return <p className="komunikat">{teksty.potwierdzenieAdresu.wczytywanie}</p>
  }

  // Błąd sieci albo serwera to nie odmowa: nie wiemy, czy Rezerwacja jest
  // potwierdzona, więc nie wolno powiedzieć ani „jest", ani „nie ma jej".
  // Ponowne wejście w ten sam link odpowie na to pytanie — link działa do
  // skutku, dopóki Rezerwacja czeka.
  if (stan.faza === 'blad') {
    return (
      <p className="komunikat komunikat--blad" role="alert">
        {teksty.potwierdzenieAdresu.blad}
      </p>
    )
  }

  if (stan.wynik.ok) {
    return (
      <section className="krok krok--potwierdzenie">
        <h2>{teksty.potwierdzenieAdresu.naglowek}</h2>
        <p>
          {stan.wynik.alreadyConfirmed
            ? teksty.potwierdzenieAdresu.juzPotwierdzona
            : teksty.potwierdzenieAdresu.tresc}
        </p>
      </section>
    )
  }

  // Odmowa zostawia Osobę rezerwującą bez terminu, więc zostawia jej też drogę
  // dalej: wygasła Rezerwacja naprawia się wyłącznie nową.
  return (
    <section className="krok krok--potwierdzenie">
      <h2>{teksty.potwierdzenieAdresu.odmowa}</h2>
      <p className="komunikat komunikat--blad" role="alert">
        {teksty.potwierdzenieAdresu.powod[stan.wynik.problem]}
      </p>
      <div className="przyciski">
        <button type="button" className="przycisk" onClick={onDoKalendarza}>
          {teksty.potwierdzenieAdresu.doKalendarza}
        </button>
      </div>
    </section>
  )
}
