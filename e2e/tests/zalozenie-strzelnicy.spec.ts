import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { zalogujDoPanelu, ZIMNY_START_MS } from './pomocniki.js'
import { authAdmin, baza } from './srodowisko.js'

/**
 * Zakładanie Strzelnicy skryptem operatora platformy — droga od jednego
 * polecenia w terminalu do Panelu, w którym Strzelnica ustawia sobie wszystko
 * sama. Spec, historia 60; panelu administracyjnego i rejestracji nie ma
 * i nie będzie (ADR 0001).
 *
 * Czego czysta funkcja z definicji nie zobaczy: że konto założone przez API
 * administracyjne naprawdę wchodzi do Panelu (konto bez wiersza tożsamości
 * dostawcy „email" odmawia wpuszczenia mimo poprawnego hasła), że widzi
 * dokładnie jedną Strzelnicę — swoją, pustą — i że da się ją z tego miejsca
 * skonfigurować bez zaglądania do bazy.
 *
 * Czego tu nie ma, bo jest pokryte w `packages/shared`: kształtu argumentów,
 * zastrzeżeń do nich i samego hasła.
 *
 * Skrypt uruchamiamy wprost Node'em, a nie przez `pnpm zaloz-strzelnice`:
 * polecenie pnpm musiałoby na Windowsie przejść przez powłokę, a nazwa
 * Strzelnicy ma w sobie spację i ogonki. Jest to ta sama komenda — tyle że bez
 * pośrednika, który potrafi ją po drodze przepisać.
 */

const KORZEN = fileURLToPath(new URL('../..', import.meta.url))
const SKRYPT = fileURLToPath(new URL('../../tools/zaloz-strzelnice.ts', import.meta.url))

/**
 * Strzelnica zakładana przez ten test — własna, a nie żadna z seeda: to jest
 * test **powstawania**, a Strzelnica z seeda już jest. Sprzątana przed
 * przebiegiem i po nim, bo identyfikator i adres konta są jedyne w bazie,
 * a przebieg przerwany w połowie zostawiłby oba zajęte.
 */
const STRZELNICA = 'strzelnica-zalozona'
const NAZWA = 'Strzelnica Założona'
const OBSLUGA = 'obsluga@strzelnica-zalozona.example.pl'

/** Oś i cennik, które Strzelnica ustawia sobie sama zaraz po założeniu. */
const OS_PIERWSZA = 'Oś pierwsza nowej Strzelnicy'
const STAWKA_UCZESTNICTWA = '35,00'

const uruchom = promisify(execFile)

type Wynik = { kod: number; wyjscie: string }

/**
 * Skrypt uruchomiony z podanymi argumentami. Zwraca kod i wypisaną treść
 * zamiast rzucać: odmowa jest tu odpowiedzią tak samo jak powodzenie, a to
 * właśnie ona ma być czytelna.
 */
async function zalozStrzelnice(...argumenty: string[]): Promise<Wynik> {
  try {
    const { stdout } = await uruchom(
      process.execPath,
      ['--experimental-strip-types', SKRYPT, ...argumenty],
      { cwd: KORZEN },
    )
    return { kod: 0, wyjscie: stdout }
  } catch (blad) {
    const potkniecie = blad as { code?: number; stdout?: string; stderr?: string }
    return { kod: potkniecie.code ?? 1, wyjscie: `${potkniecie.stdout ?? ''}${potkniecie.stderr ?? ''}` }
  }
}

/** Hasło wypisane przez skrypt — jedyne miejsce, w którym w ogóle się pojawia. */
function haslo(wyjscie: string): string {
  const dopasowanie = /Hasło\s+(\S+)/.exec(wyjscie)
  if (!dopasowanie?.[1]) throw new Error(`Skrypt nie wypisał hasła:\n${wyjscie}`)
  return dopasowanie[1]
}

/**
 * Skasowanie Strzelnicy razem z jej kontem. Kolejność jest odwrotna do
 * zakładania: najpierw Strzelnica (jej wiersze schodzą kaskadą), potem konto —
 * powiązanie znika z każdym z nich osobno.
 */
async function posprzataj(): Promise<void> {
  const konta = await baza<{ user_id: string }[]>(
    `panel_users?select=user_id,facilities!inner(slug)&facilities.slug=eq.${STRZELNICA}`,
  )
  await baza(`facilities?slug=eq.${STRZELNICA}`, { method: 'DELETE' })
  for (const konto of konta) {
    await authAdmin(`admin/users/${konto.user_id}`, { method: 'DELETE' })
  }
}

test.beforeAll(posprzataj)
test.afterAll(posprzataj)

// Zapis cennika idzie Edge Function, a ta bywa zimna.
test.slow()

