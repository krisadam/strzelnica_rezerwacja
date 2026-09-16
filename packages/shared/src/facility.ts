/**
 * Strzelnica jako **przedmiot konfiguracji**: cennik wspólny dla całej
 * Strzelnicy, Pula instruktorów i reguły czasowe. Sama Strzelnica — to, czym
 * jest dla grafiku i dla Kwoty — mieszka w `rows.ts` razem z odczytem swojego
 * wiersza; tutaj jest wyłącznie to, co dzieje się, gdy Strzelnica opisuje samą
 * siebie.
 *
 * Trzy rzeczy w jednym pliku, bo zapisują się jednym żądaniem i jednym
 * przyciskiem: wszystkie są kolumnami tego samego wiersza, więc rozdzielone
 * dałyby trzy drogi zapisu do tej samej Strzelnicy i trzy chwile, w których
 * konfiguracja jest w połowie stara. Stawki za Blok tu nie ma i nie będzie:
 * należy do Osi (spec — cennik zależny od pory dnia ma kiedyś stanąć właśnie
 * tam), więc jedzie razem z Osią przez `LaneDraft`.
 *
 * Czyste funkcje, jak przy Osi, godzinach i katalogach: ta sama kopia orzeka
 * w Panelu, zanim pokaże się przycisk, i w Edge Function, zanim cokolwiek
 * trafi do bazy.
 */
import { attendedInstructors } from './availability.ts'
import type { TimeRules } from './availability.ts'

/**
 * Największa Pula instruktorów — tyle, ile mieści kolumna `instructor_pool
 * smallint`. Nie jest to reguła domeny, tylko granica schematu powiedziana
 * wprost: bez niej liczba spoza zakresu wracałaby awarią serwera zamiast
 * nazwanym zastrzeżeniem. Ta sama ostrożność, co przy pojemności Osi i puli
 * sztuk Typu broni.
 */
export const MAX_INSTRUCTOR_POOL = 32_767

/**
 * Najwyższa stawka w groszach — granica kolumny `integer`, wspólna obu stawkom
 * Strzelnicy i stawce za Blok. Sama w sobie nie jest regułą Strzelnicy: cennik
 * z dwudziestoma milionami złotych za uczestnictwo jest pomyłką, ale to nie my
 * mamy orzec, na której cyfrze się zaczyna. Ta sama granica, co przy cenie za
 * sztukę (`MAX_UNIT_PRICE_GR`) i z tego samego powodu — tamta jest osobną
 * stałą, bo mówi o katalogu, a nie o cenniku Strzelnicy.
 */
export const MAX_RATE_GR = 2_147_483_647

/**
 * Najwyższa wartość reguły czasowej — granica kolumny `smallint`, wspólna
 * wszystkim trzem, choć każda mierzy czym innym: horyzont dniami, wyprzedzenie
 * minutami, okno anulowania godzinami. Jednostki są różne, a granica jedna, bo
 * bierze się nie z domeny, tylko z szerokości kolumny.
 */
export const MAX_TIME_RULE = 32_767

/**
 * To, co Użytkownik panelu wypełnia w formularzu cennika i reguł — i zarazem
 * to, co jedzie siecią. Jeden kształt na oba, tak samo jak `LaneDraft`
 * i `WeaponTypeDraft`: nie ma tu czego po drodze przerabiać.
 *
 * Bez `id` i bez jakiegokolwiek wskazania Strzelnicy, inaczej niż przy Osi
 * i przy pozycji katalogu: konfiguracja jest własnością **tej** Strzelnicy,
 * o którą baza pyta po numerze potwierdzonego konta (ADR 0010), więc w żądaniu
 * nie ma czego podstawić z palca. Ta sama decyzja, co przy godzinach otwarcia.
 */
export type FacilityConfigDraft = {
  /** Ilu Instruktorów Strzelnica zapewnia w tym samym czasie. */
  instructorPool: number
  /** Stawka za uczestnictwo w groszach, za Uczestników poza pierwszym. */
  participationRate: number
  /** Stawka za Instruktora w groszach, za samą jego obecność. */
  instructorRate: number
  /** Horyzont, minimalne wyprzedzenie i okno anulowania — razem, bo razem mierzą czas. */
  timeRules: TimeRules
}

/** Dlaczego konfiguracja Strzelnicy nie wchodzi. */
export type FacilityConfigProblem =
  /** Stawka za uczestnictwo nie jest liczbą groszy. */
  | 'zla-stawka-uczestnictwa'
  /** Stawka za Instruktora nie jest liczbą groszy. */
  | 'zla-stawka-instruktora'
  /** Pula instruktorów nie jest liczbą ludzi, których da się zapewnić. */
  | 'zla-pula-instruktorow'
  /** Horyzont nie jest liczbą dni. */
  | 'zly-horyzont'
  /** Minimalne wyprzedzenie nie jest liczbą minut. */
  | 'zle-wyprzedzenie'
  /** Okno anulowania nie jest liczbą godzin. */
  | 'zle-okno-anulowania'
  /** Konto bez Strzelnicy. Odpowiedź bazy, nie formularza. */
  | 'nieznana-strzelnica'

