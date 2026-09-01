import { describe, expect, it } from 'vitest'
import {
  frameAncestors,
  heightMessage,
  InvalidOriginError,
  normalizeOrigin,
  readWidgetMessage,
  scrollToTopMessage,
  widgetFrameUrl,
} from './index.js'

describe('adres ramki Widgetu', () => {
  it('bierze katalog ze skryptu osadzającego i dokłada Strzelnicę', () => {
    expect(
      widgetFrameUrl({
        loaderSrc: 'https://widget.example.pl/embed.js',
        facilitySlug: 'strzelnica-demo',
        hostOrigin: 'https://klient.example.pl',
      }),
    ).toBe(
      'https://widget.example.pl/?strzelnica=strzelnica-demo&gospodarz=https%3A%2F%2Fklient.example.pl',
    )
  })

  it('zachowuje podkatalog, z którego serwowany jest skrypt', () => {
    expect(
      widgetFrameUrl({
        loaderSrc: 'https://example.pl/statyczne/embed.js',
        facilitySlug: 'demo',
        hostOrigin: 'https://klient.example.pl',
      }),
    ).toContain('https://example.pl/statyczne/?strzelnica=demo')
  })

  it('nie buduje adresu bez wskazania Strzelnicy', () => {
    expect(() =>
      widgetFrameUrl({
        loaderSrc: 'https://widget.example.pl/embed.js',
        facilitySlug: '  ',
        hostOrigin: 'https://klient.example.pl',
      }),
    ).toThrow(/Strzelnic/)
  })
})

describe('komunikaty Widgetu do strony gospodarza', () => {
  it('czyta wysokość dokumentu', () => {
    expect(readWidgetMessage(heightMessage(512))).toEqual({ kind: 'height', height: 512 })
  })

  it('zaokrągla wysokość w górę, żeby ramka nie ucinała ostatniego piksela', () => {
    expect(readWidgetMessage(heightMessage(511.2))).toEqual({ kind: 'height', height: 512 })
  })

  it('czyta żądanie przewinięcia do góry ramki', () => {
    expect(readWidgetMessage(scrollToTopMessage())).toEqual({ kind: 'scrollToTop' })
  })

  it('pomija komunikaty cudzych skryptów na stronie gospodarza', () => {
    expect(readWidgetMessage(null)).toBeNull()
    expect(readWidgetMessage('webpackHotUpdate')).toBeNull()
    expect(readWidgetMessage({ kind: 'height', height: 512 })).toBeNull()
    expect(readWidgetMessage({ source: 'inny-widget', kind: 'height', height: 512 })).toBeNull()
  })

  it('pomija własny komunikat o nieznanym rodzaju', () => {
    expect(readWidgetMessage({ source: 'strzelnica-widget', kind: 'cokolwiek' })).toBeNull()
  })

  it('pomija wysokość, która nie jest liczbą dodatnią', () => {
    const wysokosc = (height: unknown) => ({ source: 'strzelnica-widget', kind: 'height', height })

    expect(readWidgetMessage(wysokosc('512'))).toBeNull()
    expect(readWidgetMessage(wysokosc(Number.NaN))).toBeNull()
    expect(readWidgetMessage(wysokosc(Number.POSITIVE_INFINITY))).toBeNull()
    expect(readWidgetMessage(wysokosc(-1))).toBeNull()
    expect(readWidgetMessage(wysokosc(0))).toBeNull()
  })
})

describe('domena dozwolona do osadzenia', () => {
  it('sprowadza zapis do samego źródła', () => {
    expect(normalizeOrigin('https://Klient.Example.PL/')).toBe('https://klient.example.pl')
    expect(normalizeOrigin('  https://klient.example.pl  ')).toBe('https://klient.example.pl')
    expect(normalizeOrigin('https://klient.example.pl:443')).toBe('https://klient.example.pl')
    expect(normalizeOrigin('http://localhost:5175')).toBe('http://localhost:5175')
  })

  it('odrzuca zapis, który nie jest źródłem', () => {
    expect(() => normalizeOrigin('klient.example.pl')).toThrow(InvalidOriginError)
    expect(() => normalizeOrigin('https://klient.example.pl/rezerwacja')).toThrow(
      /bez ścieżki/,
    )
    expect(() => normalizeOrigin('ftp://klient.example.pl')).toThrow(/http/)
  })
})

describe('nagłówek frame-ancestors', () => {
  it('wypisuje dozwolone domeny Strzelnicy', () => {
    expect(frameAncestors(['https://klient.example.pl', 'http://localhost:5175'])).toBe(
      "frame-ancestors https://klient.example.pl http://localhost:5175",
    )
  })

  it('bez dozwolonych domen zabrania osadzania w ogóle', () => {
    expect(frameAncestors([])).toBe("frame-ancestors 'none'")
  })

  it('nie powtarza tej samej domeny zapisanej dwa razy', () => {
    expect(frameAncestors(['https://klient.example.pl', 'https://Klient.example.pl/'])).toBe(
      'frame-ancestors https://klient.example.pl',
    )
  })

  it('zatrzymuje się na domenie zapisanej błędnie, zamiast wpuszczać ją do nagłówka', () => {
    expect(() => frameAncestors(['https://klient.example.pl', 'klient.example.pl'])).toThrow(
      InvalidOriginError,
    )
  })
})
