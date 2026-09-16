/**
 * Katalogi Strzelnicy jako **przedmiot konfiguracji**: Typ broni i Rodzaj
 * amunicji dodawane, poprawiane i wycofywane przez Panel. Same pozycje — to,
 * czym są dla dostępności i dla Kwoty — mieszkają w `availability.ts`
 * i `ammunition.ts` razem ze swoimi regułami; tutaj jest wyłącznie to, co
 * dzieje się, gdy Strzelnica je opisuje.
 *
 * Wycofanie zamiast skasowania, tak samo jak przy Osi (ADR 0013) i z powodu
 * jeszcze mocniejszego: pozycję katalogu wskazują Wypożyczenia i Zapotrzebowania
 * złożonych Rezerwacji kluczem obcym `on delete restrict`, więc skasowanie
 * Typu, który komuś obiecano, i tak odbiłoby się od bazy — tyle że błędem
 * serwera, którego obsługa nie ma jak przeczytać. Pozycja wycofana przestaje
 * być ofertą i nic poza tym: Rezerwacje z nią stoją dalej, a Panel opisuje je
 * jej nazwą.
 *
 * Dwa katalogi w jednym pliku, bo są jedną sprawą oglądaną z dwóch stron —
 * i różnią się dokładnie jednym: Typ broni ma pulę, a Rodzaj amunicji nie ma
 * jej i mieć nie będzie (ADR 0004). Różnica zostaje więc w typach, a nie
 * w komentarzu: formularza puli amunicji nie da się tu zbudować.
 *
 * Czyste funkcje, jak przy Osi i przy godzinach: ta sama kopia orzeka w Panelu,
 * zanim pokaże się przycisk, i w Edge Function, zanim cokolwiek trafi do bazy.
 */
import type { AmmunitionKind } from './ammunition.ts'
import type { WeaponOccupancy, WeaponType } from './availability.ts'
import { issuedWeapons } from './availability.ts'
import { outsideColumnRange } from './facility.ts'

/**
 * Największa pula, jaką Typ broni może mieć — tyle, ile mieści kolumna `pool
 * smallint`. Nie jest to reguła domeny, tylko granica schematu powiedziana
 * wprost: bez niej liczba spoza zakresu wracałaby awarią serwera zamiast
 * nazwanym zastrzeżeniem. Ta sama ostrożność, co przy pojemności Osi.
 */
export const MAX_WEAPON_POOL = 32_767

/**
 * Najwyższa cena za sztukę w groszach — granica kolumny `integer`, wspólna dla
 * obu katalogów. Sama w sobie nie jest regułą Strzelnicy: cennik z ceną
 * powyżej dwudziestu milionów złotych za sztukę jest pomyłką, ale to nie my
 * mamy orzec, na której cyfrze się zaczyna.
 */
export const MAX_UNIT_PRICE_GR = 2_147_483_647

/**
 * To, co Użytkownik panelu wypełnia w formularzu Typu broni — i zarazem to, co
 * jedzie siecią. Jeden kształt na oba, tak samo jak `LaneDraft`: nie ma tu
 * czego po drodze przerabiać, więc dwa typy byłyby tą samą piątką pól
 * przepisaną drugi raz, razem z miejscem na rozjazd.
 *
 * `id` puste znaczy pozycję, której jeszcze nie ma — jedyna różnica między
 * dodaniem a poprawką. O tym, czy pozycja należy do tej Strzelnicy,
 * rozstrzyga baza po numerze konta (ADR 0010).
 */
export type WeaponTypeDraft = {
  id: string | null
  name: string
  /** Pula: ile sztuk tego Typu Strzelnica ma do wypożyczenia. */
  pool: number
  /** Cena wypożyczenia jednej sztuki w groszach. */
  unitPrice: number
  /** Czy pozycja jest w ofercie. Wycofana znika z Widgetu, zostaje w Panelu. */
  active: boolean
}

/**
 * Formularz Rodzaju amunicji. Siostrzany wobec `WeaponTypeDraft` i uboższy
 * dokładnie o pulę — bo Rodzaj amunicji jej nie ma (ADR 0004). Brak pola jest
 * tu treścią: formularza, który pytałby o stan magazynowy amunicji, nie da się
 * z tego typu zbudować.
 */
