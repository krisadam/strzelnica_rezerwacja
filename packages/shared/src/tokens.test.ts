import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio, MIN_TEXT_CONTRAST } from './contrast.ts'

// Ten test nie sprawdza, czy arkusz tokenów dociera do aplikacji — to mierzy
// test przeglądarkowy `tokeny-wizualne.spec.ts` i tamto ryzyko zostaje tam.
// Tutaj przedmiotem są same wartości: kontrast palety, który ma być policzony,
// a nie oceniony okiem. Wartość koloru jest czymś, co da się orzec bez
// przeglądarki, więc orzeka się to tu.

const ARKUSZ = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

/** Deklaracje jednego bloku, po nagłówku selektora do najbliższej klamry. */
function blok(selektor: string): Map<string, string> {
  const od = ARKUSZ.indexOf(`${selektor} {`)
  if (od === -1) throw new Error(`Arkusz nie ma bloku ${selektor}`)
  const tresc = ARKUSZ.slice(od, ARKUSZ.indexOf('}', od))

  const deklaracje = new Map<string, string>()
  for (const dopasowanie of tresc.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
    const [, nazwa, wartosc] = dopasowanie
    if (nazwa !== undefined && wartosc !== undefined) deklaracje.set(nazwa, wartosc.trim())
  }

  return deklaracje
}

const PALETA = blok(':root')

/** Kolory objęte wymogiem 4,5:1 — tekst i stany. Nie ma tu obwódki: nie niesie
 *  ani tekstu, ani stanu. W wariancie obwódkowym akcent kładzie się na obwódkę
 *  i napis, więc czyta się go jak tekst. */
const NA_WIERZCHU = ['--tekst', '--przygaszony', '--akcent', '--wolny', '--blad', '--wylaczony']
const TLA = ['--tlo', '--tlo-drugie']

function token(nazwa: string): string {
  const wartosc = PALETA.get(nazwa)
  if (wartosc === undefined) throw new Error(`Paleta nie ma tokenu ${nazwa}`)

  return wartosc
}

describe('paleta modułu', () => {
  it.each(NA_WIERZCHU)('%s czyta się na obu tłach', (nazwa) => {
    for (const tlo of TLA) {
      const wspolczynnik = contrastRatio(token(nazwa), token(tlo))

      expect(wspolczynnik).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
    }
  })

  it('jest jedyną paletą w arkuszu', () => {
    // Dwie palety naraz znaczą stan, w którym Panel i Widget mogą się rozjechać
    // — jedna aplikacja przełączona, druga nie. Ciemna została jedyną, więc nie
    // ma czego przełączać i nie ma jak zapomnieć o przełączeniu.
    //
    // Liczymy bloki, a nie szukamy nazwy zdjętego atrybutu: druga paleta wraca
    // pod dowolnym selektorem — atrybutem o innej nazwie, zapytaniem o
    // preferencję systemu — a nazwa wyłapałaby wyłącznie powrót tej jednej.
    const bloki = [...ARKUSZ.matchAll(/^:root[^{]*\{/gm)]

    expect(bloki.map(([naglowek]) => naglowek)).toEqual([':root {'])
  })

  it('trzyma wartości, na które celuje test przeglądarkowy', () => {
    // Świadkiem jest kolor rzeczy wyjętych ze sprzedaży, ten sam, na którym
    // stoi test przeglądarkowy. Obie kopie tych wartości mają się zgadzać:
    // rozjazd między nimi znaczy test, który mierzy nie to, co myśli, że
    // mierzy.
    expect(token('--wylaczony')).toBe('#a98be0')
    expect(token('--tlo')).toBe('#0e1726')
    expect(token('--tekst')).toBe('#f2eadf')
  })
})

describe('tokeny niezależne od skóry', () => {
  it('niosą promienie i skalę nagłówków, których projekt dotąd nie miał', () => {
    for (const nazwa of ['--promien-drobny', '--promien', '--naglowek-1', '--naglowek-2', '--naglowek-3']) {
      expect(token(nazwa)).toMatch(/^[\d.]+rem$/)
    }
  })
})
