/**
 * Grafiki Widgetu — cztery kształty i ani jednego więcej. Wszystkie są
 * **dekoracją**: niosą nastrój strzelnicy, a nie treść, więc każda z nich jest
 * ukryta przed technologiami wspomagającymi (`aria-hidden`). To, co czyta
 * czytnik ekranu, i to, po czym chodzą testy — role, etykiety, napisy — nie
 * zmienia się przez nie ani o słowo.
 *
 * Rysowane w dokumencie, a nie dociągane plikiem: Widget dogrywa się na cudzej
 * stronie, w ramce z obcego źródła, więc każdy zewnętrzny zasób to drugie
 * żądanie, które może nie dojść — a wtedy zostaje po nim dziura w miejscu,
 * którego nikt nie opisał słowami.
 *
 * Kreska ma grubość kreski interfejsu, i to dosłownie: `vector-effect` trzyma
 * ją na jednym pikselu niezależnie od tego, jak duża jest grafika, więc
 * obwódka karty i obwódka tarczy są tą samą kreską. Kolory przychodzą
 * z tokenów; żadna z tych grafik nie niesie koloru stanu — zieleń, czerwień
 * i fiolet mówią tu o terminach, a nie o ozdobach.
 *
 * Znacznik przy Blokadzie i Osi wyłączonej grafiki świadomie nie dostaje:
 * kolor niesie tam już znaczenie, więc piktogram byłby trzecim nośnikiem tego
 * samego.
 */

/**
 * Tarcza strzelecka jako pierścień. Stoi na ekranie potwierdzonego adresu —
 * pierścień domknięty w całości jest tu tym, czym jest: sprawą załatwioną.
 *
 * Ten sam kształt rysuje Panel przy dziennym Zestawieniu, tyle że tam jego
 * obwód jest **wskaźnikiem** i pokazuje obłożenie dnia. Dwie kopie kształtu,
 * a nie jedna, bo wspólny pakiet modułu jest pakietem reguł domeny i czyta go
 * także Deno w funkcjach brzegowych — Reactu w nim nie ma i mieć nie będzie.
 * Rozjechać się po cichu mogłaby arytmetyka pierścienia, więc jest dokładnie
 * tam, gdzie jedyny pierścień, który coś liczy: w Panelu.
 */
export function Tarcza() {
  return (
    <svg className="grafika grafika--tarcza" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="grafika__akcent" cx="12" cy="12" r="10.5" />
      <circle className="grafika__kreska" cx="12" cy="12" r="6.5" />
      <circle className="grafika__punkt" cx="12" cy="12" r="2" />
    </svg>
  )
}

/**
 * Oś widziana od stanowiska: dwie ściany zbiegające się w głąb i tarcza na
 * końcu. Stoi w pustym stanie kalendarza — tam, gdzie nie ma ani jednego
 * terminu do wzięcia, a zdanie o tym zostaje samo na ekranie.
 */
export function PiktogramOsi() {
  return (
    <svg className="grafika grafika--os" viewBox="0 0 24 24" aria-hidden="true">
      {/* Ściany Osi. Zbiegają się ku górze, bo tak widzi je stojący na
          stanowisku — i dlatego tarcza jest u góry mała, a nie u dołu duża. */}
      <path className="grafika__kreska" d="M1.5 22 L8.5 7" />
      <path className="grafika__kreska" d="M22.5 22 L15.5 7" />
      {/* Kulochwyt za tarczą: poprzeczka domykająca Oś na jej końcu. */}
      <path className="grafika__kreska" d="M7.5 7 H16.5" />
      <circle className="grafika__akcent" cx="12" cy="4" r="2.5" />
    </svg>
  )
}

/**
 * Znak w nagłówku Widgetu — celownik. Jedyny element pełniący tu rolę marki
 * i jedyna grafika, która nie odpowiada na żadne pytanie ekranu: stoi przy
 * tytule, bo ramka osadzona na cudzej stronie ma się przedstawić.
 *
 * Kreski wychodzą poza okrąg i nie dotykają go, więc znak czyta się jako
 * celownik, a nie jako trzecia tarcza obok tamtych dwóch.
 */
export function Znak() {
  return (
    <svg className="grafika grafika--znak" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="grafika__akcent" cx="12" cy="12" r="7.5" />
      <path className="grafika__akcent" d="M12 0.5 V3" />
      <path className="grafika__akcent" d="M12 21 V23.5" />
      <path className="grafika__akcent" d="M0.5 12 H3" />
      <path className="grafika__akcent" d="M21 12 H23.5" />
      <circle className="grafika__punkt" cx="12" cy="12" r="1.5" />
    </svg>
  )
}

/**
 * Koperta z tarczą — na ekranie po wysłaniu linku potwierdzającego adres.
 * Rezerwacja stoi, ale trzyma się skrzynki pocztowej, i to jest tam zdanie
 * najważniejsze; koperta powtarza je kształtem.
 */
export function KopertaZTarcza() {
  return (
    <svg className="grafika grafika--koperta" viewBox="0 0 24 24" aria-hidden="true">
      <rect className="grafika__kreska" x="1.5" y="4.5" width="16" height="12" rx="1.5" />
      {/* Zagięcie koperty; nie domyka się na bokach, bo to nie jest drugi
          prostokąt, tylko papier złożony w środku. */}
      <path className="grafika__kreska" d="M1.5 5.5 L9.5 11.5 L17.5 5.5" />
      <circle className="grafika__akcent" cx="18" cy="17" r="4.5" />
      <circle className="grafika__punkt" cx="18" cy="17" r="1.5" />
    </svg>
  )
}