export type AmmunitionKindDraft = {
  id: string | null
  name: string
  unitPrice: number
  active: boolean
}

/** Dlaczego pozycja katalogu nie wchodzi. */
export type CatalogProblem =
  /** Nazwa nie została podana. */
  | 'brak-nazwy'
  /** Nazwę nosi już inna pozycja tego katalogu — także wycofana. */
  | 'nazwa-zajeta'
  /** Pula nie jest liczbą sztuk, którą Strzelnica mogłaby mieć. */
  | 'zla-pula'
  /** Cena nie jest liczbą groszy. */
  | 'zla-cena'
  /** Pozycja, której ta Strzelnica nie ma. Odpowiedź bazy, nie formularza. */
  | 'nieznana-pozycja'

/** Pozycja katalogu sprowadzona do tego, czym sprawdza się nazwę. */
type NamedItem = { id: string; name: string }

/**
 * Zastrzeżenia wspólne obu katalogom: nazwa i cena. Jedna kopia, bo pytanie
 * jest w obu miejscach to samo — a druga rozjechałaby się przy pierwszej
 * poprawce i wtedy amunicję wolno byłoby nazwać pustym napisem, skoro broni
 * nie wolno.
 *
 * Zajętość nazwy jest tu wygodą, a nie zabezpieczeniem: rozstrzyga o niej
 * ograniczenie `unique (facility_id, name)` w schemacie, bo między odczytem
 * Panelu a kliknięciem mieści się pozycja dodana przez koleżankę z drugiej
 * zmiany. Wycofane liczą się tak samo jak czynne — ograniczenie o wycofaniu
 * nie wie nic, a dwie pozycje o jednej nazwie i tak byłyby nie do odróżnienia
 * w opisie Rezerwacji.
 */
function namedItemProblems(
  draft: { id: string | null; name: string; unitPrice: number },
  items: readonly NamedItem[],
): CatalogProblem[] {
  const problems: CatalogProblem[] = []
  const name = draft.name.trim()

  if (name === '') {
    // Bez nazwy nie ma czego zestawiać z pozostałymi pozycjami: „nazwa zajęta"
    // przy pustym polu byłoby zdaniem o niczym.
    problems.push('brak-nazwy')
  } else if (items.some((item) => item.id !== draft.id && item.name.trim() === name)) {
    problems.push('nazwa-zajeta')
  }

  return problems
}

/**
 * Czy cena da się zapisać w kolumnie groszy. Zero jest ceną, a nie brakiem ceny.
 * Pyta o to wspólny predykat konfiguracji — ten sam, którym mierzy się stawki
 * Strzelnicy i stawkę za Blok; tutaj zostaje nazwa, bo w katalogu to pytanie
 * czyta się jako „czy to jest cena".
 */
function badPrice(unitPrice: number): boolean {
  return outsideColumnRange(unitPrice, MAX_UNIT_PRICE_GR)
}

export type WeaponTypeCheck = {
  draft: WeaponTypeDraft
  /** Katalog tej Strzelnicy; sięga po niego wyłącznie sprawdzenie nazwy. */
  weaponTypes: readonly WeaponType[]
}

/**
 * Wszystkie zastrzeżenia do Typu broni naraz, w kolejności czytania formularza
 * — tak samo jak przy Osi i przy godzinach: obsługa ma zobaczyć całą listę
 * poprawek za jednym razem, a nie odkrywać je pojedynczo przy każdym
 * kliknięciu.
 *
 * Pula zerowa przechodzi i jest to odpowiedź, a nie przeoczenie: znaczy Typ
 * w katalogu, którego nie ma czym obsłużyć — cały sprzęt w serwisie — a to co
 * innego niż Typ wycofany z oferty. Te dwie rzeczy mówi się osobno, bo pierwsza
 * mija sama, a druga jest decyzją.
 *
 * Czego tu nie ma: sprawdzenia, czy pula starcza na Rezerwacje już złożone.
 * Zmniejszenie puli ich nie rusza i nie ma czym — Rezerwacja niesie własne
 * sztuki — a wynikające z tego przekroczenia **wypisuje** `poolOverruns`
 * i rozstrzyga człowiek.
 */
