/**
 * Ręczna Rezerwacja: zgłoszenie przyjęte przez telefon i wpisane w Panelu.
 *
 * Różni się od zgłoszenia z Widgetu dwiema rzeczami, i obie biorą się z jednej:
 * po drugiej stronie jest Użytkownik panelu, który wie o sytuacji więcej niż
 * system. Wolno mu więc **przekroczyć** trzy limity Strzelnicy — pojemność
 * Osi, godziny otwarcia i Pulę instruktorów — bo o szóstym stanowisku, zostaniu
 * po godzinach i Instruktorze wracającym ze zmiany system nie wie nic. I nie
 * musi czekać na potwierdzenie adresu: adres podano przez telefon, a nie
 * wpisano w formularz, więc nie ma czego potwierdzać.
 *
 * Czego przekroczyć **nie** wolno: wyłączności Osi. Termin zajęty przez inną
 * Rezerwację albo Blokadę nie jest limitem Strzelnicy, tylko cudzą własnością —
 * a dwie grupy na jednej Osi to nie odstępstwo, tylko dwie grupy na jednej Osi.
 * Nie wolno też obejść Puli sztuk Typu broni: ona mówi, ile sztuk Strzelnica
 * ma, a nie ile zwykle wydaje (ADR 0012).
 *
 * Każde odstępstwo zostaje przy Rezerwacji na trwałe i liczy je **serwer**,
 * a nie przeglądarka — tak samo jak Kwotę do zapłaty. Żądanie niesie wyłącznie
 * potwierdzenie („wiem, że przekraczam te limity"); lista, która trafia do
 * bazy, powstaje z tych samych danych, z których policzyła się dostępność.
 *
 * Czyste funkcje, jak przy zgłoszeniu z Widgetu, przy Blokadzie i przy
 * odwołaniu: ta sama kopia orzeka w Panelu, zanim pokaże się pytanie o pewność,
 * i w Edge Function, zanim cokolwiek trafi do bazy.
 */
import type { Unavailability } from './availability.ts'
import type { BookingCheck, BookingDraft, BookingProblem, BookingTerm } from './booking.ts'
import {
  draftProblems,
  MalformedBookingRequestError,
  participantsProblem,
  readBookingDraft,
  readBookingTerm,
  readRequestBody,
} from './booking.ts'
import type { Database } from './database.types.ts'
import type { Lane } from './rows.ts'

/**
 * Skąd Rezerwacja się wzięła. Czyta to obsługa przy każdej Rezerwacji: „ktoś
 * dzwonił" i „klient kliknął sam" znaczą przy telefonie do niego dwie różne
 * rozmowy.
 */
export type BookingSource = Database['public']['Enums']['booking_source']

/** Limit Strzelnicy, który ręczny wpis wolno przekroczyć. */
export type LimitOverride = Database['public']['Enums']['limit_override']

/**
 * Limity do przekroczenia w kolejności czytania formularza: najpierw te
 * o wybranym terminie, potem ten o składzie grupy.
 *
 * Lista, a nie sam typ, bo służy do trzech rzeczy naraz: pyta, czy dana nazwa
 * jest limitem do przekroczenia, porządkuje to, co zostaje odnotowane przy
 * Rezerwacji — dwa jednakowe wpisy mają dać jednakową listę, więc kolejność
 * nie może brać się z kolejności sprawdzeń — i pozwala Panelowi wypisać je
 * zawsze tak samo.
 */
export const LIMIT_OVERRIDES: readonly LimitOverride[] = [
  'poza-godzinami-otwarcia',
  'brak-instruktora',
  'ponad-pojemnosc-osi',
]

