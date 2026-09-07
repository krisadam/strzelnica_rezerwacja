/**
 * Blokada: wyłączenie Osi z rezerwacji na wskazany czas, wprowadzane przez
 * Panel — serwis, zawody, przerwa techniczna.
 *
 * Dla dostępności jest **nierozróżnialna od Rezerwacji**: zajmuje Oś na
 * wyłączność, więc jedzie do niej tym samym kształtem `Occupancy` i przechodzi
 * tę samą regułę kolizji (`occupied`). Druga reguła — „a teraz to samo dla
 * Blokad" — rozjechałaby się z pierwszą na granicy zakresu, czyli dokładnie
 * tam, gdzie boli.
 *
 * Czym się różni od Rezerwacji: nie ma Osoby rezerwującej ani Kwoty do
 * zapłaty, nie zajmuje miejsca w Puli instruktorów i nie musi trafiać w siatkę
 * Bloków — obsługa zamyka Oś na czas serwisu, a nie na wielokrotność Slotu.
 *
 * Czyste funkcje, jak przy zgłoszeniu Rezerwacji i przy odwołaniu: ta sama
 * kopia orzeka w Panelu, zanim pokaże się przycisk, i w Edge Function, zanim
 * cokolwiek trafi do bazy.
 */
import type { Occupancy } from './availability.ts'
import { occupied } from './availability.ts'

/**
 * Blokada tak, jak leży w bazie. Powód jest jej częścią, a nie notatką obok:
 * bez niego kolejna zmiana obsługi widzi Oś wyłączoną ze sprzedaży i nie wie,
 * czy wolno ją włączyć — tak samo jak przy Odwołaniu, tylko czytelnikiem jest
 * tu Strzelnica, a nie klient.
 */
export type LaneClosure = {
  id: string
  laneId: string
  startsAt: Date
  endsAt: Date
  reason: string
}

/**
 * Blokada w kształcie Zajętości. Jedno zdanie, a jest w nim cała treść tego
 * modułu: dostępność nie dowiaduje się, że pyta o Blokadę.
 *
 * `withInstructor` jest tu fałszem zawsze i nie jest to wartość domyślna:
 * przy Blokadzie nie ma nikogo do nadzorowania, więc Oś zamknięta na serwis
 * nie odbiera Instruktora Rezerwacji na Osi obok.
 */
export function closureOccupancy(closure: LaneClosure): Occupancy {
  return {
    laneId: closure.laneId,
    startsAt: closure.startsAt,
    endsAt: closure.endsAt,
    withInstructor: false,
  }
}

/**
 * To, co Użytkownik panelu wypełnia w formularzu Blokady. Chwile dopuszczalnie
 * puste, bo pole niewypełnione i pole wypełnione bzdurą są dla formularza tym
 * samym — a orzeka o nich `closureProblems`, ta sama funkcja, która orzeka
 * o kolizji.
 */
export type ClosureDraft = {
  laneId: string
  startsAt: Date | null
  endsAt: Date | null
  reason: string
}

/** Dlaczego Blokada nie wchodzi. */
export type ClosureProblem =
  /** Zakresu nie ma: puste pole, bzdura w polu albo koniec przed początkiem. */
  | 'zly-zakres'
  /** Powód nie został podany. */
  | 'brak-powodu'
  /** Oś jest w tym czasie czyjaś — Rezerwacji albo innej Blokady. */
  | 'termin-zajety'
  /** Oś, której ta Strzelnica nie ma. Odpowiedź bazy, nie formularza. */
  | 'nieznana-os'

export type ClosureCheck = {
  draft: ClosureDraft
  /**
   * Zajętość Osi — Rezerwacje trzymające termin **i** Blokady. Jedna lista, bo
   * jedna reguła: Blokada nie wchodzi ani na Rezerwację, ani na Blokadę.
   */
  occupancies: readonly Occupancy[]
}

/**
 * Wszystkie zastrzeżenia naraz, w kolejności czytania formularza — tak samo
 * jak przy zgłoszeniu Rezerwacji: obsługa ma zobaczyć całą listę poprawek za
 * jednym razem, a nie odkrywać je pojedynczo przy każdym kliknięciu.
 *
 * Kolizja z Zajętością jest tu wygodą, a nie zabezpieczeniem: zajętość odczytana
 * w przeglądarce bywa nieaktualna, więc rozstrzyga dopiero zapis (`place_closure`
 * pod blokadą doradczą na Strzelnicę). Sprawdzenie przed zapisem jest po to,
 * żeby powiedzieć obsłudze, co jest nie tak, zanim cokolwiek wyśle.
 */
