import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio, MIN_TEXT_CONTRAST } from './contrast.ts'

// Ten test nie sprawdza, czy arkusz tokenów dociera do aplikacji — to mierzy
// test przeglądarkowy `tokeny-wizualne.spec.ts` i tamto ryzyko zostaje tam.
// Tutaj przedmiotem są same wartości: kontrast wariantu ciemnego, który ma być
// policzony, a nie oceniony okiem, i komplet ciemnych odpowiedników. Wartość
// koloru jest czymś, co da się orzec bez przeglądarki, więc orzeka się to tu.

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

const JASNY = blok(':root')
const CIEMNY = blok(":root[data-motyw='ciemny']")

/** Kolory objęte wymogiem 4,5:1 — tekst i stany. Nie ma tu obwódki: nie niesie
 *  ani tekstu, ani stanu. W wariancie obwódkowym akcent kładzie się na obwódkę
 *  i napis, więc czyta się go jak tekst. */
const NA_WIERZCHU = ['--tekst', '--przygaszony', '--akcent', '--wolny', '--blad', '--wylaczony']
const TLA = ['--tlo', '--tlo-drugie']

function token(paleta: Map<string, string>, nazwa: string): string {
  const wartosc = paleta.get(nazwa)
  if (wartosc === undefined) throw new Error(`Paleta nie ma tokenu ${nazwa}`)

  return wartosc
}

/** Ciemna nadpisuje jasną, więc jej pary czyta się z niej samej; wymóg jest
 *  jednak ten sam dla obu — jasna paleta jest dziś tym, co widać na ekranie. */
const PALETY = [
  { nazwa: 'jasna', paleta: JASNY },
  { nazwa: 'ciemna', paleta: CIEMNY },
]

describe.each(PALETY)('paleta $nazwa', ({ paleta }) => {
  it.each(NA_WIERZCHU)('%s czyta się na obu tłach', (nazwa) => {
    for (const tlo of TLA) {
      const wspolczynnik = contrastRatio(token(paleta, nazwa), token(paleta, tlo))

      expect(wspolczynnik).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
    }
  })
})

describe('obie palety w jednym arkuszu', () => {
  it('ma ciemny odpowiednik każdego koloru palety jasnej', () => {
    // Kolor bez odpowiednika zostałby po przełączeniu jasny na granacie —
    // i byłaby to awaria widoczna dopiero na ekranie, bo CSS jej nie zgłosi.
    const kolory = [...JASNY.keys()].filter((nazwa) => token(JASNY, nazwa).startsWith('#'))

    expect([...CIEMNY.keys()].sort()).toEqual(kolory.sort())
  })

  it('nie rusza wartości jasnych — obie aplikacje wyglądają jak przed zmianą', () => {
    // Świadkiem jest kolor rzeczy wyjętych ze sprzedaży, ten sam, na którym
    // stoi test przeglądarkowy: żadna aplikacja nie ustawia przełącznika, więc
    // to te wartości nadal widzi Osoba rezerwująca i Użytkownik panelu.
    expect(token(JASNY, '--wylaczony')).toBe('#6b4ea8')
    expect(token(JASNY, '--tlo')).toBe('#ffffff')
    expect(token(JASNY, '--tekst')).toBe('#16181d')
  })
})

describe('tokeny poza paletą', () => {
  it('niosą promienie i skalę nagłówków, których projekt dotąd nie miał', () => {
    for (const nazwa of ['--promien-drobny', '--promien', '--naglowek-1', '--naglowek-2', '--naglowek-3']) {
      expect(token(JASNY, nazwa)).toMatch(/^[\d.]+rem$/)
    }
  })

  it('stoją poza przełącznikiem, bo motyw ich nie dotyczy', () => {
    expect(CIEMNY.has('--promien')).toBe(false)
    expect(CIEMNY.has('--naglowek-1')).toBe(false)
  })
})
