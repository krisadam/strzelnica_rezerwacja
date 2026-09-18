/**
 * Napis rozłożony na dużą liczbę i to, co ją otacza: `before` zapowiada,
 * `figure` jest liczbą do wybicia, `after` niesie jednostkę razem z odstępem,
 * który ją poprzedza.
 *
 * Odstęp należy do jednostki, a nie do liczby, bo to jednostka się nim od
 * liczby odsuwa — i bo złożone z powrotem trzy pola mają dać napis wyjściowy
 * co do znaku. Kwota po polsku ma przed walutą odstęp nierozdzielający i on
 * też ma zostać tym, czym był.
 */
export type Figure = { before: string; figure: string; after: string }

/**
 * Ostatnia liczba napisu razem z tym, co stoi przed nią i po niej — albo
 * `null`, gdy napis liczby nie ma.
 *
 * Ostatnia, a nie pierwsza: sumę pisze się po tym, czego dotyczy („Glock 17 —
 * 4 szt."), a nazwa z katalogu bywa liczbą sama w sobie — kaliber amunicji
 * jest liczbą i nie jest sumą.
 *
 * Liczba trzyma w sobie odstępy grupujące i przecinek dziesiętny, bo tak pisze
 * ją `Intl` po polsku; kończy się zawsze cyfrą, więc kropka zdania ani skrót
 * jednostki do niej nie wchodzą.
 */
export function splitFigure(text: string): Figure | null {
  const liczby = [...text.matchAll(/\d(?:[\d\u00a0 .,]*\d)?/g)]
  const ostatnia = liczby.at(-1)
  if (ostatnia?.index === undefined) return null

  return {
    before: text.slice(0, ostatnia.index),
    figure: ostatnia[0],
    after: text.slice(ostatnia.index + ostatnia[0].length),
  }
}
