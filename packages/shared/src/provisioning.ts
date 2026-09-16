/**
 * Zakładanie Strzelnicy przez **operatora platformy**: to, co da się rozstrzygnąć,
 * zanim cokolwiek trafi do bazy — odczytanie argumentów polecenia, zastrzeżenia
 * do nich i hasło pierwszego konta Panelu.
 *
 * Panelu administracyjnego nie ma i nie będzie (ADR 0001), a samodzielnej
 * rejestracji tym bardziej: nową Strzelnicę zakłada jedno polecenie operatora
 * (spec, historia 60). Tutaj stoi cała jego treść poza samym zapisem — sam
 * zapis idzie przez `tools/zaloz-strzelnice.ts`, bo wymaga klucza serwisowego
 * i sieci, a te nie należą do reguł.
 *
 * Czyste funkcje, jak przy konfiguracji Strzelnicy, godzinach i katalogach:
 * pomyłka w poleceniu ma wrócić nazwanym zastrzeżeniem, zanim w bazie stanie
 * wiersz, który ktoś będzie musiał posprzątać.
 *
 * Czego tu nie ma: pytania, czy Strzelnica o tym identyfikatorze już istnieje.
 * To jest pytanie do bazy — odpowiada na nie jedyność kolumny `facilities.slug`
 * — a nie do napisu.
 */

/**
 * Najdłuższy identyfikator, jaki przyjmujemy. Nie bierze się z domeny, tylko
 * z tego, czym identyfikator jest: parametrem adresu ramki (`?strzelnica=…`)
 * wklejanym na cudzą stronę razem ze znacznikiem osadzenia. Kolumna `slug`
 * jest tekstem bez granicy, więc granica jest tu powiedziana wprost — tak samo
 * jak `MAX_TERMS_LENGTH` przy regulaminie.
 */
export const MAX_FACILITY_SLUG_LENGTH = 64

/**
 * Kształt identyfikatora: małe litery, cyfry i pojedyncze myślniki między
 * nimi. Wąsko, a nie „cokolwiek da się zakodować w adresie": identyfikator
 * jedzie do znacznika, który Strzelnica wkleja u siebie na stronie i czyta
 * oczami, a `strzelnica%20nowa` czyta się źle i pisze jeszcze gorzej. Ogonków
 * nie ma z tego samego powodu.
 */
export const FACILITY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Najkrótsze hasło, jakie przyjmujemy do pierwszego konta. Nie jest regułą
 * domeny, tylko granicą Supabase Auth powiedzianą po naszej stronie: hasło
 * odrzucone dopiero przez GoTrue wracałoby po tym, jak Strzelnica stoi już
 * w bazie i zostaje do posprzątania. Wyższe niż domyślne sześć znaków GoTrue,
 * bo to konto widzi dane osobowe wszystkich klientów Strzelnicy.
 */
export const MIN_PANEL_PASSWORD_LENGTH = 12

/**
 * Wypełnione polecenie operatora — i zarazem to, co idzie do bazy. Jeden
 * kształt na oba, tak samo jak `FacilityConfigDraft`: nie ma tu czego po
 * drodze przerabiać.
 *
 * Konfiguracji Strzelnicy nie ma tu ani jednego pola i nie jest to
 * przeoczenie: cennik, Pula, reguły czasowe, godziny, Osie i katalogi
 * ustawia się z Panelu, a wartości domyślne schematu opisują typową
 * Strzelnicę. Polecenie z dwudziestoma przełącznikami byłoby panelem
 * administracyjnym napisanym w wierszu poleceń — tym, czego ADR 0001
 * świadomie nie chce.
 */
export type ProvisioningDraft = {
  /** Identyfikator Strzelnicy — ten sam, który stoi w znaczniku osadzenia. */
  slug: string
  /** Nazwa Strzelnicy, pokazywana w Widgecie i w Panelu. */
  name: string
  /** Adres pierwszego konta Panelu; on jest nazwą konta przy logowaniu. */
  email: string
  /** Hasło tego konta; puste znaczy „wylosuj", a nie „konto bez hasła". */
  password: string | null
}