export function closureProblems({ draft, occupancies }: ClosureCheck): ClosureProblem[] {
  const problems: ClosureProblem[] = []
  const { startsAt, endsAt } = draft
  const zakres = startsAt && endsAt && endsAt > startsAt

  if (!zakres) {
    // Bez zakresu nie ma czego zestawić z Zajętością, więc kolizja nie ma
    // o czym orzekać: „termin zajęty" przy pustym polu byłoby zdaniem o niczym.
    problems.push('zly-zakres')
  } else if (occupied(occupancies, draft.laneId, startsAt, endsAt)) {
    problems.push('termin-zajety')
  }

  if (draft.reason.trim() === '') problems.push('brak-powodu')

  return problems
}

/**
 * Żądanie wprowadzenia Blokady. Chwile podane wprost, a nie dniem i minutą
 * rozkładu jak przy Rezerwacji: Blokada nie wybiera się z opublikowanych
 * Bloków, więc nie ma siatki, do której serwer miałby ją przyłożyć. Zegar
 * Strzelnicy zna przy tym Panel — czyta jej strefę razem z resztą danych — więc
 * przeliczenie należy do niego.
 *
 * O tym, czy Oś jest tej Strzelnicy, rozstrzyga baza po numerze konta (ADR
 * 0010), tak samo jak przy odwołaniu. Identyfikator podstawiony z palca nie
 * otwiera więc niczego, choć w żądaniu stoi wprost.
 */
export type ClosureRequest = {
  laneId: string
  startsAt: Date
  endsAt: Date
  reason: string
}

/** Żądanie w postaci, w jakiej jedzie siecią: chwile jako napisy ISO. */
export type ClosureRequestWire = {
  laneId: string
  startsAt: string
  endsAt: string
  reason: string
}

export class MalformedClosureRequestError extends Error {
  constructor(message: string) {
    super(`Żądanie Blokady ma zły kształt: ${message}`)
    this.name = 'MalformedClosureRequestError'
  }
}

/** Chwila z żądania albo wyjątek. `Date` nie przechodzi sieci — ISO przechodzi. */
function moment(source: Record<string, unknown>, key: string): Date {
  const value = source[key]
  if (typeof value !== 'string') {
    throw new MalformedClosureRequestError(`pole ${key} nie jest napisem`)
  }
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) {
    throw new MalformedClosureRequestError(`pole ${key} nie jest chwilą w zapisie ISO`)
  }
  return instant
}

/**
 * Żądanie odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie kształt —
 * czy da się z tego zbudować `ClosureRequest`. O tym, czy wolno je przyjąć,
 * orzeka `closureProblems`, tak samo jak `bookingProblems` przy zgłoszeniu.
 */
export function readClosureRequest(value: unknown): ClosureRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedClosureRequestError('treść żądania nie jest obiektem')
  }

  const source = value as Record<string, unknown>

  // Pole adresujące żądanie: bez niego nie ma czego blokować.
  const laneId = source.laneId
  if (typeof laneId !== 'string' || laneId.trim() === '') {
    throw new MalformedClosureRequestError('pole laneId nie jest wypełnionym napisem')
  }

  // Powód wolno tu przepuścić pusty — orzeka o nim zastrzeżenie, ta sama
  // funkcja, którą pyta Panel. Odsianie go już tutaj czyniłoby „brak-powodu"
  // odpowiedzią, której serwer nigdy nie udziela.
  const reason = source.reason
  if (typeof reason !== 'string') {
    throw new MalformedClosureRequestError('pole reason nie jest napisem')
  }

  return {
    laneId: laneId.trim(),
    startsAt: moment(source, 'startsAt'),
    endsAt: moment(source, 'endsAt'),
    reason: reason.trim(),
  }
}

/** Żądanie w drogę: to, co po drugiej stronie odczyta `readClosureRequest`. */
export function writeClosureRequest(request: ClosureRequest): ClosureRequestWire {
  return {
    laneId: request.laneId,
    startsAt: request.startsAt.toISOString(),
    endsAt: request.endsAt.toISOString(),
    reason: request.reason,
  }
}

/**
 * Wynik próby wprowadzenia Blokady. Przyjęta wraca numerem — Panel czyta po
 * niej dane od nowa, więc numer jest tu dowodem zapisu, a nie treścią ekranu.
 */
export type ClosureOutcome =
  | { ok: true; id: string }
  | { ok: false; problem: ClosureProblem }
