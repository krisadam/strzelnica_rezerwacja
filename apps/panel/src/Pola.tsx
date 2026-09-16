/**
 * Pola formularzy konfiguracji Strzelnicy: kwota i liczba całkowita. Dwa pola
 * w jednym pliku, bo są jedną sprawą oglądaną z dwóch stron — obie pytają
 * o liczbę, której zero coś znaczy, i obie dlatego trzymają **napis**, a nie
 * liczbę. Wspólne dla Osi, katalogów i cennika: pole wpisane trzy razy
 * rozjechałoby się przy pierwszej poprawce.
 */
import { formatAmount, parseAmount } from '@strzelnica/shared'
import { useId } from 'react'

/**
 * Pole, w które wpisuje się kwotę — stawkę Strzelnicy, stawkę za Blok albo cenę
 * za sztukę. Jedna kopia dla wszystkich trzech ekranów konfiguracji, bo pytanie
 * jest w nich to samo: obsługa czyta cennik w złotych, a baza trzyma grosze.
 *
 * Trzy kopie tego samego pola rozjechałyby się przy pierwszej poprawce, i to
 * tak, że cenę sprzętu wpisywałoby się inaczej niż stawkę za Blok na sąsiednim
 * ekranie jednego Panelu — a obie są tą samą złotówką.
 *
 * Pole jest tekstowe, a nie liczbowe, i jest to decyzja: przeliczenie złotych
 * na grosze należy do `parseAmount`, więc to ono ma orzec, czy w polu stoi
 * kwota. Pole liczbowe przepuściłoby ułamek grosza do zaokrąglenia, którego
 * nikt nie zobaczy, a pustemu nadałoby po cichu wartość zero — a zero jest tu
 * stawką, nie brakiem stawki.
 *
 * Przeliczonej wartości to pole **nie oddaje**: wołający czyta ją sam, tym samym
 * `parseAmount`, bo to on składa z niej formularz i to on wie, co zrobić z kwotą
 * nie do odczytania. Pole odpowiada wyłącznie za to, co widać.
 */
export function PoleKwoty({
  etykieta,
  opis,
  podglad,
  wartosc,
  onZmien,
}: {
  etykieta: string
  /** Co ta kwota znaczy — w szczególności, co znaczy jej zero. */
  opis: string
  /** Zdanie o tym, co zobaczy klient; pokazuje się zamiast opisu, gdy da się je zbudować. */
  podglad: (kwota: string) => string
  /** Kwota w złotych, tak jak stoi w polu. */
  wartosc: string
  onZmien: (wartosc: string) => void
}) {
  const polaId = useId()
  // Kwota po polsku, z walutą — bo taką zobaczy klient, a to ona ma się
  // zgadzać. Sprawdzenie, nie ozdoba: „1200" wpisane zamiast „12,00" mówi
  // o sobie od razu, a nie dopiero rachunkiem, którego nikt nie umie
  // wytłumaczyć.
  const grosze = parseAmount(wartosc)

  return (
    <div className="pole">
      <label htmlFor={polaId}>{etykieta}</label>
      <input
        id={polaId}
        type="text"
        inputMode="decimal"
        value={wartosc}
        onChange={(zdarzenie) => onZmien(zdarzenie.target.value)}
      />
      <span className="pole__opis">{grosze === null ? opis : podglad(formatAmount(grosze))}</span>
    </div>
  )
}

/**
 * Pole, w które wpisuje się liczbę całkowitą — Pulę instruktorów, pojemność
 * Osi, pulę sztuk albo regułę czasową. Siostrzane wobec `PoleKwoty` i tak samo
 * ostrożne: trzyma **napis**, a nie liczbę, bo pole wyczyszczone do pustego
 * miejsca nie jest zerem. Zero na tych ekranach coś znaczy — Strzelnicę bez
 * nadzoru, horyzont sięgający wyłącznie dzisiaj — więc nadane po cichu za
 * czyjeś skasowanie cyfry byłoby konfiguracją, o której nikt nie zdecydował.
 *
 * Liczbę czyta wołający, `czytajLiczbe` — tak samo jak kwotę czyta sam
 * `parseAmount`.
 */
export function PoleLiczby({
  etykieta,
  opis,
  max,
  wartosc,
  onZmien,
}: {
  etykieta: string
  /** Co ta liczba znaczy — w szczególności, co znaczy jej zero. */
  opis: string
  /** Granica kolumny, w której ta liczba stanie; pilnuje jej też zastrzeżenie. */
  max: number
  /** Liczba tak, jak stoi w polu. */
  wartosc: string
  onZmien: (wartosc: string) => void
}) {
  const polaId = useId()

  return (
    <div className="pole">
      <label htmlFor={polaId}>{etykieta}</label>
      <input
        id={polaId}
        type="number"
        min={0}
        max={max}
        step={1}
        value={wartosc}
        onChange={(zdarzenie) => onZmien(zdarzenie.target.value)}
      />
      <span className="pole__opis">{opis}</span>
    </div>
  )
}

/**
 * Liczba wpisana w pole albo `NaN`, gdy to, co w nim stoi, liczbą całkowitą nie
 * jest — w szczególności, gdy nie stoi tam nic. Odpowiednik `parseAmount` dla
 * pól liczbowych i stoi tuż obok `PoleLiczby` z tego samego powodu: zapis
 * i odczyt mają być jedną parą.
 *
 * `NaN`, a nie `null`: liczba jedzie prosto do formularza, a zastrzeżenia
 * i tak orzekają o niej `Number.isInteger`. Drugi sposób powiedzenia „to nie
 * jest liczba" znaczyłby drugie sprawdzenie w każdym miejscu, które ją czyta.
 */
export function czytajLiczbe(wartosc: string): number {
  const zapis = wartosc.trim()
  // Wzorzec, a nie sam `Number`: tamten przyjąłby `1e3`, `0x10`, ułamek i pusty
  // napis, czyli cztery rzeczy, których nikt nie wpisuje jako liczby sztuk,
  // ludzi ani dni. Ta sama ostrożność, co w `parseAmount`.
  return /^\d+$/.test(zapis) ? Number(zapis) : Number.NaN
}
