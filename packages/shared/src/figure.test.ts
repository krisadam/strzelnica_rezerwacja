import { describe, expect, it } from 'vitest'
import { formatAmount } from './pricing.ts'
import { splitFigure } from './figure.ts'

// Chwyt „duża liczba, drobna jednostka" rysują dwie aplikacje, a napis, który
// nim podają, składa się gdzie indziej — Kwotę pisze `formatAmount`, sumy
// Zestawienia słownik Panelu. Dzielenie napisu stoi więc tutaj, jedną kopią:
// druga reguła szukania liczby rozjechałaby się z pierwszą przy pierwszym
// formacie, który którakolwiek z nich zmieni.

describe('podział napisu na dużą liczbę', () => {
  it('oddziela walutę od Kwoty razem z odstępem, który ją poprzedza', () => {
    const podzial = splitFigure(formatAmount(12_000))

    expect(podzial).toEqual({ before: '', figure: '120,00', after: '\u00a0zł' })
  })

  it('trzyma w liczbie odstępy grupujące tysiące', () => {
    // Kwota czterocyfrowa ma w środku odstęp nierozdzielający — liczbą jest
    // ona cała, a nie „1" z resztą odsuniętą do jednostki.
    expect(splitFigure(formatAmount(123_456_789))).toEqual({
      before: '',
      figure: '1\u00a0234\u00a0567,89',
      after: '\u00a0zł',
    })
  })

  it('zostawia przed liczbą to, co ją zapowiada', () => {
    expect(splitFigure('Glock 17 — 4 szt.')).toEqual({
      before: 'Glock 17 — ',
      figure: '4',
      after: ' szt.',
    })
  })

  it('bierze liczbę ostatnią, a nie pierwszą napotkaną', () => {
    // Nazwy z katalogu bywają liczbami same w sobie — kaliber amunicji jest
    // liczbą, a sumą pozostaje to, co stoi na końcu.
    expect(splitFigure('.22 Long Rifle — 50 szt.')).toEqual({
      before: '.22 Long Rifle — ',
      figure: '50',
      after: ' szt.',
    })
  })

  it('radzi sobie z liczbą bez jednostki na końcu napisu', () => {
    expect(splitFigure('Rezerwacji z Instruktorem: 3')).toEqual({
      before: 'Rezerwacji z Instruktorem: ',
      figure: '3',
      after: '',
    })
  })

  it('nie zna liczby w napisie, który jej nie ma', () => {
    // Bez liczby nie ma czego wybijać — wołający pisze wtedy napis, jaki
    // dostał, zamiast rysować pusty chwyt.
    expect(splitFigure('Tego dnia nikt nie wypożycza broni.')).toBeNull()
  })

  it.each([
    formatAmount(0),
    formatAmount(50),
    'Glock 17 — 4 szt.',
    'Rezerwacji z Instruktorem: 3',
  ])('składa się z powrotem w napis, który dostał: %s', (napis) => {
    // Chwyt zmienia wielkość liter, a nie ich treść: czytnik ekranu i testy
    // Kwoty mają po podziale usłyszeć dokładnie to samo, co przed nim.
    const podzial = splitFigure(napis)

    expect(podzial).not.toBeNull()
    expect(`${podzial?.before}${podzial?.figure}${podzial?.after}`).toBe(napis)
  })
})
