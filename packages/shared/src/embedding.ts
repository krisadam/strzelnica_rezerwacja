/**
 * Osadzenie Widgetu na obcej stronie: adres ramki, protokół `postMessage`
 * między Widgetem a skryptem-loaderem, nagłówek `frame-ancestors`, gotowy
 * znacznik do wklejenia oraz dokumenty Strzelnicy, na które klient godzi się
 * przy Rezerwacji. Zobacz ADR 0002.
 *
 * Regulamin i polityka prywatności stoją tu, a nie przy konfiguracji
 * Strzelnicy, bo są **częścią osadzenia**: jadą jednym formularzem i jednym
 * zapisem razem z listą domen — tym samym, którym Strzelnica odpowiada na
 * pytanie „na czyjej stronie i na czyich warunkach się u mnie rezerwuje".
 *
 * Wszystko tutaj jest czystą funkcją, bo każdy z tych trzech kawałków ma
 * dwie strony i muszą się zgadzać: skrypt na stronie gospodarza i Widget
 * w ramce, a nagłówek — to, co wystawia serwer, i to, co Strzelnica wpisała
 * w Panelu. Jedna kopia reguły zamiast dwóch zgodnych z założenia.
 */

/** Znacznik odróżniający nasze komunikaty od cudzych skryptów na stronie. */
export const WIDGET_MESSAGE_SOURCE = 'strzelnica-widget'

/**
 * Nazwa ramki czytana przez czytniki ekranu na stronie gospodarza. Mieszka
 * tutaj, a nie w słowniku Widgetu, bo wpisuje ją skrypt osadzający — budowany
 * osobno i bez dostępu do bundla Widgetu.
 */
export const TYTUL_RAMKI = 'Rezerwacja osi'

export type WidgetMessage =
  /** Wysokość dokumentu Widgetu w pikselach; ramka ma się do niej dopasować. */
  | { kind: 'height'; height: number }
  /** Prośba o przewinięcie strony gospodarza do góry ramki. */
  | { kind: 'scrollToTop' }

/**
 * Komunikat w postaci, w jakiej idzie przez `postMessage`: treść w kopercie
 * ze znacznikiem nadawcy. Obie strony znają ten kształt z jednej definicji.
 */
export type EnvelopedWidgetMessage = WidgetMessage & { source: typeof WIDGET_MESSAGE_SOURCE }

export function heightMessage(height: number): EnvelopedWidgetMessage {
  return { source: WIDGET_MESSAGE_SOURCE, kind: 'height', height: Math.ceil(height) }
}

export function scrollToTopMessage(): EnvelopedWidgetMessage {
  return { source: WIDGET_MESSAGE_SOURCE, kind: 'scrollToTop' }
}

/**
 * Komunikat Widgetu albo `null`. Do okna gospodarza trafia wszystko, co wyśle
 * dowolny skrypt na jego stronie — nasz nasłuch musi to znieść bez wyjątku
 * i bez reagowania.
 */
export function readWidgetMessage(data: unknown): WidgetMessage | null {
  if (typeof data !== 'object' || data === null) return null

  const message = data as Record<string, unknown>
  if (message.source !== WIDGET_MESSAGE_SOURCE) return null

  if (message.kind === 'scrollToTop') return { kind: 'scrollToTop' }

  if (message.kind === 'height') {
    const height = message.height
    // Wysokość zerowa zwinęłaby ramkę do niewidoczności — to nie jest pomiar,
    // tylko usterka po stronie, która go przysłała.
    if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return null
    return { kind: 'height', height }
  }

  return null
}

export type WidgetFrameUrlInput = {
  /** Adres skryptu osadzającego; Widget stoi w tym samym katalogu. */
  loaderSrc: string
  facilitySlug: string
  /** Źródło strony gospodarza — Widget adresuje do niego swoje komunikaty. */
  hostOrigin: string
}

/**
 * Adres ładowany do ramki. Skrypt zna tylko własne `src`, więc adres Widgetu
 * bierze się z jego katalogu — dzięki temu ten sam plik działa na każdej
 * domenie, z której go wystawimy.
 */
export function widgetFrameUrl({
  loaderSrc,
  facilitySlug,
  hostOrigin,
}: WidgetFrameUrlInput): string {
  const slug = facilitySlug.trim()
  if (!slug) throw new Error('Skrypt osadzający nie wskazuje Strzelnicy.')

  const url = new URL('.', loaderSrc)
  url.searchParams.set('strzelnica', slug)
  url.searchParams.set('gospodarz', hostOrigin)
  return url.toString()
}

export class InvalidOriginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidOriginError'
  }
}

/**
 * Domena dozwolona do osadzenia, sprowadzona do postaci, w jakiej porównuje ją
 * przeglądarka: schemat, host i port. Ścieżka czy parametry w takim wpisie
 * znaczą, że ktoś wkleił adres podstrony zamiast domeny — nagłówek zbudowany
 * z takiego wpisu byłby cichą blokadą osadzania.
 */
export function normalizeOrigin(value: string): string {
  const zapis = value.trim()

  let parsed: URL
  try {
    parsed = new URL(zapis)
  } catch {
    throw new InvalidOriginError(
      `„${zapis}" nie jest domeną osadzenia. Podaj adres ze schematem, np. https://example.pl`,
    )
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidOriginError(`Domena osadzenia musi być adresem http(s): „${zapis}"`)
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username) {
    throw new InvalidOriginError(
      `Domena osadzenia to sam adres domeny, bez ścieżki i parametrów: „${zapis}"`,
    )
  }

  return parsed.origin
}

/**
 * Wartość nagłówka `Content-Security-Policy` ograniczająca osadzanie Widgetu
 * do domen jednej Strzelnicy. Pusta lista nie znaczy „wszędzie" — znaczy
 * „nigdzie": Strzelnica, która nie wskazała domen, nie zgodziła się na żadną.
 */
export function frameAncestors(origins: string[]): string {
  const dozwolone = [...new Set(origins.map(normalizeOrigin))]
  if (dozwolone.length === 0) return "frame-ancestors 'none'"
  return `frame-ancestors ${dozwolone.join(' ')}`
}

/**
 * Znacznik, który Użytkownik panelu kopiuje i wkleja u siebie na stronie —
 * ten sam, który opisuje `embed.ts`. Liczony tutaj, bo Panel ma go pokazać
 * gotowego do skopiowania, a wypisany w tekście ekranu rozjechałby się ze
 * skryptem przy pierwszej zmianie nazwy atrybutu.
 *
 * Adres Widgetu jest naszą domeną, jednakową dla wszystkich Strzelnic, więc
 * przychodzi z konfiguracji platformy, a nie z danych Strzelnicy — tak samo
 * jak `WIDGET_ORIGIN` w środowisku Edge Functions.
 */
export function embedSnippet({
  widgetOrigin,
  facilitySlug,
}: {
  widgetOrigin: string
  facilitySlug: string
}): string {
  const slug = facilitySlug.trim()
  if (!slug) throw new Error('Znacznik osadzenia nie wskazuje Strzelnicy.')

  // Przez `normalizeOrigin`, a nie przez sklejenie napisów: adres ze ścieżką
  // albo bez schematu dałby znacznik, który u gospodarza nic nie wczyta —
  // a to jest dokładnie ten kawałek konfiguracji, którego nikt nie ogląda.
  const skrypt = new URL('embed.js', `${normalizeOrigin(widgetOrigin)}/`)
  return `<script src="${skrypt.toString()}" data-strzelnica="${slug}"></script>`
}
