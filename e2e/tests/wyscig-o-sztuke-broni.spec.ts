import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  czasBloku,
  OS_KARABINOWA,
  OS_PISTOLETOWA,
  otworzWidget,
  wolnyBlokPoDniach,
  wypelnijFormularz,
  zadeklarujPozwolenie,
  ZIMNY_START_MS,
} from './pomocniki.js'

// Wyścig o ostatnią sztukę Typu broni — siostrzany wobec wyścigu o Blok i z tego
// samego powodu na tym szwie: obie strony pytają o dostępność, obie widzą sztukę
// wolną, a rozstrzyga dopiero zapis. Tyle że rozstrzyga go co innego: Osi
// pilnuje ograniczenie wykluczające, a Puli sztuk — sprawdzenie pod blokadą
// doradczą w `place_booking` (ADR 0003). Czysta funkcja nie widzi ani jednego,
// ani drugiego.
//
// Dwie różne Osie, żeby wyłączność Osi nie rozstrzygnęła wyścigu za Pulę: gdyby
// obie strony celowały w ten sam Blok, przegrany przegrałby o Oś i o broni nie
// dowiedzielibyśmy się niczego.

/** Jedyna sztuka w katalogu seeda — dlatego to o nią jest ten wyścig. */
const JEDYNA_SZTUKA = 'CZ Shadow 2'

/**
 * Dzień na tyle odległy, żeby nie wchodzić w drogę pozostałym testom (te szukają
 * terminu w najbliższym tygodniu) ani Rezerwacji z seeda. Mieści się w horyzoncie
 * trzydziestu dni.
 */
const PIERWSZY_DZIEN = 21
const OSTATNI_DZIEN = 27

async function doPodsumowania(page: Page, blok: Locator, imie: string): Promise<void> {
  await blok.click()
  await wypelnijFormularz(page, {
    uczestnicy: 2,
    imie,
    email: `${imie.toLowerCase()}@example.pl`,
    telefon: '600100200',
    bron: { typ: JEDYNA_SZTUKA, sztuki: 1 },
  })
}

test('dwa zgłoszenia o ostatnią sztukę broni — dokładnie jedno wygrywa', async ({ browser }) => {
  const pierwszy = await browser.newContext()
  const drugi = await browser.newContext()
  const anna = await pierwszy.newPage()
  const borys = await drugi.newPage()

  await otworzWidget(anna)
  await otworzWidget(borys)
  // Pozwolenie zdejmuje z drogi Pulę instruktorów: bez niego jedyny Instruktor
  // Strzelnicy rozstrzygnąłby wyścig, zanim doszłoby do broni.
  await zadeklarujPozwolenie(anna)
  await zadeklarujPozwolenie(borys)

  // Sztuka broni jest wspólna dla całej Strzelnicy, ale zajmuje ją tylko ten,
  // czyj termin nachodzi na cudzy — więc oba Bloki muszą zacząć się razem.
  let bloki: { anna: Locator; borys: Locator } | null = null
  for (let dzien = PIERWSZY_DZIEN; dzien <= OSTATNI_DZIEN && !bloki; dzien += 1) {
    // Pierwsze przejście odmierza dystans od dzisiaj, każde następne — jeden
    // dzień dalej, bo kalendarz został tam, gdzie go zostawiliśmy.
    const krok = dzien === PIERWSZY_DZIEN ? PIERWSZY_DZIEN : 1
    const jej = await wolnyBlokPoDniach(anna, OS_PISTOLETOWA, krok)
    const jego = await wolnyBlokPoDniach(borys, OS_KARABINOWA, krok)
    if (!jej || !jego) continue

    // Bloki obu Osi mają różną długość, więc o nachodzeniu rozstrzyga wspólny
    // początek — Osie zaczynają dzień o tej samej godzinie.
    const oTejSamejPorze =
      (await czasBloku(jej)).split('–')[0] === (await czasBloku(jego)).split('–')[0]
    if (oTejSamejPorze) bloki = { anna: jej, borys: jego }
  }

  if (!bloki) throw new Error('Obie Osie nie mają wolnych Bloków zaczynających się razem.')

  // Obie strony dochodzą do podsumowania, zanim którakolwiek wyśle — inaczej
  // druga zobaczyłaby sztukę już zajętą i nie byłoby żadnego wyścigu.
  await doPodsumowania(anna, bloki.anna, 'Anna')
  await doPodsumowania(borys, bloki.borys, 'Borys')

  await Promise.all([
    anna.getByRole('button', { name: 'Rezerwuję' }).click(),
    borys.getByRole('button', { name: 'Rezerwuję' }).click(),
  ])

  const potwierdzenie = (page: Page) => page.getByRole('heading', { name: 'Sprawdź skrzynkę' })
  const odmowa = (page: Page) => page.getByText('nie ma tylu sztuk zamawianej broni')

  await expect(potwierdzenie(anna).or(odmowa(anna))).toBeVisible({ timeout: ZIMNY_START_MS })
  await expect(potwierdzenie(borys).or(odmowa(borys))).toBeVisible({ timeout: ZIMNY_START_MS })

  const wygrane = await Promise.all([
    potwierdzenie(anna).isVisible(),
    potwierdzenie(borys).isVisible(),
  ])
  expect(wygrane.filter(Boolean)).toHaveLength(1)

  // Przegrany zostaje na podsumowaniu ze swoim terminem: sztuki brakuje, ale
  // Oś wciąż jest wolna — poprawia zamówienie, a nie szuka innego dnia.
  const przegrany = wygrane[0] ? borys : anna
  await expect(przegrany.getByRole('button', { name: 'Popraw dane' })).toBeVisible()

  await pierwszy.close()
  await drugi.close()
})
