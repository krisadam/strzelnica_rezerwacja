import type {
  AmmunitionKind,
  AmmunitionKindDraft,
  BookedRental,
  CatalogOutcome,
  CatalogProblem,
  PanelBooking,
  WeaponType,
  WeaponTypeDraft,
} from '@strzelnica/shared'
import {
  ammunitionKindProblems,
  formatAmount,
  MAX_WEAPON_POOL,
  parseAmount,
  poolOverruns,
  weaponTypeProblems,
  writeAmount,
} from '@strzelnica/shared'
import type { ReactNode } from 'react'
import { useCallback, useId, useState } from 'react'
import { Kolizje } from './Kolizje.js'
import { zapiszRodzajAmunicji, zapiszTypBroni } from './konfiguracja.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'

/**
 * Wspólny stan obu formularzy: co poszło do funkcji i co z niej wróciło.
 * Katalogi są dwa, a odpowiedź na zapis ma w obu wyglądać tak samo — obsługa
 * czyta jeden ekran, nie dwa.
 */
function useZapis(onZapisano: () => void) {
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly CatalogProblem[]>([])
  const [udane, setUdane] = useState(false)
  const [blad, setBlad] = useState(false)

  const wyslij = useCallback(
    (problemy: readonly CatalogProblem[], zapisz: () => Promise<CatalogOutcome>, poZapisie: () => void) => {
      // Zastrzeżenia liczone tą samą czystą funkcją, którą serwer sprawdza je po
      // raz drugi. Rozstrzyga i tak zapis: nazwę zajętą w międzyczasie widzi
      // dopiero ograniczenie w schemacie.
      if (problemy.length > 0) {
        setZastrzezenia(problemy)
        setUdane(false)
        return
      }

      setWysylanie(true)
      setBlad(false)
      setZastrzezenia([])
      setUdane(false)

      zapisz()
        .then((wynik) => {
          setZastrzezenia(wynik.ok ? [] : [wynik.problem])
          setUdane(wynik.ok)
          if (!wynik.ok) return
          poZapisie()
          onZapisano()
        })
        .catch((przyczyna: unknown) => {
          console.error(przyczyna)
          setBlad(true)
        })
        .finally(() => setWysylanie(false))
    },
    [onZapisano],
  )

  return { wysylanie, zastrzezenia, udane, blad, wyslij }
}

/** Odpowiedzi formularza: zastrzeżenia, potwierdzenie i awaria — w jednym miejscu. */
function Odpowiedzi({
  zastrzezenia,
  udane,
  blad,
  potwierdzenie,
}: {
  zastrzezenia: readonly CatalogProblem[]
  udane: boolean
  blad: boolean
  potwierdzenie: string
}) {
  return (
    <>
      {zastrzezenia.map((problem) => (
        <p key={problem} className="komunikat komunikat--blad" role="alert">
          {teksty.katalogi.problem[problem]}
        </p>
      ))}
      {udane && (
        <p className="komunikat" role="status">
          {potwierdzenie}
        </p>
      )}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.katalogi.blad}
        </p>
      )}
    </>
  )
}

/**
 * Pola, które opisują **każdą** pozycję katalogu: nazwa, cena za sztukę i to,
 * czy pozycja jest w ofercie. Jedna kopia dla obu katalogów, bo pytanie jest
 * w nich to samo — a dwie rozjechałyby się przy pierwszej poprawce, i to tak,
 * że amunicję wpisywałoby się inaczej niż broń na tym samym ekranie. Ta sama
 * decyzja, co przy `PolaGodzin` w godzinach otwarcia.
 *
 * Pula stoi między nazwą a ceną i przychodzi z zewnątrz (`pulaTypu`), bo ma ją
 * wyłącznie Typ broni: Rodzaj amunicji puli nie ma i mieć nie będzie
 * (ADR 0004), więc nie ma czego tu wyłączać znacznikiem.
 */
