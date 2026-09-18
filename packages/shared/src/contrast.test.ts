import { describe, expect, it } from 'vitest'
import { contrastRatio, InvalidColorError } from './contrast.ts'

// Kontrast jest tu regułą jak każda inna reguła modułu: da się go policzyć
// z dwóch wartości i nie trzeba do tego przeglądarki. Wzór — luminancja
// względna i stosunek (L1 + 0,05) / (L2 + 0,05) — pochodzi z WCAG 2.1.

describe('współczynnik kontrastu', () => {
  it('daje 21 dla czerni na bieli — tyle, ile wynosi maksimum skali', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('daje 1 dla koloru wobec samego siebie', () => {
    expect(contrastRatio('#0e1726', '#0e1726')).toBeCloseTo(1, 5)
  })

  it('nie zależy od kolejności argumentów — mierzy parę, nie kierunek', () => {
    expect(contrastRatio('#e08a3c', '#0e1726')).toBeCloseTo(
      contrastRatio('#0e1726', '#e08a3c'),
      10,
    )
  })

  it('czyta zapis skrócony tak samo jak pełny', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5)
  })

  it('nie zgaduje przy wartości, której nie rozumie', () => {
    // Zgadnięta wartość dałaby wynik wyglądający na sprawdzenie, a niebędący
    // nim — a to jedyne, do czego ta funkcja służy.
    expect(() => contrastRatio('rgb(0 0 0)', '#ffffff')).toThrow(InvalidColorError)
    expect(() => contrastRatio('#12345', '#ffffff')).toThrow(InvalidColorError)
  })
})
