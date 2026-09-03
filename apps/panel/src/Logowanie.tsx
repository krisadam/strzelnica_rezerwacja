import { useCallback, useState } from 'react'
import { zaloguj } from './sesja.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'

/**
 * Formularz logowania — jedyny ekran Panelu widoczny bez konta. Poza nim nie ma
 * tu ani jednej danej Strzelnicy: kalendarz i lista powstają dopiero po
 * zalogowaniu, a odcina je RLS, nie ten warunek.
 *
 * Nie ma tu odzyskiwania hasła ani zakładania konta. Konta powstają razem ze
 * Strzelnicą (spec, historia 60), a `enable_signup = false` zamyka drogę przez
 * formularz — więc link „załóż konto" obiecywałby coś, czego nie ma.
 */
export function Logowanie({ client }: { client: PanelClient }) {
  const [email, setEmail] = useState('')
  const [haslo, setHaslo] = useState('')
  const [wysylanie, setWysylanie] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)

  const wyslij = useCallback(
    (zdarzenie: React.FormEvent) => {
      zdarzenie.preventDefault()
      if (!email.trim() || !haslo) {
        setBlad(teksty.logowanie.brakDanych)
        return
      }

      setWysylanie(true)
      setBlad(null)

      // Po udanym logowaniu nie robimy tu nic: sesję ogłasza `obserwujSesje`,
      // a ekran zmienia się od niej. Przepisanie stanu również tutaj dałoby
      // dwie drogi do tego samego widoku i jedną do rozjechania się.
      zaloguj(client, email.trim(), haslo)
        .then((wynik) => {
          if (!wynik.ok) setBlad(teksty.logowanie.odmowa)
        })
        .catch((powod: unknown) => {
          console.error(powod)
          setBlad(teksty.logowanie.odmowa)
        })
        .finally(() => setWysylanie(false))
    },
    [client, email, haslo],
  )

  return (
    <section className="logowanie">
      <h2>{teksty.logowanie.naglowek}</h2>
      <p className="komunikat">{teksty.logowanie.wstep}</p>

      <form onSubmit={wyslij}>
        <label className="pole">
          <span>{teksty.logowanie.email}</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(zdarzenie) => setEmail(zdarzenie.target.value)}
          />
        </label>

        <label className="pole">
          <span>{teksty.logowanie.haslo}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={haslo}
            onChange={(zdarzenie) => setHaslo(zdarzenie.target.value)}
          />
        </label>

        {blad && (
          <p className="komunikat komunikat--blad" role="alert">
            {blad}
          </p>
        )}

        <button type="submit" className="przycisk" disabled={wysylanie}>
          {wysylanie ? teksty.logowanie.logowanie : teksty.logowanie.zaloguj}
        </button>
      </form>
    </section>
  )
}