/**
 * Dlaczego ręczny wpis nie wchodzi. Zastrzeżenia do samego formularza są te
 * same, co w Widgecie, i są tu **wzięte** stamtąd, a nie wypisane po raz drugi:
 * pole kontaktu dopisane do zgłoszenia trafia wtedy do obu dróg naraz. Trzy
 * limity do przekroczenia z tego zbioru wypadają — nie są tu zastrzeżeniem
 * wcale.
 *
 * Dochodzą trzy powody, których Widget nie zna. „Termin zajęty" stoi tu osobno
 * od „terminu niedostępnego", bo dla obsługi to dwie różne wiadomości: jedna
 * mówi „wybierz inny termin", druga — „ten termin jest czyjś, odwołaj tamtą
 * Rezerwację albo zdejmij Blokadę". Widget schodzi z tym do jednego zdania,
 * bo klientowi jedno i drugie znaczy to samo.
 */
export type ManualBookingProblem =
  | Exclude<BookingProblem, LimitOverride>
  | 'termin-zajety'
  /** Wpis przekracza limit, którego Użytkownik panelu nie potwierdził. */
  | 'niepotwierdzone-przekroczenie'
  /** Oś, której ta Strzelnica nie ma. Odpowiedź bazy, nie formularza. */
  | 'nieznana-os'

/**
 * Jak Panel czyta powód niedostępności Bloku. Dwa z siedmiu są limitami
 * Strzelnicy do przekroczenia, pozostałe są odmową — i to jest cała różnica
 * między Panelem a Widgetem w osądzie o terminie.
 *
 * Odwzorowanie pełne, a nie lista wyjątków: powód dopisany do dostępności
 * zatrzyma tu kontrolę typów i każe zdecydować, po której stronie stoi. Bez
 * tego wpadłby po cichu do jednej z kupek — a wpadnięcie do niewłaściwej znaczy
 * albo limit oddany obsłudze bez decyzji, albo odmowę bez zdania, którym da się
 * ją wytłumaczyć.
 */
const TERM_READING: Record<Unavailability, ManualBookingProblem | LimitOverride> = {
  'poza-godzinami-otwarcia': 'poza-godzinami-otwarcia',
  'brak-instruktora': 'brak-instruktora',
  // Horyzont, przeszłość i wyprzedzenie nie są limitami Strzelnicy, tylko
  // zdaniami o zegarze i o kalendarzu — a wpisu Rezerwacji na wczoraj nie ma
  // po co przyjmować. Dla obsługi wszystkie trzy znaczą jedno: nie ten termin.
  'poza-horyzontem': 'termin-niedostepny',
  przeszlosc: 'termin-niedostepny',
  'ponizej-wyprzedzenia': 'termin-niedostepny',
  'termin-zajety': 'termin-zajety',
  'brak-sztuk-broni': 'brak-sztuk-broni',
}

/** Czy ta nazwa jest limitem do przekroczenia, a nie odmową. */
function jestPrzekroczeniem(nazwa: string): nazwa is LimitOverride {
  return (LIMIT_OVERRIDES as readonly string[]).includes(nazwa)
}

/**
 * Osąd o ręcznym wpisie: czego nie wolno i co przekracza. Dwie odpowiedzi
 * z jednej funkcji, bo pytający potrzebuje obu naraz — kto zapyta tylko
 * o odmowy, ten przyjmie wpis i nie odnotuje przy nim niczego.
 */
export type ManualBookingReview = {
  /**
   * Zastrzeżenia, których przekroczyć nie wolno — w kolejności czytania
   * formularza, wszystkie naraz. Niepusta lista znaczy wpis, który nie wejdzie.
   */
  problems: ManualBookingProblem[]
  /**
   * Limity, które ten wpis przekracza, w kolejności `LIMIT_OVERRIDES`. To jest
   * to, co po jawnym potwierdzeniu zostaje przy Rezerwacji na trwałe.
   */
  exceeded: LimitOverride[]
}

/**
 * Wszystko, co orzeka o ręcznym wpisie. Ten sam kształt, co przy zgłoszeniu
 * z Widgetu — dane są te same, różni się wyłącznie osąd — z jedną różnicą:
 * Osi wolno tu nie być.
 *
 * Wolno, bo dwie drogi dochodzą do tego samego zdania „nie ma takiej Osi"
 * i mają je mówić tak samo: w Panelu Oś znika z listy między odczytem
 * a kliknięciem, a w Edge Function baza nie przypisuje jej tej Strzelnicy
 * (ADR 0010). Osąd o tym zostaje więc tutaj — orzeczenie napisane w ekranie
 * byłoby drugą kopią odmowy, tą, która rozjedzie się z pierwszą.
 */
