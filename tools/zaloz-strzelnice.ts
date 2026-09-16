/**
 * Zakładanie Strzelnicy — jedno polecenie operatora platformy.
 *
 *   pnpm zaloz-strzelnice --identyfikator=strzelnica-nowa \
 *     --nazwa="Strzelnica Nowa" --email=obsluga@strzelnica-nowa.example.pl
 *
 * Panelu administracyjnego nie ma i nie będzie, a samodzielnej rejestracji tym
 * bardziej (ADR 0001, `enable_signup = false` w `supabase/config.toml`): nowa
 * Strzelnica wraz z pierwszym kontem do Panelu powstaje tędy i wyłącznie tędy
 * (spec, historia 60).
 *
 * Skrypt zakłada **pustą** Strzelnicę: wiersz `facilities` z nazwą,
 * identyfikatorem i wartościami domyślnymi schematu — w tym regułami czasowymi
 * opisującymi typową Strzelnicę (30 dni horyzontu, 2 godziny wyprzedzenia,
 * doba na anulowanie). Osi, rozkładu Bloków, godzin otwarcia, cennika,
 * katalogów ani dozwolonych domen nie wpisuje: wszystko to ustawia się
 * z Panelu, a polecenie z dwudziestoma przełącznikami byłoby panelem
 * administracyjnym napisanym w wierszu poleceń.
 *
 * Reguły — kształt argumentów, zastrzeżenia do nich i hasło — mieszkają
 * w `packages/shared/src/provisioning.ts` i są tam pokryte testami. Tutaj jest
 * wyłącznie to, czego czystą funkcją być nie może: klucz serwisowy, sieć
 * i kolejność zapisów.
 *
 * Zapis idzie rolą serwisową, bo inaczej iść nie może: klucz anonimowy nie ma
 * do `facilities` prawa zapisu i mieć go nie będzie (ADR 0009), a konta
 * w Supabase Auth zakłada wyłącznie API administracyjne. Jest to jedyne
 * miejsce w repozytorium poza Edge Functions, które tej roli używa — i jedyne
 * uruchamiane ręką człowieka.
 *
 * Idempotencji nie ma i jest to decyzja: przy istniejącym identyfikatorze
 * skrypt **odmawia** i nie zmienia ani jednego wiersza. Drugie uruchomienie
 * bywa pomyłką operatora, a „doprowadzenie do stanu z polecenia" znaczyłoby
 * dla Strzelnicy działającej od pół roku nadpisanie jej nazwy i dopisanie
 * drugiego konta — ciszej, niż powinno.
 *
 * Zapisów jest trzy — Strzelnica, konto, powiązanie — i nie idą jedną
 * transakcją, bo dwa z nich idą przez różne API. Potknięcie w drugim albo
 * trzecim cofa więc to, co skrypt zdążył założyć: inaczej zostawałaby
 * Strzelnica bez konta, której nie da się założyć po raz drugi, bo
 * identyfikator jest już zajęty.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import {
  MalformedProvisioningArgumentsError,
  MissingSupabaseConfigError,
  PANEL_PASSWORD_BYTES,
  panelPassword,
  provisioningProblems,
  readEnvFile,
  readProvisioningArguments,
  readServiceConfig,
} from '../packages/shared/src/index.ts'
import type {
  ProvisioningDraft,
  ProvisioningProblem,
  ServiceConfig,
} from '../packages/shared/src/index.ts'

const SPOSOB_UZYCIA = `Sposób użycia:

  pnpm zaloz-strzelnice --identyfikator=<slug> --nazwa="<nazwa>" --email=<adres> [--haslo=<hasło>]

  --identyfikator  identyfikator w adresie Widgetu i w znaczniku osadzenia
                   (małe litery, cyfry i myślniki)
  --nazwa          nazwa Strzelnicy pokazywana klientowi
  --email          adres pierwszego konta Panelu
  --haslo          hasło tego konta; pominięte znaczy: wylosuj i wypisz`

/** Co znaczy każde zastrzeżenie — po polsku, bo czyta to człowiek. */
const ZASTRZEZENIA: Record<ProvisioningProblem, string> = {
  'zly-identyfikator':
    'Identyfikator ma być złożony z małych liter, cyfr i pojedynczych myślników między nimi.',
  'brak-nazwy': 'Nazwa Strzelnicy jest pusta.',
  'niepoprawny-email': 'Adres pierwszego konta nie jest adresem e-mail.',
  'za-krotkie-haslo': 'Hasło jest krótsze, niż przyjmuje Supabase Auth.',
}