export function weaponTypeProblems({ draft, weaponTypes }: WeaponTypeCheck): CatalogProblem[] {
  const problems = namedItemProblems(draft, weaponTypes)

  if (outsideColumnRange(draft.pool, MAX_WEAPON_POOL)) problems.push('zla-pula')
  if (badPrice(draft.unitPrice)) problems.push('zla-cena')

  return problems
}

export type AmmunitionKindCheck = {
  draft: AmmunitionKindDraft
  ammunitionKinds: readonly AmmunitionKind[]
}

/**
 * Wszystkie zastrzeżenia do Rodzaju amunicji naraz. Krótsze od zastrzeżeń do
 * Typu broni dokładnie o pulę — której Rodzaj amunicji nie ma (ADR 0004).
 */
export function ammunitionKindProblems({
  draft,
  ammunitionKinds,
}: AmmunitionKindCheck): CatalogProblem[] {
  const problems = namedItemProblems(draft, ammunitionKinds)

  if (badPrice(draft.unitPrice)) problems.push('zla-cena')

  return problems
}

export class MalformedCatalogRequestError extends Error {
  constructor(message: string) {
    super(`Żądanie katalogu ma zły kształt: ${message}`)
    this.name = 'MalformedCatalogRequestError'
  }
}

/** Obiekt z żądania albo wyjątek — `null` i lista obiektem nie są. */
function object(value: unknown, opis: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedCatalogRequestError(`${opis} nie jest obiektem`)
  }
  return value as Record<string, unknown>
}

/** Liczba całkowita z żądania albo wyjątek; zakres osądzają zastrzeżenia. */
function integer(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MalformedCatalogRequestError(`pole ${key} nie jest liczbą całkowitą`)
  }
  return value
}

/**
 * Wspólny początek obu odczytów: numer pozycji, nazwa, cena i to, czy pozycja
 * jest w ofercie.
 *
 * Pole `id` musi być **wpisane** — żądanie, które o nim milczy, byłoby nie do
 * odróżnienia od żądania nowej pozycji, więc literówka w jego nazwie
 * zakładałaby kolejny „Glock 17" zamiast poprawić istniejącego. Jedyne pole,
 * które o cokolwiek pyta samym swoim brakiem, jest zarazem jedynym, którego
 * brak wolno nam zauważyć. Ta sama ostrożność, co przy żądaniu Osi.
 */
function readNamedItem(source: Record<string, unknown>): {
  id: string | null
  name: string
  unitPrice: number
  active: boolean
} {
  if (!('id' in source)) {
    throw new MalformedCatalogRequestError(
      'brak pola id — nowa pozycja ma je puste, nie pominięte',
    )
  }
  const id = source.id
  if (id !== null && typeof id !== 'string') {
    throw new MalformedCatalogRequestError('pole id nie jest napisem ani pustką')
  }

  const name = source.name
  if (typeof name !== 'string') {
    throw new MalformedCatalogRequestError('pole name nie jest napisem')
  }

  const active = source.active
  if (typeof active !== 'boolean') {
    throw new MalformedCatalogRequestError('pole active nie jest wartością logiczną')
  }

  return {
    id: typeof id === 'string' && id.trim() !== '' ? id.trim() : null,
    name: name.trim(),
    // Pole żądania nazywa się `unitPriceGr` i mówi jednostkę wprost, tak samo
    // jak kolumny `…_gr` w schemacie: na brzegu czyta się surową treść i to
    // właśnie tu jednostka bywa zgubiona. Dalej pole nazywa się `unitPrice`, tak
    // jak w `WeaponType` — w domenie kwoty są w groszach wszędzie.
    unitPrice: integer(source, 'unitPriceGr'),
    active,
  }
}

/**
 * Żądanie Typu broni odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie
 * kształt — czy da się z tego zbudować `WeaponTypeDraft`. O tym, czy wolno je
 * przyjąć, orzeka `weaponTypeProblems`: pusta nazwa i pula spoza zakresu
 * przechodzą więc tędy bez słowa, bo mają wrócić nazwanym zastrzeżeniem, a nie
 * odmową „zły kształt".
 */
