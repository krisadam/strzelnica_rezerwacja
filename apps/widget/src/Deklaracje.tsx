import type { Intent } from '@strzelnica/shared'
import { teksty } from './teksty.js'

/**
 * Deklaracje Osoby rezerwującej: Pozwolenie na broń i chęć Instruktora. Nie są
 * zwykłymi polami formularza — rozstrzygają, które terminy w ogóle są wolne,
 * więc stoją także przy kalendarzu i zmieniają go natychmiast.
 *
 * Instruktor zamówiony dobrowolnie ma sens wyłącznie przy Pozwoleniu: bez
 * niego jest wymagany i nie ma czego zamawiać. Odznaczenie Pozwolenia gasi
 * więc zamówienie, żeby Rezerwacja nie niosła deklaracji, o którą nikt nie był
 * pytany.
 */
export function Deklaracje({
  intent,
  onIntent,
}: {
  intent: Intent
  onIntent: (intent: Intent) => void
}) {
  return (
    <fieldset className="deklaracje">
      <legend>{teksty.deklaracje.legenda}</legend>

      <label className="pole pole--zgoda">
        <input
          type="checkbox"
          checked={intent.hasPermit}
          onChange={(zdarzenie) =>
            onIntent({
              ...intent,
              hasPermit: zdarzenie.target.checked,
              wantsInstructor: zdarzenie.target.checked ? intent.wantsInstructor : false,
            })
          }
        />
        <span>{teksty.deklaracje.pozwolenie}</span>
      </label>

      {intent.hasPermit ? (
        <label className="pole pole--zgoda">
          <input
            type="checkbox"
            checked={intent.wantsInstructor}
            onChange={(zdarzenie) =>
              onIntent({ ...intent, wantsInstructor: zdarzenie.target.checked })
            }
          />
          <span>{teksty.deklaracje.chceInstruktora}</span>
        </label>
      ) : (
        <p className="deklaracje__uwaga">{teksty.deklaracje.instruktorWymagany}</p>
      )}
    </fieldset>
  )
}
