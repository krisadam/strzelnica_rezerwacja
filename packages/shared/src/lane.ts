/**
 * Oś jako **przedmiot konfiguracji**: dodawana, poprawiana i wyłączana przez
 * Panel. Sama Oś — to, czym jest dla grafiku i dla Kwoty — mieszka w `rows.ts`
 * razem z odczytem swojego wiersza; tutaj jest wyłącznie to, co dzieje się,
 * gdy Strzelnica ją opisuje.
 *
 * Wyłączenie zamiast skasowania, i jest to decyzja, a nie wygoda (ADR 0013):
 * Oś skasowana zabrałaby ze sobą Rezerwacje, które na niej stoją — klucz obcy
 * kasuje je kaskadą — a Rezerwacja ma zniknąć wyłącznie przez odwołanie,
 * z powodem wysłanym klientowi. Oś wyłączona przestaje być ofertą i nic poza
 * tym: jej Rezerwacje zostają w kalendarzu, a Zajętość liczy się z nich dalej.
 *
 * Czyste funkcje, jak przy Blokadzie: ta sama kopia orzeka w Panelu, zanim
 * pokaże się przycisk, i w Edge Function, zanim cokolwiek trafi do bazy.
 */
import type { Lane } from './rows.ts'

/**
 * Najwyższa pojemność, jaką Oś może mieć — tyle, ile mieści kolumna
 * `capacity smallint`. Nie jest to reguła domeny, tylko granica schematu
 * powiedziana wprost: bez niej liczba spoza zakresu wracałaby awarią serwera
 * zamiast nazwanym zastrzeżeniem, a żadna z tych dwóch odpowiedzi nie mówi
 * obsłudze, co wpisać.
 */
export const MAX_LANE_CAPACITY = 32_767

/**
 * To, co Użytkownik panelu wypełnia w formularzu Osi — i zarazem to, co jedzie
 * siecią. Jeden kształt na oba, inaczej niż przy Blokadzie: tam żądanie różni
 * się od formularza naprawdę (chwile pewne wobec pustych pól), a tu nie ma
 * czego po drodze przerabiać, więc dwa typy byłyby tą samą czwórką pól
 * przepisaną drugi raz — razem z miejscem na rozjazd.
 *
 * `id` puste znaczy Oś, której jeszcze nie ma — jedyna różnica między dodaniem
 * a poprawką, bo wypełnia się przy obu dokładnie te same pola. O tym, czy Oś
 * jest tej Strzelnicy, rozstrzyga baza po numerze konta (ADR 0010);
 * identyfikator podstawiony z palca nie otwiera więc niczego, choć w żądaniu
 * stoi wprost.
 *
 * Stawki za Blok tu nie ma i jest to granica ticketu, a nie przeoczenie:
 * należy do Cennika (ticket #22). Oś dodana tym formularzem wchodzi więc ze
 * stawką zerową, dopóki tamten ekran nie powstanie.
 */
export type LaneDraft = {
  id: string | null
  name: string
  /** Pojemność: maksymalna liczba Uczestników na Osi jednocześnie. */
  capacity: number
  /** Czy Oś jest w ofercie. Wyłączona znika z Widgetu, ale zostaje w Panelu. */
  active: boolean
}

/** Dlaczego Oś nie wchodzi. */
export type LaneProblem =
  /** Nazwa nie została podana. */
  | 'brak-nazwy'
  /** Nazwę nosi już inna Oś tej Strzelnicy. */
  | 'nazwa-zajeta'
  /** Pojemność nie jest dodatnią liczbą Uczestników. */
  | 'zla-pojemnosc'
  /** Oś, której ta Strzelnica nie ma. Odpowiedź bazy, nie formularza. */
  | 'nieznana-os'

export type LaneCheck = {
  draft: LaneDraft
  /** Osie tej Strzelnicy — po nie sięga wyłącznie sprawdzenie nazwy. */
  lanes: readonly Lane[]
}

