/**
 * Adresy Widgetu podawane w listach. Widget stoi pod jednym źródłem i poznaje
 * powód wejścia po parametrze, więc każdy taki link ma ten sam kształt: nasze
 * źródło, Strzelnica i token. Jedna kopia składania, bo rozjazd między nimi
 * byłby linkiem, który prowadzi do kalendarza zamiast do Rezerwacji.
 *
 * Nie eksportuje się z `index.ts`: na zewnątrz wychodzą nazwane linki
 * (`confirmationUrl`, `managementUrl`), a nie sposób ich sklejenia.
 */

export type WidgetLinkInput = {
  /**
   * **Źródło**, spod którego serwowany jest Widget — schemat, host i port, bez
   * ścieżki: ta sama wartość, którą Edge Function porównuje z nagłówkiem
   * `Origin`, a ten ścieżki nie niesie nigdy. Ścieżka wpisana tutaj zostaje
   * odrzucona, tak jak odrzuciłoby ją porównanie źródeł.
   *
   * Nie jest domeną osadzenia: link otwiera się z e-maila, poza witryną
   * Strzelnicy, a Widget umie stanąć samodzielnie.
   */
  widgetOrigin: string
  facilitySlug: string
  token: string
}

/** Adres Widgetu z tokenem podanym pod wskazanym parametrem. */
export function widgetLink(
  param: string,
  { widgetOrigin, facilitySlug, token }: WidgetLinkInput,
): string {
  const url = new URL('/', widgetOrigin)
  url.searchParams.set('strzelnica', facilitySlug)
  url.searchParams.set(param, token)
  return url.toString()
}
