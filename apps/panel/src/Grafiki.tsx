import type { DayLoad } from '@strzelnica/shared'

/**
 * Grafika Panelu — jedna, przy dziennym Zestawieniu. Jest **dekoracją**: ukryta
 * przed technologiami wspomagającymi (`aria-hidden`), więc nie zmienia ani
 * tego, co czyta czytnik ekranu, ani tego, po czym chodzą testy. Liczby, które
 * pokazuje obwodem, stoją na tym ekranie także słowami — to one są odpowiedzią,
 * a pierścień jest jej kształtem.
 *
 * Rysowana w dokumencie, a nie dociągana plikiem, i kreską tej samej grubości
 * co obwódki interfejsu: `vector-effect` trzyma ją na jednym pikselu niezależnie
 * od wielkości rysunku. Deklaracja stoi w arkuszu przy **kształtach**, a nie
 * przy `<svg>` — nie dziedziczy się, więc na elemencie, który sam nic nie
 * maluje, nie robiłaby nic.
 */

/** Promień obwodu tarczy w układzie `viewBox`. */
const PROMIEN = 10.5
/** Środek rysunku; `viewBox` ma 24 jednostki na każdą stronę. */
const SRODEK = 12

/**
 * Łuk obwodu od godziny dwunastej w prawo, długi na `udzial` pełnego okręgu.
 *
 * Łuk, a nie kreska przerywana, choć `stroke-dasharray` byłby krótszy o całą
 * tę funkcję: wzór kreski liczy się w tej przestrzeni, w której kreska jest
 * rysowana, a nasza — przez `vector-effect` — rysuje się w pikselach ekranu,
 * nie w jednostkach `viewBox`. Długości przerw rozjeżdżałyby się więc
 * z obwodem, i to inaczej przy każdej wielkości rysunku: wskaźnik pokazywałby
 * cokolwiek. Łuk jest samą geometrią, a ta skaluje się razem z nim.
 */
function luk(udzial: number): string {
  const kat = 2 * Math.PI * udzial
  const x = SRODEK + PROMIEN * Math.sin(kat)
  const y = SRODEK - PROMIEN * Math.cos(kat)
  // Powyżej połowy obwodu trzeba wskazać łuk dłuższy: przez dwa punkty na
  // okręgu prowadzą dwie drogi i sam ich zapis ich nie rozróżnia.
  const dluzszy = udzial > 0.5 ? 1 : 0

  return `M ${SRODEK} ${SRODEK - PROMIEN} A ${PROMIEN} ${PROMIEN} 0 ${dluzszy} 1 ${x} ${y}`
}

/**
 * Tarcza strzelecka jako pierścień postępu — obłożenie dnia, na który patrzy
 * Zestawienie. Tarcza *jest* pierścieniem, więc kształt wchodzi tu bez
 * naciągania: im więcej Bloków dnia wziętych, tym pełniejszy obwód.
 *
 * Dzień bez rozkładu — i dzień zamknięty, który Bloków nie ma wcale — zostaje
 * pustym pierścieniem, a nie pełnym. Dzielenie przez zero jest tu pytaniem bez
 * sensu („jak pełny jest dzień, który nie ma czego sprzedać"), a nie brakiem
 * danych, więc odpowiada na nie sam kształt.
 *
 * Ten sam kształt, tyle że domknięty w całości, rysuje Widget na ekranie
 * potwierdzonego adresu. Kopie są dwie, bo wspólny pakiet modułu jest pakietem
 * reguł domeny i czyta go także Deno w funkcjach brzegowych — Reactu w nim nie
 * ma. Arytmetyka pierścienia stoi wyłącznie tutaj: tam nie ma czego liczyć.
 */
export function Tarcza({ load }: { load: DayLoad }) {
  const udzial = load.blocks === 0 ? 0 : load.taken / load.blocks

  return (
    <svg className="grafika grafika--oblozenie" viewBox="0 0 24 24" aria-hidden="true">
      {/* Ślad pierścienia — cały obwód dnia, także ta jego część, której nikt
          jeszcze nie wziął. Bez niego pierścień w jednej czwartej wyglądałby na
          łuk, a nie na ćwiartkę czegoś całego. */}
      <circle className="grafika__kreska" cx={SRODEK} cy={SRODEK} r={PROMIEN} />
      {/* Dzień wzięty w całości jest okręgiem, a nie łukiem: łuk zaczyna się
          i kończy w tym samym punkcie, więc nie narysowałby niczego. */}
      {udzial >= 1 && (
        <circle className="grafika__akcent" cx={SRODEK} cy={SRODEK} r={PROMIEN} />
      )}
      {udzial > 0 && udzial < 1 && <path className="grafika__akcent" d={luk(udzial)} />}
      <circle className="grafika__kreska" cx={SRODEK} cy={SRODEK} r="6.5" />
      <circle className="grafika__punkt" cx={SRODEK} cy={SRODEK} r="2" />
    </svg>
  )
}