/**
 * Czy liczba **nie** mieści się w kolumnie, w której ma stanąć: nie jest
 * całkowita, jest ujemna albo przekracza granicę tej kolumny.
 *
 * Jedna kopia dla całej konfiguracji Strzelnicy — stawek, Puli, reguł
 * czasowych, pojemności Osi, stawki za Blok i cen katalogu. Wszystkie te pola
 * zadają dokładnie to samo pytanie i różnią się wyłącznie granicą, więc druga
 * kopia rozjechałaby się przy pierwszej poprawce: ułamek wolno byłoby wtedy
 * wpisać w jedno pole, a w sąsiednie nie.
 *
 * Zero przechodzi wszędzie i jest to odpowiedź, a nie przeoczenie — każde z tych
 * zer coś znaczy, a co, mówią zdania przy polach formularza.
 */
export function outsideColumnRange(value: number, max: number): boolean {
  return !Number.isInteger(value) || value < 0 || value > max
}

/**
 * Wszystkie zastrzeżenia naraz, w kolejności czytania formularza — tak samo
 * jak przy Osi, godzinach i katalogach: obsługa ma zobaczyć całą listę
 * poprawek za jednym razem, a nie odkrywać je pojedynczo przy każdym
 * kliknięciu.
 *
 * Reguły czasowe wytykane są **każda z osobna**, choć granicę mają jedną:
 * mierzą czym innym, więc jedno zdanie o „złej regule czasowej" kazałoby
 * zgadywać, które z trzech pól poprawić.
 *
 * Czego tu nie ma: sprawdzenia, czy Pula starcza na Rezerwacje już złożone.
 * Zmniejszenie Puli ich nie rusza i nie ma czym — Rezerwacja niesie własną
 * obecność Instruktora — a wynikające z tego przekroczenia **wypisuje**
 * `instructorOverruns` i rozstrzyga człowiek. Tak samo jak przy puli sztuk
 * broni i przy godzinach otwarcia zdejmujących czyjś termin.
 *
 * Nie ma tu też sprawdzenia, czy skrócony horyzont nie wypada przed terminem
 * Rezerwacji złożonej wcześniej — i z tego samego powodu: Rezerwacja niesie
 * własny termin i o horyzont nie pyta nikogo po tym, jak powstała. Horyzont
 * mówi, na kiedy Strzelnica **przyjmuje**, a nie komu odbiera sobotę.
 */
export function facilityConfigProblems(draft: FacilityConfigDraft): FacilityConfigProblem[] {
  const problems: FacilityConfigProblem[] = []

  if (outsideColumnRange(draft.participationRate, MAX_RATE_GR)) {
    problems.push('zla-stawka-uczestnictwa')
  }
  if (outsideColumnRange(draft.instructorRate, MAX_RATE_GR)) problems.push('zla-stawka-instruktora')
  if (outsideColumnRange(draft.instructorPool, MAX_INSTRUCTOR_POOL)) {
    problems.push('zla-pula-instruktorow')
  }
  if (outsideColumnRange(draft.timeRules.horizonDays, MAX_TIME_RULE)) problems.push('zly-horyzont')
  if (outsideColumnRange(draft.timeRules.minLeadMinutes, MAX_TIME_RULE)) {
    problems.push('zle-wyprzedzenie')
  }
  if (outsideColumnRange(draft.timeRules.cancellationWindowHours, MAX_TIME_RULE)) {
    problems.push('zle-okno-anulowania')
  }

  return problems
}

export class MalformedFacilityConfigRequestError extends Error {
  constructor(message: string) {
    super(`Żądanie konfiguracji Strzelnicy ma zły kształt: ${message}`)
    this.name = 'MalformedFacilityConfigRequestError'
  }
}

/** Liczba całkowita z żądania albo wyjątek; zakres osądzają zastrzeżenia. */
function integer(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MalformedFacilityConfigRequestError(`pole ${key} nie jest liczbą całkowitą`)
  }
  return value
}