/** Dlaczego Strzelnicy nie da się założyć. */
export type ProvisioningProblem =
  /** Identyfikator nie nadaje się na parametr adresu ramki. */
  | 'zly-identyfikator'
  /** Nazwa pusta — Strzelnica bez nazwy nie ma czym się przedstawić klientowi. */
  | 'brak-nazwy'
  /** Adres pierwszego konta nie jest adresem e-mail. */
  | 'niepoprawny-email'
  /** Hasło podane przez operatora krótsze, niż przyjmuje Supabase Auth. */
  | 'za-krotkie-haslo'

/**
 * Adres e-mail sprawdzany zgrubnie: coś, małpa, coś z kropką. Ta sama miara,
 * co przy Osobie rezerwującej — i z tego samego powodu: ostrzejszy wzorzec
 * odrzucałby adresy, które istnieją, a i tak nie dowiódłby, że adresat odbiera.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Wszystkie zastrzeżenia naraz, w kolejności argumentów polecenia — tak samo
 * jak przy cenniku, Osi i katalogach: operator ma zobaczyć całą listę poprawek
 * za jednym razem, a nie odkrywać je pojedynczo przy kolejnych przebiegach.
 */
export function provisioningProblems(draft: ProvisioningDraft): ProvisioningProblem[] {
  const problems: ProvisioningProblem[] = []

  if (
    draft.slug.length > MAX_FACILITY_SLUG_LENGTH ||
    !FACILITY_SLUG_PATTERN.test(draft.slug)
  ) {
    problems.push('zly-identyfikator')
  }
  if (draft.name.trim() === '') problems.push('brak-nazwy')
  if (!EMAIL_PATTERN.test(draft.email)) problems.push('niepoprawny-email')
  if (draft.password !== null && draft.password.length < MIN_PANEL_PASSWORD_LENGTH) {
    problems.push('za-krotkie-haslo')
  }

  return problems
}

export class MalformedProvisioningArgumentsError extends Error {
  constructor(message: string) {
    super(`Polecenie ma zły kształt: ${message}`)
    this.name = 'MalformedProvisioningArgumentsError'
  }
}

/** Nazwy argumentów w postaci, w jakiej operator je pisze. */
const IDENTYFIKATOR = '--identyfikator'
const NAZWA = '--nazwa'
const EMAIL = '--email'
const HASLO = '--haslo'

const ARGUMENTY = [IDENTYFIKATOR, NAZWA, EMAIL, HASLO] as const

/**
 * Polecenie odczytane z wiersza poleceń albo wyjątek. Sprawdzamy tu wyłącznie
 * kształt — czy da się z tego zbudować `ProvisioningDraft`. O tym, czy wolno
 * je przyjąć, orzeka `provisioningProblems`: identyfikator z wielkiej litery
 * przechodzi więc tędy bez słowa, bo ma wrócić nazwanym zastrzeżeniem, a nie
 * odmową „zły kształt". Ta sama decyzja, co przy żądaniach z sieci.
 *
 * Obie pisownie argumentu — `--nazwa=Nowa` i `--nazwa Nowa` — bo obie są
 * naturalne, a nazwa Strzelnicy niemal zawsze ma w sobie spację. Wartość po
 * znaku równości bierze się dosłownie, więc hasło zaczynające się od myślnika
 * jest hasłem, a nie nazwą argumentu.
 *
 * Argument powtórzony jest odmową, a nie wzięciem ostatniego: cicha wygrana
 * ostatniego znaczyłaby Strzelnicę założoną pod identyfikatorem innym niż ten,
 * który operator przeczytał we własnym poleceniu.
 */