/**
 * Wszystkie zastrzeżenia naraz, w kolejności czytania formularza — tak samo
 * jak przy Blokadzie i przy zgłoszeniu Rezerwacji.
 *
 * Zajętość nazwy jest tu wygodą, a nie zabezpieczeniem: rozstrzyga o niej
 * ograniczenie `unique (facility_id, name)` w schemacie, bo między odczytem
 * Panelu a kliknięciem mieści się Oś dodana przez koleżankę z drugiej zmiany.
 */
export function laneProblems({ draft, lanes }: LaneCheck): LaneProblem[] {
  const problems: LaneProblem[] = []
  const name = draft.name.trim()

  if (name === '') {
    // Bez nazwy nie ma czego zestawiać z pozostałymi Osiami: „nazwa zajęta"
    // przy pustym polu byłoby zdaniem o niczym.
    problems.push('brak-nazwy')
  } else if (lanes.some((lane) => lane.id !== draft.id && lane.name.trim() === name)) {
    problems.push('nazwa-zajeta')
  }

  if (
    !Number.isInteger(draft.capacity) ||
    draft.capacity < 1 ||
    draft.capacity > MAX_LANE_CAPACITY
  ) {
    problems.push('zla-pojemnosc')
  }

  return problems
}

export class MalformedLaneRequestError extends Error {
  constructor(message: string) {
    super(`Żądanie Osi ma zły kształt: ${message}`)
    this.name = 'MalformedLaneRequestError'
  }
}

/**
 * Żądanie odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie kształt —
 * czy da się z tego zbudować `LaneRequest`. O tym, czy wolno je przyjąć, orzeka
 * `laneProblems`: nazwa pusta i pojemność spoza zakresu przechodzą więc tędy
 * bez słowa, bo mają wrócić nazwanym zastrzeżeniem, a nie odmową „zły kształt".
 */
export function readLaneRequest(value: unknown): LaneDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedLaneRequestError('treść żądania nie jest obiektem')
  }

  const source = value as Record<string, unknown>

  // Pole adresujące żądanie: puste znaczy Oś, której jeszcze nie ma. Puste
  // musi być przy tym **wpisane** — żądanie, które o tym polu milczy, byłoby
  // nie do odróżnienia od żądania nowej Osi, więc literówka w jego nazwie
  // zakładałaby Oś zamiast poprawić istniejącą. Jedyne pole, które o cokolwiek
  // pyta samym swoim brakiem, jest zarazem jedynym, którego brak wolno nam
  // zauważyć.
  if (!('id' in source)) {
    throw new MalformedLaneRequestError('brak pola id — nowa Oś ma je puste, nie pominięte')
  }
  const id = source.id
  if (id !== null && typeof id !== 'string') {
    throw new MalformedLaneRequestError('pole id nie jest napisem ani pustką')
  }

  const name = source.name
  if (typeof name !== 'string') {
    throw new MalformedLaneRequestError('pole name nie jest napisem')
  }

  const capacity = source.capacity
  if (typeof capacity !== 'number' || !Number.isInteger(capacity)) {
    throw new MalformedLaneRequestError('pole capacity nie jest liczbą całkowitą')
  }

  const active = source.active
  if (typeof active !== 'boolean') {
    throw new MalformedLaneRequestError('pole active nie jest wartością logiczną')
  }

  return {
    id: typeof id === 'string' && id.trim() !== '' ? id.trim() : null,
    name: name.trim(),
    capacity,
    active,
  }
}

/**
 * Wynik próby zapisu Osi. Zapisana wraca numerem — Panel czyta po niej dane od
 * nowa, więc numer jest tu dowodem zapisu, a nie treścią ekranu. Ten sam
 * kształt dla Osi nowej i poprawionej, bo pytanie „która to Oś" ma po zapisie
 * jedną odpowiedź.
 */
export type LaneOutcome = { ok: true; id: string } | { ok: false; problem: LaneProblem }