function PolaPozycji({
  id,
  nazwa,
  cena,
  wOfercie,
  etykietaOferty,
  pulaTypu,
  onNazwa,
  onCena,
  onWOfercie,
}: {
  /** Przedrostek identyfikatorów; etykieta kwadracika wskazuje pole przez `for`. */
  id: string
  nazwa: string
  /** Cena w złotych, tak jak stoi w polu — na grosze przelicza ją `parseAmount`. */
  cena: string
  wOfercie: boolean
  etykietaOferty: string
  /** Pole puli albo nic; Rodzaj amunicji nie podaje go wcale. */
  pulaTypu?: ReactNode
  onNazwa: (nazwa: string) => void
  onCena: (cena: string) => void
  onWOfercie: (wOfercie: boolean) => void
}) {
  const cenaGr = parseAmount(cena)

  return (
    <>
      <div className="filtry">
        <label className="pole">
          <span>{teksty.katalogi.nazwa}</span>
          <input type="text" value={nazwa} onChange={(zdarzenie) => onNazwa(zdarzenie.target.value)} />
        </label>

        {pulaTypu}

        <label className="pole">
          <span>{teksty.katalogi.cena}</span>
          <input
            type="text"
            inputMode="decimal"
            value={cena}
            onChange={(zdarzenie) => onCena(zdarzenie.target.value)}
          />
        </label>
      </div>

      {/* Cena po polsku, obok pola: pole pyta o same złote, a klient zobaczy
          w formularzu Kwotę z walutą — i to ona ma się zgadzać. */}
      {cenaGr !== null && (
        <p className="komunikat">{teksty.katalogi.cenaPodglad(formatAmount(cenaGr))}</p>
      )}

      {/* Pole zaznaczane czyta się w poprzek: kwadracik i zdanie obok niego są
          jedną rzeczą. Etykieta wskazuje pole przez `for`, bo obejmująca je
          sobą brałaby nazwę z całej swojej treści. */}
      <div className="pole pole--zaznaczane">
        <input
          id={`${id}-w-ofercie`}
          type="checkbox"
          checked={wOfercie}
          onChange={(zdarzenie) => onWOfercie(zdarzenie.target.checked)}
        />
        <label htmlFor={`${id}-w-ofercie`}>{etykietaOferty}</label>
      </div>
    </>
  )
}

/**
 * Jeden Typ broni do opisania: nazwa, pula sztuk, cena za sztukę i to, czy jest
 * w ofercie. Ten sam formularz dodaje pozycję i poprawia istniejącą — tak samo
 * jak formularz Osi i z tego samego powodu: wypełnia się w obu przypadkach
 * dokładnie te same pola.
 *
 * Kasowania tu nie ma i nie będzie (ADR 0013): pozycję wskazują Wypożyczenia
 * złożonych Rezerwacji, a te znikają wyłącznie Odwołaniem. Wycofanie robi to,
 * po co sięga się po kasowanie — zdejmuje pozycję ze sprzedaży, zostawiając jej
 * przeszłość.
 *
 * Pól nie odświeżamy z danych przychodzących co minutę: obsługa bywa w połowie
 * wpisywania ceny, a odczyt z bazy podmieniłby jej cyfrę w trakcie.
 */