export type ManualBookingCheck = Omit<BookingCheck, 'lane'> & {
  lane: Lane | undefined
}

export function manualBookingReview({
  draft,
  lane,
  block,
  ammunitionKinds,
}: ManualBookingCheck): ManualBookingReview {
  const problems: ManualBookingProblem[] = []
  const exceeded: LimitOverride[] = []

  // Bez Osi nie ma o czym dalej orzekać: pojemności nie ma z czym zestawić,
  // a termin bez rozkładu Osi nie jest ani zajęty, ani wolny. Jedno zdanie
  // zamiast dwóch — „nie ma takiej Osi" i „nie ma takiego terminu" naraz
  // kazałyby obsłudze szukać dwóch pomyłek tam, gdzie jest jedna.
  if (!lane) return { problems: ['nieznana-os'], exceeded: [] }

  if (!block) {
    // Blok, którego rozkład Osi nie zna — termin nigdy niewystawiony. Nie jest
    // ani zajęty, ani przekroczeniem czegokolwiek: nie ma go.
    problems.push('termin-niedostepny')
  } else {
    // Wszystkie powody, a nie pierwszy z brzegu (`Block.refusals`): powód, za
    // którym schował się drugi, znaczyłby wpis przyjęty na termin, który już
    // minął — bo minięcie stanęło za godzinami otwarcia.
    for (const powod of block.refusals) {
      const czytanie = TERM_READING[powod]
      if (jestPrzekroczeniem(czytanie)) exceeded.push(czytanie)
      // Dwa powody schodzące do jednego zdania mówią je raz. Zdarza się:
      // dzień za horyzontem bywa zarazem terminem poniżej wyprzedzenia.
      else if (!problems.includes(czytanie)) problems.push(czytanie)
    }
  }

  // Reguła o liczbie Uczestników jest jedna (`participantsProblem`), a reakcje
  // na jej odpowiedź dwie: skład ponad pojemność Osi jest tu limitem do
  // przekroczenia, a skład zerowy albo ułamkowy zostaje odmową — pół osoby na
  // Osi nie jest odstępstwem, o którym Strzelnica wie więcej niż system.
  const uczestnicy = participantsProblem(draft, lane)
  if (uczestnicy === 'ponad-pojemnosc-osi') exceeded.push(uczestnicy)
  else if (uczestnicy) problems.push(uczestnicy)

  problems.push(...draftProblems({ draft, ammunitionKinds }))

  return {
    problems,
    // Porządek z `LIMIT_OVERRIDES`, a nie z kolejności sprawdzeń: dwa
    // jednakowe wpisy mają zostać w bazie odnotowane jednakowo.
    exceeded: LIMIT_OVERRIDES.filter((limit) => exceeded.includes(limit)),
  }
}

/**
 * Limity przekraczane bez potwierdzenia. Pyta o to serwer, zanim cokolwiek
 * zapisze: pytanie o pewność zadał ekran, ale odpowiedź na nie przyjechała
 * z przeglądarki, a między jednym a drugim Pula instruktorów bywa już zajęta
 * przez klienta — i wtedy wpis przekracza limit, o którym nikogo nie zapytano.
 *
 * Wynikiem jest lista, a nie samo „tak" albo „nie", bo o to właśnie pyta się
 * tej funkcji: **które** to limity. Odmowa serwera nazywa je odtąd zbiorczo
 * (`niepotwierdzone-przekroczenie`), ale ekran wypisujący je z osobna nie ma
 * czego dokładać, a odpowiedź zwężona do wartości logicznej trzeba by odkręcać
 * przy pierwszym takim zdaniu.
 *
 * Potwierdzenie limitu, którego wpis nie przekracza, nie jest tu błędem
 * i przechodzi bez śladu: przy Rezerwacji zostaje `exceeded`, czyli to, co
 * naprawdę policzył serwer, a nie to, na co ktoś przystał.
 */
