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

/** Poziomy nagłówków, dla których skala ma wartość — tyle, ile ma Panel. */
const POZIOMY = [1, 2, 3, 4, 5]

describe('tokeny niezależne od skóry', () => {
  it('niosą promienie i skalę nagłówków, których projekt dotąd nie miał', () => {
    const skala = POZIOMY.map((poziom) => `--naglowek-${poziom}`)

    for (const nazwa of ['--promien-drobny', '--promien', ...skala]) {
      expect(token(nazwa)).toMatch(/^[\d.]+rem$/)
    }
  })

  /** Wielkość nagłówka danego poziomu w rem — do porównania z sąsiednim. */
  function wielkosc(poziom: number): number {
    return Number.parseFloat(token(`--naglowek-${poziom}`))
  }

  it('rozstawia poziomy nagłówków na tyle, żeby różnicę było widać', () => {
    // Skala ściśnięta czyta się jak jeden blok tekstu: poziomy wprawdzie są,
    // ale żaden nie mówi okiem, że jest wyżej od następnego. Próg bierze się
    // z najmniejszego kroku, jaki w typografii uchodzi za widoczny — mniej
    // więcej jedna szósta. Pytamy o stosunek, a nie o same wartości: skala ma
    // zostać rozciągnięta także po tym, jak ktoś przesunie ją w całości.
    for (const poziom of POZIOMY.slice(0, -1)) {
      expect(wielkosc(poziom) / wielkosc(poziom + 1)).toBeGreaterThanOrEqual(1.15)
    }
  })

  it('daje nagłówkom grubości, którymi porządek niesie się bez koloru', () => {
    // Jeden krój systemowy i jedna paleta zostawiają hierarchii dwa nośniki:
    // wielkość i grubość. Grubość stoi w tokenach razem ze skalą, bo jest
    // drugą połową tej samej decyzji — i tak samo jak skala ma być jedna dla
    // obu aplikacji.
    const wagi = POZIOMY.map((poziom) => Number(token(`--waga-naglowka-${poziom}`)))

    // Porządek niesie ta, która się gdzieś zmienia: pięć jednakowych wartości
    // przeszłoby każde pytanie o kolejność, a nie rozdzielałoby niczego.
    expect(new Set(wagi).size).toBeGreaterThan(1)

    // Poziom niżej nie może być grubszy od wyższego: tak rysuje `h4`
    // przeglądarka i to jest ta pomyłka, której skala ma nie oddawać.
    for (const [i, waga] of wagi.slice(1).entries()) {
      expect(waga).toBeLessThanOrEqual(Number(wagi[i]))
    }
    for (const waga of wagi) expect(waga).toBeGreaterThanOrEqual(400)
  })
})