function FormularzTypu({
  client,
  type,
  weaponTypes,
  bookings,
  rentals,
  onZapisano,
  onWybierz,
}: {
  client: PanelClient
  /** Pozycja do poprawienia albo `null` — wtedy formularz zakłada nową. */
  type: WeaponType | null
  /** Cały katalog; sięga po niego wyłącznie sprawdzenie nazwy. */
  weaponTypes: readonly WeaponType[]
  /** Rezerwacje okna Panelu — z nich biorą się przekroczenia puli. */
  bookings: readonly PanelBooking[]
  /** Sztuki trzymane przez Rezerwacje okna, każda ze swoją Rezerwacją. */
  rentals: readonly BookedRental[]
  onZapisano: () => void
  /** Przekroczenie rozstrzygnięte przez człowieka: przejście do Rezerwacji. */
  onWybierz: (booking: PanelBooking) => void
}) {
  const polaId = useId()
  const [nazwa, setNazwa] = useState(type?.name ?? '')
  const [pula, setPula] = useState(type?.pool ?? 1)
  const [cena, setCena] = useState(writeAmount(type?.unitPrice ?? 0))
  const [wOfercie, setWOfercie] = useState(type?.active ?? true)
  const { wysylanie, zastrzezenia, udane, blad, wyslij } = useZapis(onZapisano)

  // Cena z pola albo `null`, gdy to, co w nim stoi, ceną nie jest. Osąd należy
  // do `parseAmount`, a nie do tego ekranu: pole cenowe jest jedno, a złote na
  // grosze przelicza się w jednym miejscu.
  const cenaGr = parseAmount(cena)
  const draft: WeaponTypeDraft = {
    id: type?.id ?? null,
    name: nazwa,
    pool: pula,
    // Cena nie do odczytania jedzie do zastrzeżeń jako nie-liczba, zamiast
    // zamieniać się po cichu w zero: zero jest ceną, a nie brakiem ceny.
    unitPrice: cenaGr ?? Number.NaN,
    active: wOfercie,
  }

  const zapisz = () =>
    wyslij(
      weaponTypeProblems({ draft, weaponTypes }),
      () => zapiszTypBroni(client, draft),
      () => {
        // Pola wracają do pustych wyłącznie w formularzu nowej pozycji: przy
        // istniejącej opisują dalej ją samą, więc czyszczenie zostawiłoby na
        // ekranie pustą ramkę zamiast tego, co właśnie zapisano.
        if (type) return
        setNazwa('')
        setPula(1)
        setCena(writeAmount(0))
        setWOfercie(true)
      },
    )

  // Przekroczenia liczone dla puli **z pola**, a nie z bazy: obsługa ma je
  // zobaczyć, zanim naciśnie przycisk. Pula niedokończona — ułamek w trakcie
  // wpisywania — nie jest przy tym żadną pulą, więc lista mówi wtedy o tej
  // zapisanej; liczba z pola i liczba w dopisku są **jedną** liczbą, bo dwie
  // rozjechałyby się dokładnie w tej chwili.
  const pulaOsadu = Number.isInteger(pula) && pula >= 0 ? pula : (type?.pool ?? 0)
  // Pozycja nowa nie ma ani jednej Rezerwacji, więc nie ma czego przekroczyć.
  const przekroczenia = type
    ? poolOverruns({ weaponTypeId: type.id, pool: pulaOsadu, rentals })
    : []
  const wPrzekroczeniu = new Map(przekroczenia.map((wpis) => [wpis.bookingId, wpis.issued]))
  const rezerwacjeWPrzekroczeniu = bookings.filter((wpis) => wPrzekroczeniu.has(wpis.id))

  return (
    <div className="pozycja-katalogu">
      <h4>
        {type ? type.name : teksty.katalogi.bron.nowy}
        {type && !type.active && (
          <span className="pozycja-katalogu__znacznik"> — {teksty.katalogi.wycofana}</span>
        )}
      </h4>

      <PolaPozycji
        id={polaId}
        nazwa={nazwa}
        cena={cena}
        wOfercie={wOfercie}
        etykietaOferty={teksty.katalogi.bron.wOfercie}
        pulaTypu={
          <label className="pole">
            <span>{teksty.katalogi.bron.pula}</span>
            <input
              type="number"
              min={0}
              max={MAX_WEAPON_POOL}
              step={1}
              value={pula}
              onChange={(zdarzenie) => setPula(Number(zdarzenie.target.value))}
            />
          </label>
        }
        onNazwa={setNazwa}
        onCena={setCena}
        onWOfercie={setWOfercie}
      />

      <Kolizje
        naglowek={teksty.katalogi.przekroczenia.naglowek}
        // Lista stoi wewnątrz pozycji katalogu, której tytułem jest `h4`.
        poziom="h5"
        wstep={teksty.katalogi.przekroczenia.wstep}
        bookings={rezerwacjeWPrzekroczeniu}
        dopisek={(wpis) =>
          teksty.katalogi.przekroczenia.sztuki(wPrzekroczeniu.get(wpis.id) ?? 0, pulaOsadu)
        }
        onWybierz={onWybierz}
      />

      <Odpowiedzi
        zastrzezenia={zastrzezenia}
        udane={udane}
        blad={blad}
        potwierdzenie={type ? teksty.katalogi.bron.zapisano : teksty.katalogi.bron.dodano}
      />

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={zapisz} disabled={wysylanie}>
          {type
            ? wysylanie
              ? teksty.katalogi.zapisywanie
              : teksty.katalogi.zapisz
            : wysylanie
              ? teksty.katalogi.dodawanie
              : teksty.katalogi.bron.dodaj}
        </button>
      </div>
    </div>
  )
}