export function unconfirmedOverrides(
  exceeded: readonly LimitOverride[],
  confirmed: readonly LimitOverride[],
): LimitOverride[] {
  return exceeded.filter((limit) => !confirmed.includes(limit))
}

/**
 * Żądanie ręcznego wpisu. Zgłoszenie i termin są te same, co w żądaniu
 * z Widgetu; różnica jest jedna po każdej stronie. Tam dochodzi Strzelnica
 * wskazana slugiem — tu jej nie ma i mieć nie może: o to, czyj jest ten Panel,
 * pyta się konta, a nie tego, kto prosi (ADR 0010). Zamiast niej dochodzą
 * potwierdzone przekroczenia.
 */
export type ManualBookingRequest = BookingDraft &
  BookingTerm & {
    /**
     * Limity, których przekroczenie Użytkownik panelu potwierdził. Nie są tym,
     * co zostanie odnotowane — tym jest osąd serwera. Są zgodą na to, żeby
     * odnotował.
     */
    overrides: readonly LimitOverride[]
  }

/**
 * Potwierdzone przekroczenia z żądania. Brak pola jest błędem kształtu, a nie
 * pustą listą — tak samo jak przy Wypożyczeniach: wpis bez przekroczeń mówi
 * o tym wprost pustą tablicą, żeby potwierdzenie zgubione po drodze nie
 * zamieniło się w ciszę, na którą serwer odmawia bez zrozumiałego powodu.
 *
 * Nazwa spoza zbioru jest błędem kształtu, a nie potwierdzeniem niczego: lista
 * przychodzi z naszego własnego ekranu, więc limit, którego ta domena nie zna,
 * znaczy pomyłkę w kodzie — i lepiej, żeby stanęła tutaj, niż na typie kolumny.
 */
function readOverrides(source: Record<string, unknown>): LimitOverride[] {
  const overrides = source.overrides
  if (!Array.isArray(overrides)) {
    throw new MalformedBookingRequestError('pole overrides nie jest listą')
  }

  return overrides.map((wartosc: unknown) => {
    if (typeof wartosc !== 'string' || !jestPrzekroczeniem(wartosc)) {
      throw new MalformedBookingRequestError(
        `pole overrides niesie limit, którego nie ma: ${String(wartosc)}`,
      )
    }
    return wartosc
  })
}

/**
 * Żądanie odczytane z sieci albo wyjątek. Sprawdzamy tu wyłącznie kształt —
 * czy da się z tego zbudować `ManualBookingRequest`. O tym, czy wolno je
 * przyjąć, orzeka `manualBookingReview` na danych Strzelnicy, których ten
 * odczyt nie zna.
 *
 * Wyjątek ten sam, co przy żądaniu z Widgetu (`MalformedBookingRequestError`),
 * bo niepowodzenie jest to samo: to nie ma kształtu żądania Rezerwacji. Druga
 * klasa dla tej samej wiadomości kazałaby każdej skorupie rozpoznawać obie.
 */
export function readManualBookingRequest(value: unknown): ManualBookingRequest {
  const source = readRequestBody(value)

  return {
    ...readBookingDraft(source),
    ...readBookingTerm(source),
    overrides: readOverrides(source),
  }
}

/**
 * Wynik próby wpisania Rezerwacji. Przyjęta wraca z Kwotą — tą zapisaną, jak
 * przy zgłoszeniu z Widgetu — i z listą odnotowanych przekroczeń: obsługa ma
 * zobaczyć, co właśnie zostało zapisane przy tej Rezerwacji, a nie domyślać się
 * tego z tego, na co przystała.
 */
export type ManualBookingOutcome =
  | { ok: true; id: string; amount: number; overrides: readonly LimitOverride[] }
  | { ok: false; problem: ManualBookingProblem }