/** Plik `.env` z korzenia repozytorium — ten, który pisze `pnpm db:env`. */
const KORZEN_ENV = new URL('../.env', import.meta.url)

/**
 * Środowisko: plik `.env` uzupełniony zmiennymi procesu. Zmienna podana
 * w powłoce wygrywa z plikiem — tak samo jak w testach przeglądarkowych i tak,
 * jak trzeba przy zakładaniu Strzelnicy na produkcji, gdzie pliku nie ma wcale.
 */
function srodowisko(): Record<string, string | undefined> {
  let plik: Record<string, string | undefined> = {}
  try {
    plik = readEnvFile(readFileSync(KORZEN_ENV, 'utf8'))
  } catch {
    // Brak pliku nie jest błędem: zmienne mogą stać w środowisku procesu.
  }
  return { ...plik, ...process.env }
}

/**
 * Odpowiedź, która nie jest odpowiedzią. Niesie kod, bo po nim poznaje się
 * odmowę **dziedzinową** — zajęty adres konta — i odróżnia ją od awarii.
 */
class BladZadania extends Error {
  /** Pola przypisane w ciele, a nie skrótem w nagłówku konstruktora: Node
   * uruchamia ten plik, zdejmując z niego typy, a skrótu zdjąć nie umie. */
  status: number
  tresc: string

  constructor(status: number, gdzie: string, tresc: string) {
    super(`${gdzie} odpowiedziało kodem ${status}: ${tresc}`)
    this.name = 'BladZadania'
    this.status = status
    this.tresc = tresc
  }

  /**
   * Czy GoTrue odmówił, bo adres należy już do innego konta. Pytamy o treść,
   * a nie o sam kod: 422 jest kodem tej odmowy w wydaniu, na którym pracujemy,
   * ale starsze odpowiadają na to samo kodem 400 — a wtedy operator dostałby
   * surową odpowiedź API zamiast zdania po polsku. Hasło za krótkie tędy nie
   * przejdzie: odsiewa je `provisioningProblems`, zanim cokolwiek pójdzie
   * w sieć.
   */
  oZajetymAdresie(): boolean {
    return (
      (this.status === 400 || this.status === 422) && /registered|already exists/i.test(this.tresc)
    )
  }
}

async function odmowa(gdzie: string, odpowiedz: Response): Promise<BladZadania> {
  return new BladZadania(odpowiedz.status, gdzie, await odpowiedz.text())
}

/** Zapytanie do PostgREST-a rolą serwisową. */
async function baza<T>(config: ServiceConfig, sciezka: string, init: RequestInit = {}): Promise<T> {
  const odpowiedz = await fetch(new URL(`/rest/v1/${sciezka}`, config.url), {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  })
  if (!odpowiedz.ok) throw await odmowa('PostgREST', odpowiedz)
  return (await odpowiedz.json()) as T
}

/**
 * Żądanie do API administracyjnego Supabase Auth. Konto Panelu powstaje tędy,
 * a nie wpisem do `auth.users`: GoTrue trzyma obok wiersza konta wiersz
 * tożsamości dostawcy „email" i komplet pustych tokenów jednorazowych, a konto
 * złożone bez nich odmawia wpuszczenia mimo poprawnego hasła. Seed pracy
 * lokalnej wpisuje je ręcznie i wypisuje przy tym wszystkie trzy pułapki —
 * tutaj nie ma powodu ich powtarzać.
 */
