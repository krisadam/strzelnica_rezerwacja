/**
 * Strona Widgetu w rozmowie ze skryptem osadzającym: wysokość dokumentu
 * w górę, żądanie przewinięcia na życzenie. Protokół komunikatów mieszka
 * w `@strzelnica/shared`, żeby obie strony rozmowy czytały tę samą definicję.
 *
 * Mierzymy `body`, nie `documentElement`: element `html` rozciąga się do
 * wysokości ramki, więc ramka dopasowana do jego wysokości nigdy by się nie
 * zmniejszyła. `body` ma wysokość swojej treści i tego szukamy.
 */
import { heightMessage, scrollToTopMessage } from '@strzelnica/shared'

export type Gospodarz = {
  /** Prośba o przewinięcie strony gospodarza do góry ramki. */
  zazadajPrzewiniecia: () => void
  rozlacz: () => void
}

/**
 * Zwraca połączenie albo `null`, gdy Widget nie jest osadzony — otwarty wprost
 * pod swoim adresem albo wstawiony w ramkę bez skryptu osadzającego. Adres
 * gospodarza jest wtedy nieznany, a komunikat bez adresata poszedłby na `'*'`.
 */
export function polaczZGospodarzem(): Gospodarz | null {
  if (window.parent === window) return null

  // Adres gospodarza wpisał w adres ramki ten, kto osadza — i to wystarcza,
  // bo `postMessage` sam sprawdza, czy adresat się zgadza. Wpisany fałszywie
  // nie przekierowuje komunikatów, tylko sprawia, że nie dochodzą nigdzie.
  // O tym, kto w ogóle może osadzić, rozstrzyga nagłówek `frame-ancestors`.
  const gospodarz = new URLSearchParams(window.location.search).get('gospodarz')
  if (!gospodarz) return null

  const wyslij = (komunikat: unknown) => window.parent.postMessage(komunikat, gospodarz)
  const zglosWysokosc = () =>
    wyslij(heightMessage(document.body.getBoundingClientRect().height))

  const obserwator = new ResizeObserver(zglosWysokosc)
  obserwator.observe(document.body)
  zglosWysokosc()

  return {
    zazadajPrzewiniecia: () => wyslij(scrollToTopMessage()),
    rozlacz: () => obserwator.disconnect(),
  }
}