/**
 * Żądanie odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie kształt —
 * czy da się z tego zbudować `FacilityConfigDraft`. O tym, czy wolno je
 * przyjąć, orzeka `facilityConfigProblems`: liczby spoza zakresu przechodzą
 * więc tędy bez słowa, bo mają wrócić nazwanym zastrzeżeniem, a nie odmową
 * „zły kształt".
 *
 * Każde pole musi być **wpisane**: żądanie milczące o którymkolwiek z sześciu
 * byłoby żądaniem wyzerowania go po cichu, bo zapis idzie w całości — a nikt
 * nie zamyka Strzelnicy na dzisiaj literówką w nazwie pola. Inaczej niż przy
 * Osi, gdzie brak pola `id` znaczyłby nową Oś: tam brak był treścią, tu jest
 * pomyłką.
 *
 * Stawki jadą tu z przyrostkiem `Gr` i mówią jednostkę wprost, tak samo jak
 * kolumny `…_gr` w schemacie: na brzegu czyta się surową treść i to właśnie tu
 * jednostka bywa zgubiona. Dalej pola nazywają się bez przyrostka, tak jak
 * w `Facility` — w domenie kwoty są w groszach wszędzie.
 */
export function readFacilityConfigRequest(value: unknown): FacilityConfigDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MalformedFacilityConfigRequestError('treść żądania nie jest obiektem')
  }
  const source = value as Record<string, unknown>

  return {
    instructorPool: integer(source, 'instructorPool'),
    participationRate: integer(source, 'participationRateGr'),
    instructorRate: integer(source, 'instructorRateGr'),
    timeRules: {
      horizonDays: integer(source, 'horizonDays'),
      minLeadMinutes: integer(source, 'minLeadMinutes'),
      cancellationWindowHours: integer(source, 'cancellationWindowHours'),
    },
  }
}

/**
 * Wynik próby zapisu konfiguracji. Bez numeru, inaczej niż przy Osi i pozycji
 * katalogu: Strzelnica jest jedna i była tu przed żądaniem, więc nie ma czego
 * oddawać poza tym, że zapis przeszedł. Ten sam kształt, co `HoursOutcome`,
 * i z tego samego powodu.
 */
export type FacilityConfigOutcome = { ok: true } | { ok: false; problem: FacilityConfigProblem }

/**
 * Rezerwacja trzymająca Instruktora wraz ze swoim terminem — tyle, ile trzeba,
 * żeby policzyć, ilu Instruktorów jest w danej chwili zajętych. Siostrzana
 * wobec `BookedRental` z katalogów i z tego samego powodu uboga: reguła nie
 * pyta ani o Osobę rezerwującą, ani o Oś (Pula liczy się po całej Strzelnicy),
 * a Panel ma po nich własny kształt.
 *
 * Wołający podaje wyłącznie Rezerwacje, przy których Instruktor **jest**:
 * pozostałe miejsca w Puli nie zajmują wcale, a odsianie wykonane tutaj
 * musiałoby czytać pole, którego ten typ nie niesie.
 */
export type BookedAttendance = {
  bookingId: string
  startsAt: Date
  endsAt: Date
}

export type InstructorOverrunInput = {
  /** Pula **po** zmianie — pytamy o to, co zostanie, a nie o to, co było. */
  pool: number
  attendances: readonly BookedAttendance[]
}

/** Rezerwacja, dla której nie starcza Instruktorów, wraz z ich liczbą. */
export type InstructorOverrun = {
  bookingId: string
  /** Ilu Instruktorów trzymają łącznie Rezerwacje nachodzące na jej termin. */
  attended: number
}

/**
 * Rezerwacje, którym po tej zmianie Puli Instruktorów już nie starcza.
 * Wszystkie, a nie pierwsza z brzegu: obsługa ma je rozstrzygnąć co do jednej —
 * jedna zmiana grafiku pracownika, druga rozmowa z klientem, trzecia odwołana
 * z powodem.
 *
 * Zmiana **nie blokuje**: Pula wchodzi i tak, a Rezerwacja zostaje ze swoim
 * Instruktorem. Zmniejszenie Puli mówi, ilu ludzi Strzelnica ma, a nie komu
 * odbiera nadzór — tak samo jak zmniejszona pula sztuk nikomu nie odbiera broni,
 * a godziny otwarcia nikomu nie odbierają terminu. Rezerwacja znika wyłącznie
 * Odwołaniem, z powodem wysłanym klientowi, a tej decyzji nie podejmuje
 * formularz konfiguracji.
 *
 * Instruktorów liczy `attendedInstructors` — ta sama funkcja, którą liczy ich
 * dostępność Bloku — więc przekroczenie wypisane w konfiguracji jest tym samym
 * przekroczeniem, przez które Widget odmówi Osobie rezerwującej bez Pozwolenia.
 * Wraz z nią dziedziczy się zachowawczość tamtego rachunku: Rezerwacje 8–10
 * i 10–12 nie dzielą Instruktora, ale 9–11 liczy się do obu.
 */
export function instructorOverruns({
  pool,
  attendances,
}: InstructorOverrunInput): InstructorOverrun[] {
  return attendances
    .map((attendance) => ({
      bookingId: attendance.bookingId,
      attended: attendedInstructors(attendances, attendance.startsAt, attendance.endsAt),
    }))
    .filter((overrun) => overrun.attended > pool)
}
