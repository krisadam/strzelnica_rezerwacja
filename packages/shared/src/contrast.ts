/* Kontrast pary kolorów wg WCAG 2.1. Stoi w pakiecie współdzielonym razem
   z arkuszem tokenów, którego pilnuje, ale świadomie **poza** `index.ts`:
   Edge Function importuje punkt wejścia pakietu wprost ze źródeł, więc każdy
   eksport dołożony tam wchodzi do jej grafu modułów. Reguła o czytelności
   napisu nie ma czego szukać w funkcji zapisującej Rezerwację, a testy
   sięgają po ten plik po ścieżce. */

/** Próg WCAG 2.1 AA dla tekstu zwykłej wielkości. */
export const MIN_TEXT_CONTRAST = 4.5

/** Wartość, której nie da się przeczytać jako koloru — liczenie kontrastu z
 *  wartości zgadniętej dawałoby wynik wyglądający na sprawdzenie. */
export class InvalidColorError extends Error {
  constructor(value: string) {
    super(`Nie jest kolorem zapisanym szesnastkowo: ${value}`)
    this.name = 'InvalidColorError'
  }
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function channels(color: string): [number, number, number] {
  const zapis = color.trim()
  if (!HEX.test(zapis)) throw new InvalidColorError(color)

  const cyfry = zapis.slice(1)
  const pelny = cyfry.length === 3 ? [...cyfry].map((c) => c + c).join('') : cyfry

  return [0, 2, 4].map((i) => Number.parseInt(pelny.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
}

/** Luminancja względna wg WCAG 2.1: kanały zdejmowane z gammy sRGB i ważone
 *  czułością oka, w którym zieleń waży więcej niż czerwień, a ta niż błękit. */
function luminance(color: string): number {
  const [r, g, b] = channels(color).map((kanal) =>
    kanal <= 0.04045 ? kanal / 12.92 : ((kanal + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Stosunek kontrastu pary kolorów — od 1 (ten sam kolor) do 21 (czerń i biel).
 * Mierzy parę, nie kierunek: kolejność argumentów nie ma znaczenia.
 */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first)
  const b = luminance(second)
  const jasniejszy = Math.max(a, b)
  const ciemniejszy = Math.min(a, b)

  return (jasniejszy + 0.05) / (ciemniejszy + 0.05)
}