/**
 * Jeden Rodzaj amunicji: nazwa, cena za sztukę i to, czy jest w ofercie.
 * Siostrzany wobec formularza Typu broni i uboższy dokładnie o pulę —
 * amunicja nie wraca do Strzelnicy, więc nie ma stałej liczby sztuk do
 * rozdzielenia między Rezerwacje (ADR 0004).
 *
 * Nie ma tu przez to także przekroczeń: skoro nie ma puli, nie ma czego
 * przekroczyć. Zmiana ceny Rezerwacjami nie rusza — niosą własne ceny pozycji,
 * po których policzyła się ich Kwota — więc i o tym nie ma czego wypisywać.
 */
function FormularzRodzaju({
  client,
  kind,
  ammunitionKinds,
  onZapisano,
}: {
  client: PanelClient
  kind: AmmunitionKind | null
  ammunitionKinds: readonly AmmunitionKind[]
  onZapisano: () => void
}) {
  const polaId = useId()
  const [nazwa, setNazwa] = useState(kind?.name ?? '')
  const [cena, setCena] = useState(writeAmount(kind?.unitPrice ?? 0))
  const [wOfercie, setWOfercie] = useState(kind?.active ?? true)
  const { wysylanie, zastrzezenia, udane, blad, wyslij } = useZapis(onZapisano)

  const cenaGr = parseAmount(cena)
  const draft: AmmunitionKindDraft = {
    id: kind?.id ?? null,
    name: nazwa,
    unitPrice: cenaGr ?? Number.NaN,
    active: wOfercie,
  }

  const zapisz = () =>
    wyslij(
      ammunitionKindProblems({ draft, ammunitionKinds }),
      () => zapiszRodzajAmunicji(client, draft),
      () => {
        if (kind) return
        setNazwa('')
        setCena(writeAmount(0))
        setWOfercie(true)
      },
    )

  return (
    <div className="pozycja-katalogu">
      <h4>
        {kind ? kind.name : teksty.katalogi.amunicja.nowy}
        {kind && !kind.active && (
          <span className="pozycja-katalogu__znacznik"> — {teksty.katalogi.wycofana}</span>
        )}
      </h4>

      <PolaPozycji
        id={polaId}
        nazwa={nazwa}
        cena={cena}
        wOfercie={wOfercie}
        etykietaOferty={teksty.katalogi.amunicja.wOfercie}
        onNazwa={setNazwa}
        onCena={setCena}
        onWOfercie={setWOfercie}
      />

      <Odpowiedzi
        zastrzezenia={zastrzezenia}
        udane={udane}
        blad={blad}
        potwierdzenie={kind ? teksty.katalogi.amunicja.zapisano : teksty.katalogi.amunicja.dodano}
      />

      <div className="przyciski">
        <button type="button" className="przycisk" onClick={zapisz} disabled={wysylanie}>
          {kind
            ? wysylanie
              ? teksty.katalogi.zapisywanie
              : teksty.katalogi.zapisz
            : wysylanie
              ? teksty.katalogi.dodawanie
              : teksty.katalogi.amunicja.dodaj}
        </button>
      </div>
    </div>
  )
}