async function auth<T>(config: ServiceConfig, sciezka: string, init: RequestInit = {}): Promise<T> {
  const odpowiedz = await fetch(new URL(`/auth/v1/${sciezka}`, config.url), {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!odpowiedz.ok) throw await odmowa('Supabase Auth', odpowiedz)
  return (await odpowiedz.json()) as T
}

/** Czy Strzelnica o tym identyfikatorze już stoi w bazie. */
async function juzIstnieje(config: ServiceConfig, slug: string): Promise<boolean> {
  const wiersze = await baza<{ id: string }[]>(
    config,
    `facilities?slug=eq.${encodeURIComponent(slug)}&select=id`,
  )
  return wiersze.length > 0
}

/**
 * Identyfikator zajęty przez inną Strzelnicę. Pada w dwóch miejscach i jest to
 * ta sama odmowa: raz z pytania zadanego przed zapisem — żeby nie zakładać
 * konta pod Strzelnicę, która i tak nie wejdzie — raz z samego zapisu, gdy
 * między jednym a drugim ktoś zdążył ten identyfikator zająć. Rozstrzyga
 * jedyność kolumny `facilities.slug`, a pytanie wcześniej jest wyłącznie po to,
 * żeby powiedzieć operatorowi, co jest nie tak.
 */
class ZajetyIdentyfikatorError extends Error {
  constructor(slug: string) {
    super(
      `Strzelnica o identyfikatorze „${slug}" już istnieje. Nic nie zostało zmienione.\n` +
        'Podaj inny identyfikator albo zmieniaj tę Strzelnicę z Panelu.',
    )
    this.name = 'ZajetyIdentyfikatorError'
  }
}

/**
 * Adres zajęty przez inne konto. GoTrue odmawia wtedy kodem 422 — a jest to
 * odmowa dziedzinowa, nie awaria: operator ma przeczytać, że tym adresem ktoś
 * już się loguje, a nie surową odpowiedź API.
 */
class ZajetyAdresError extends Error {
  constructor(email: string) {
    super(
      `Konto o adresie „${email}" już istnieje. Nic nie zostało zmienione.\n` +
        'Podaj inny adres — jedno konto Panelu należy do jednej Strzelnicy.',
    )
    this.name = 'ZajetyAdresError'
  }
}

/**
 * Trzy zapisy w kolejności od najłatwiej odkręcalnego: konto, Strzelnica,
 * powiązanie. Konto idzie pierwsze, bo o zajętym adresie dowiadujemy się
 * dopiero od GoTrue — a próba zrobiona po założeniu Strzelnicy kazałaby ją
 * kasować, żeby operator mógł powtórzyć polecenie z poprawionym adresem.
 *
 * Potknięcie po drodze cofa to, co już stanęło. Inaczej zostawałaby Strzelnica
 * bez konta — nie do założenia po raz drugi, bo identyfikator jest zajęty,
 * i nie do wejścia z Panelu, bo nie ma czym.
 */
async function zaloz(
  config: ServiceConfig,
  draft: ProvisioningDraft,
  haslo: string,
): Promise<void> {
  let konto: { id: string }
  try {
    konto = await auth<{ id: string }>(config, 'admin/users', {
      method: 'POST',
      // Adres potwierdzony z góry: potwierdza go operator, zakładając konto
      // komuś, z kim rozmawiał. Listu powitalnego nie ma czym odebrać —
      // skrzynka Strzelnicy nie jest naszą skrzynką.
      body: JSON.stringify({ email: draft.email, password: haslo, email_confirm: true }),
    })
  } catch (blad) {
    if (blad instanceof BladZadania && blad.oZajetymAdresie()) {
      throw new ZajetyAdresError(draft.email)
    }
    throw blad
  }

  let strzelnica: { id: string } | undefined
  try {
    ;[strzelnica] = await baza<{ id: string }[]>(config, 'facilities', {
      method: 'POST',
      body: JSON.stringify({ slug: draft.slug, name: draft.name }),
    })
    if (!strzelnica) throw new Error('Baza przyjęła Strzelnicę, ale nie oddała jej numeru.')

    await baza(config, 'panel_users', {
      method: 'POST',
      body: JSON.stringify({ user_id: konto.id, facility_id: strzelnica.id }),
    })
  } catch (blad) {
    await posprzataj(config, { facilityId: strzelnica?.id ?? null, userId: konto.id })
    // Naruszenie jedyności `slug` — PostgREST kwituje je kodem 409 — to nie
    // awaria, tylko ta sama odmowa, którą wypisuje pytanie przed zapisem.
    // Tędy przechodzi wyłącznie identyfikator zajęty **w międzyczasie**.
    throw blad instanceof BladZadania && blad.status === 409
      ? new ZajetyIdentyfikatorError(draft.slug)
      : blad
  }
}

/**
 * Cofnięcie tego, co skrypt zdążył założyć w tym przebiegu. Kasuje wyłącznie
 * własne wiersze — Strzelnica jest tu pusta i świeża, więc nie ma w niej ani
 * Rezerwacji, ani niczego, co ktoś zdążyłby wpisać.
 */
async function posprzataj(
  config: ServiceConfig,
  co: { facilityId: string | null; userId: string },
): Promise<void> {
  // Każde kasowanie we własnym `try`: nieudane pierwsze nie ma powodu
  // zabierać ze sobą drugiego, a zostawione konto jest tu gorszą pozostałością
  // niż pusta Strzelnica — zajmuje adres, którym operator chciałby powtórzyć
  // polecenie.
  if (co.facilityId) {
    await skasuj(`Strzelnica ${co.facilityId}`, () =>
      baza(config, `facilities?id=eq.${co.facilityId}`, { method: 'DELETE' }),
    )
  }
  await skasuj(`konto ${co.userId}`, () =>
    auth(config, `admin/users/${co.userId}`, { method: 'DELETE' }),
  )
}

/**
 * Kasowanie, którego niepowodzenie nie przesłania błędu, przez który
 * sprzątamy: operator ma zobaczyć, co naprawdę poszło nie tak, a wiersz,
 * którego nie udało się usunąć, wypisuje się obok jako osobne zdanie — razem
 * z numerem, bo bez niego nikt go nie znajdzie.
 */
async function skasuj(co: string, kasowanie: () => Promise<unknown>): Promise<void> {
  try {
    await kasowanie()
  } catch (blad) {
    console.error(
      `Nie udało się posprzątać po nieudanym zakładaniu — zostaje do skasowania ${co}: ${opis(blad)}`,
    )
  }
}

function opis(blad: unknown): string {
  return blad instanceof Error ? blad.message : String(blad)
}

/** Wiersz podsumowania: nazwa pola i wartość, wyrównane do jednej kolumny. */
function wierszPodsumowania(nazwa: string, wartosc: string): string {
  return `  ${nazwa.padEnd(14)}${wartosc}`
}

async function main(): Promise<number> {
  let draft: ProvisioningDraft
  try {
    draft = readProvisioningArguments(process.argv.slice(2))
  } catch (blad) {
    if (!(blad instanceof MalformedProvisioningArgumentsError)) throw blad
    console.error(`${blad.message}\n\n${SPOSOB_UZYCIA}`)
    return 1
  }

  const zastrzezenia = provisioningProblems(draft)
  if (zastrzezenia.length > 0) {
    console.error('Strzelnicy nie da się założyć:')
    for (const zastrzezenie of zastrzezenia) console.error(`  — ${ZASTRZEZENIA[zastrzezenie]}`)
    console.error(`\n${SPOSOB_UZYCIA}`)
    return 1
  }

  let config: ServiceConfig
  try {
    config = readServiceConfig(srodowisko())
  } catch (blad) {
    if (!(blad instanceof MissingSupabaseConfigError)) throw blad
    console.error(blad.message)
    return 1
  }

  if (await juzIstnieje(config, draft.slug)) throw new ZajetyIdentyfikatorError(draft.slug)

  // Losowość bierze się tutaj, a samo hasło składa czysta funkcja: generator
  // jest jedyną rzeczą w tym rachunku, której nie da się sprawdzić testem.
  const wylosowane = draft.password === null
  const haslo = draft.password ?? panelPassword(randomBytes(PANEL_PASSWORD_BYTES))

  await zaloz(config, draft, haslo)

  console.log('Strzelnica założona.\n')
  console.log(wierszPodsumowania('Identyfikator', draft.slug))
  console.log(wierszPodsumowania('Nazwa', draft.name))
  console.log(wierszPodsumowania('Konto Panelu', draft.email))
  if (wylosowane) {
    console.log(wierszPodsumowania('Hasło', haslo))
    console.log(
      '\nHasła nie da się odzyskać ani zmienić z Panelu — przekaż je Strzelnicy tak,\n' +
        'jak przekazuje się hasła, i zachowaj do czasu, aż potwierdzi, że weszła.',
    )
  }
  console.log(
    '\nDalej Strzelnica ustawia z Panelu wszystko, co jej: Osie i rozkład Bloków,\n' +
      'godziny otwarcia, cennik z Pulą instruktorów i regułami czasowymi, katalogi\n' +
      'broni i amunicji oraz domeny, na których wolno osadzić jej Widget.',
  )

  return 0
}

/**
 * Awaria wypisana zdaniem, a nie stosem wywołań: po drugiej stronie stoi
 * operator platformy w terminalu, a nie ten, kto pisał ten plik. Odmowy
 * dziedzinowe — zajęty identyfikator, zajęty adres — idą tą samą drogą, bo dla
 * czytającego różnica jest żadna: polecenie nie przeszło i nic się nie zmieniło.
 */
try {
  process.exitCode = await main()
} catch (blad) {
  console.error(opis(blad))
  process.exitCode = 1
}