test('skrypt zakłada Strzelnicę z kontem, które konfiguruje ją z Panelu', async ({ page }) => {
  const zalozenie = await zalozStrzelnice(
    `--identyfikator=${STRZELNICA}`,
    `--nazwa=${NAZWA}`,
    `--email=${OBSLUGA}`,
  )
  expect(zalozenie).toMatchObject({ kod: 0 })
  expect(zalozenie.wyjscie).toContain('Strzelnica założona')

  // Reguły czasowe domyślne, a nie wpisane w poleceniu: nowa Strzelnica ma być
  // od pierwszej chwili spójna, a nie czekać, aż ktoś je uzupełni.
  const [wiersz] = await baza<
    { name: string; booking_horizon_days: number; min_lead_minutes: number }[]
  >(`facilities?slug=eq.${STRZELNICA}&select=name,booking_horizon_days,min_lead_minutes`)
  expect(wiersz).toEqual({ name: NAZWA, booking_horizon_days: 30, min_lead_minutes: 120 })

  // Konto wchodzi do Panelu hasłem, które skrypt wypisał — i widzi swoją
  // Strzelnicę, pustą: ani jednej Osi i ani jednej Rezerwacji.
  await zalogujDoPanelu(page, OBSLUGA, haslo(zalozenie.wyjscie))
  await expect(page.getByText(NAZWA)).toBeVisible()
  // Jeden formularz Osi na ekranie, i jest nim ten pusty: Strzelnica nie ma
  // jeszcze ani jednej Osi, więc nie ma czego wypisać nad nim.
  await expect(page.locator('.os-konfiguracja')).toHaveCount(1)

  // I da się ją stąd skonfigurować, bez zaglądania do bazy: Oś idzie jedną
  // drogą zapisu, cennik drugą, a obie pytają bazę o Strzelnicę **konta**.
  const nowa = page.locator('.os-konfiguracja').filter({ hasText: 'Nowa Oś' })
  await nowa.getByLabel('Nazwa').fill(OS_PIERWSZA)
  await nowa.getByLabel('Pojemność (Uczestników)').fill('4')
  await nowa.getByRole('button', { name: 'Dodaj Oś' }).click()
  // Po Osi poznaje się jej własny formularz, a nie komunikat „zapisana":
  // komunikat gaśnie razem z odczytem, który po zapisie odświeża cały ekran.
  await expect(page.locator('.os-konfiguracja').filter({ hasText: OS_PIERWSZA })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  const cennik = page.locator('.konfiguracja').filter({ hasText: 'Cennik i reguły' })
  await cennik.getByLabel('Stawka za uczestnictwo (zł)').fill(STAWKA_UCZESTNICTWA)
  await cennik.getByRole('button', { name: 'Zapisz cennik i reguły' }).click()
  await expect(page.getByText('Cennik i reguły zapisane')).toBeVisible({ timeout: ZIMNY_START_MS })

  // Odczyt od nowa, a nie wiara w „zapisane": jedno i drugie ma wrócić z bazy
  // przypisane do tej Strzelnicy, a nie do którejkolwiek z seeda.
  const [osie, konfiguracja] = await Promise.all([
    baza<{ name: string; capacity: number }[]>(
      `lanes?select=name,capacity,facilities!inner(slug)&facilities.slug=eq.${STRZELNICA}`,
    ),
    baza<{ participation_rate_gr: number }[]>(
      `facilities?slug=eq.${STRZELNICA}&select=participation_rate_gr`,
    ),
  ])
  expect(osie).toMatchObject([{ name: OS_PIERWSZA, capacity: 4 }])
  expect(konfiguracja).toEqual([{ participation_rate_gr: 3500 }])
})

test('drugie polecenie o tym samym identyfikatorze odmawia i niczego nie zmienia', async () => {
  await zalozStrzelnice(`--identyfikator=${STRZELNICA}`, `--nazwa=${NAZWA}`, `--email=${OBSLUGA}`)

  // Ta sama Strzelnica, inna nazwa i inny adres konta: gdyby skrypt cokolwiek
  // dopisywał albo nadpisywał, widać by to było po obu.
  const drugie = await zalozStrzelnice(
    `--identyfikator=${STRZELNICA}`,
    '--nazwa=Nazwa Podmieniona',
    '--email=ktos-inny@strzelnica-zalozona.example.pl',
  )
  expect(drugie.kod).toBe(1)
  expect(drugie.wyjscie).toContain('już istnieje')

  const [wiersz] = await baza<{ name: string }[]>(
    `facilities?slug=eq.${STRZELNICA}&select=name`,
  )
  expect(wiersz).toEqual({ name: NAZWA })

  const konta = await baza<unknown[]>(
    `panel_users?select=user_id,facilities!inner(slug)&facilities.slug=eq.${STRZELNICA}`,
  )
  expect(konta).toHaveLength(1)
})