/**
 * Katalogi Strzelnicy: czym się u niej strzela i czym się do tego ładuje.
 * Dwa katalogi na jednym ekranie, bo odpowiadają na jedno pytanie klienta
 * wypełniającego formularz — co da się tu wypożyczyć i kupić — a różnią się
 * dokładnie jedną rzeczą: Typ broni ma pulę sztuk, Rodzaj amunicji jej nie ma
 * i mieć nie będzie (ADR 0004).
 *
 * Pozycje wycofane stoją tu razem z czynnymi, a nie osobno: obsługa szuka
 * sprzętu po nazwie, a nie po tym, czy akurat jest w sprzedaży — a druga lista
 * kazałaby jej zgadywać, w której szukać. Znacznik przy nazwie mówi resztę. Ta
 * sama decyzja, co przy Osiach wyłączonych.
 */
export function Katalogi({
  client,
  weaponTypes,
  ammunitionKinds,
  bookings,
  rentals,
  teraz,
  onZapisano,
  onWybierz,
}: {
  client: PanelClient
  weaponTypes: readonly WeaponType[]
  ammunitionKinds: readonly AmmunitionKind[]
  /** Rezerwacje okna Panelu; po nich poznaje się przekroczenia z nazwiskiem. */
  bookings: readonly PanelBooking[]
  /** Sztuki trzymane przez te Rezerwacje, każda ze swoim numerem Rezerwacji. */
  rentals: readonly BookedRental[]
  /** Chwila odczytu danych; mierzy się nią, co da się jeszcze rozstrzygnąć. */
  teraz: Date
  onZapisano: () => void
  onWybierz: (booking: PanelBooking) => void
}) {
  // Wypożyczenia, które zdążyły się skończyć, odpadają: okno Panelu sięga
  // tydzień wstecz, a wczorajszego wydania broni nie da się rozstrzygnąć
  // niczym — na liście „do rozstrzygnięcia" byłoby wyłącznie szumem
  // zasłaniającym te, o które naprawdę chodzi. Ta sama granica, co przy
  // Rezerwacjach wypchniętych poza godziny otwarcia.
  const doRozstrzygniecia = rentals.filter((rental) => rental.endsAt > teraz)

  return (
    <section className="konfiguracja">
      <h2>{teksty.katalogi.naglowek}</h2>
      <p className="komunikat">{teksty.katalogi.wstep}</p>

      <h3>{teksty.katalogi.bron.naglowek}</h3>
      <p className="komunikat">{teksty.katalogi.bron.wstep}</p>
      {weaponTypes.map((type) => (
        <FormularzTypu
          key={type.id}
          client={client}
          type={type}
          weaponTypes={weaponTypes}
          bookings={bookings}
          rentals={doRozstrzygniecia}
          onZapisano={onZapisano}
          onWybierz={onWybierz}
        />
      ))}
      <FormularzTypu
        client={client}
        type={null}
        weaponTypes={weaponTypes}
        bookings={bookings}
        rentals={doRozstrzygniecia}
        onZapisano={onZapisano}
        onWybierz={onWybierz}
      />

      <h3>{teksty.katalogi.amunicja.naglowek}</h3>
      <p className="komunikat">{teksty.katalogi.amunicja.wstep}</p>
      {ammunitionKinds.map((kind) => (
        <FormularzRodzaju
          key={kind.id}
          client={client}
          kind={kind}
          ammunitionKinds={ammunitionKinds}
          onZapisano={onZapisano}
        />
      ))}
      <FormularzRodzaju
        client={client}
        kind={null}
        ammunitionKinds={ammunitionKinds}
        onZapisano={onZapisano}
      />
    </section>
  )
}