export function readWeaponTypeRequest(value: unknown): WeaponTypeDraft {
  const source = object(value, 'treść żądania')
  return { ...readNamedItem(source), pool: integer(source, 'pool') }
}

/** Żądanie Rodzaju amunicji odczytane z sieci albo wyjątek; bez puli (ADR 0004). */
export function readAmmunitionKindRequest(value: unknown): AmmunitionKindDraft {
  return readNamedItem(object(value, 'treść żądania'))
}

/**
 * Wynik próby zapisu pozycji katalogu. Zapisana wraca numerem — Panel czyta po
 * niej dane od nowa, więc numer jest dowodem zapisu, a nie treścią ekranu. Ten
 * sam kształt dla obu katalogów i dla pozycji nowej oraz poprawionej, bo
 * pytanie „która to pozycja" ma po zapisie jedną odpowiedź.
 */
export type CatalogOutcome = { ok: true; id: string } | { ok: false; problem: CatalogProblem }

/**
 * Wypożyczenie wraz z terminem Rezerwacji, do której należy — tyle, ile trzeba,
 * żeby policzyć, ile sztuk jest w danej chwili czyichś. Siostrzane wobec
 * `BookedTerm` z godzin otwarcia i z tego samego powodu ubogie: reguła nie pyta
 * ani o Osobę rezerwującą, ani o Oś, a Panel ma po nich własny kształt.
 *
 * Termin bierze się z Rezerwacji — własne kolumny Wypożyczenia nie mówią o nim
 * nic — więc `panelWeaponOccupancy` składa jedno z drugim i oddaje właśnie to.
 */
export type BookedRental = WeaponOccupancy & { bookingId: string }

export type PoolOverrunInput = {
  weaponTypeId: string
  /** Pula **po** zmianie — pytamy o to, co zostanie, a nie o to, co było. */
  pool: number
  /** Wypożyczenia Rezerwacji trzymających termin; obcych Typów nie szkodzi. */
  rentals: readonly BookedRental[]
}

/** Rezerwacja, której sztuki nie mieszczą się w puli, wraz z liczbą wydanych. */
export type PoolOverrun = {
  bookingId: string
  /** Ile sztuk tego Typu trzymają łącznie Rezerwacje nachodzące na jej termin. */
  issued: number
}

/**
 * Rezerwacje, którym po tej zmianie puli sztuk już nie starcza. Wszystkie, a nie
 * pierwsza z brzegu: obsługa ma je rozstrzygnąć co do jednej — jedna broń
 * pożyczona z drugiej Strzelnicy, druga rozmowa z klientem, trzecia odwołana
 * z powodem.
 *
 * Zmiany **nie blokują**: pula wchodzi i tak, a Rezerwacja zostaje ze swoimi
 * sztukami. Zmniejszenie puli mówi, ile sztuk Strzelnica ma, a nie komu odbiera
 * broń — tak samo jak godziny otwarcia mówią, czego nie sprzedaje, a nie komu
 * odbierają termin (AC ticketu #21). Rezerwacja znika wyłącznie Odwołaniem,
 * z powodem wysłanym klientowi, a tej decyzji nie podejmuje formularz katalogu.
 *
 * Sztuki liczy `issuedWeapons` — ta sama funkcja, którą liczy je dostępność
 * Bloku, więc przekroczenie widziane tutaj jest tym samym przekroczeniem,
 * przez które Widget odmówi kolejnego zamówienia. Wraz z nią dziedziczy się
 * zachowawczość tamtego rachunku: Rezerwacje 8–10 i 10–12 nie dzielą sztuki,
 * ale 9–11 liczy się do obu.
 */
export function poolOverruns({ weaponTypeId, pool, rentals }: PoolOverrunInput): PoolOverrun[] {
  return rentals
    .filter((rental) => rental.weaponTypeId === weaponTypeId)
    .map((rental) => ({
      bookingId: rental.bookingId,
      issued: issuedWeapons(rentals, weaponTypeId, rental.startsAt, rental.endsAt),
    }))
    .filter((overrun) => overrun.issued > pool)
}