export function readProvisioningArguments(argv: readonly string[]): ProvisioningDraft {
  const wartosci = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string
    const znakRownosci = argument.indexOf('=')
    const nazwa = znakRownosci === -1 ? argument : argument.slice(0, znakRownosci)

    if (!ARGUMENTY.includes(nazwa as (typeof ARGUMENTY)[number])) {
      throw new MalformedProvisioningArgumentsError(
        argument.startsWith('--')
          ? `nieznany argument ${nazwa}`
          : `wartość ${argument} bez nazwy argumentu`,
      )
    }
    if (wartosci.has(nazwa)) {
      throw new MalformedProvisioningArgumentsError(`argument ${nazwa} podany dwa razy`)
    }

    if (znakRownosci !== -1) {
      wartosci.set(nazwa, argument.slice(znakRownosci + 1))
      continue
    }

    const nastepny = argv[index + 1]
    if (nastepny === undefined || nastepny.startsWith('--')) {
      throw new MalformedProvisioningArgumentsError(`argument ${nazwa} jest bez wartości`)
    }
    wartosci.set(nazwa, nastepny)
    index += 1
  }

  return {
    slug: wymagany(wartosci, IDENTYFIKATOR),
    name: wymagany(wartosci, NAZWA),
    email: wymagany(wartosci, EMAIL),
    password: wartosci.get(HASLO)?.trim() ?? null,
  }
}

/** Wartość argumentu albo wyjątek mówiący, którego brakuje. */
function wymagany(wartosci: Map<string, string>, nazwa: string): string {
  const wartosc = wartosci.get(nazwa)
  if (wartosc === undefined) {
    throw new MalformedProvisioningArgumentsError(`brak argumentu ${nazwa}`)
  }
  return wartosc.trim()
}

/**
 * Ile losowych bajtów zużywa hasło. Szesnaście bajtów po pięć bitów to
 * osiemdziesiąt bitów losowości — więcej, niż potrzeba hasłu, które służy do
 * pierwszego wejścia i zwykle zostaje potem zmienione.
 */
export const PANEL_PASSWORD_BYTES = 16

/**
 * Alfabet hasła: małe litery i cyfry bez tych, które mylą się przy dyktowaniu
 * — bez „l" i „1", bez „o" i „0". Trzydzieści dwa znaki, czyli dokładnie
 * dzielnik dwustu pięćdziesięciu sześciu: każdy znak wypada z bajtu tak samo
 * często, więc reszta z dzielenia niczego tu nie przechyla.
 */
const ALFABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** Co ile znaków hasło rozdziela się myślnikiem — żeby dało się je przepisać. */
const GRUPA = 4

/**
 * Hasło pierwszego konta z losowych bajtów. Losowość jest **parametrem**, a nie
 * odczytem generatora w środku: tak samo jak „teraz" w regułach domeny. Dzięki
 * temu ta funkcja daje się sprawdzić co do znaku, a jedyne miejsce, w którym
 * kryptograficzny generator jest naprawdę potrzebny, stoi w skrypcie.
 *
 * Hasło wypisuje się operatorowi raz, więc jego kształt jest kształtem rzeczy
 * przepisywanej ręką albo dyktowanej głosem — stąd alfabet bez znaków mylących
 * i myślniki co cztery znaki.
 */
export function panelPassword(bytes: Uint8Array): string {
  if (bytes.length < PANEL_PASSWORD_BYTES) {
    throw new Error(`Hasło potrzebuje ${PANEL_PASSWORD_BYTES} losowych bajtów, a dostało ${bytes.length}.`)
  }

  const znaki = Array.from(bytes.slice(0, PANEL_PASSWORD_BYTES), (bajt) =>
    ALFABET.charAt(bajt % ALFABET.length),
  )

  return znaki
    .reduce<string[]>((grupy, znak, index) => {
      if (index % GRUPA === 0) grupy.push('')
      grupy[grupy.length - 1] += znak
      return grupy
    }, [])
    .join('-')
}
