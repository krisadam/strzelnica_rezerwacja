import { expect, test } from '@playwright/test'
import {
  czasBloku,
  otworzWidget,
  OS_PISTOLETOWA,
  pierwszyWolnyBlok,
  wypelnijFormularz,
  zadeklarujPozwolenie,
  ZIMNY_START_MS,
} from './pomocniki.js'

// Przejście całej ścieżki — raz, jako dowód że warstwy są połączone: kalendarz
// czyta grafik z bazy, formularz pyta o zastrzeżenia tę samą czystą funkcję co
// serwer, zapis idzie przez Edge Function, a zajętość wraca do kalendarza.
// Reguły dostępności i walidacji są pokryte w `packages/shared` i nie są tutaj
// sprawdzane po raz drugi.
test('od kalendarza do potwierdzenia i z powrotem, już bez tego terminu', async ({ page }) => {
  await otworzWidget(page)
  await zadeklarujPozwolenie(page)

  const blok = await pierwszyWolnyBlok(page, OS_PISTOLETOWA)
  const czas = await czasBloku(blok)
  await blok.click()

  await expect(page.getByRole('heading', { name: 'Twoja Rezerwacja' })).toBeVisible()
  // Wybrany termin towarzyszy Osobie rezerwującej na każdym kroku.
  await expect(page.getByText(czas)).toBeVisible()

  // Kwota pustego jeszcze formularza: sama stawka za Blok Osi pistoletowej
  // z seeda (120 zł), bo pierwszy Uczestnik jest w nią wliczony, a nic ponad
  // to nie jest jeszcze zamówione. Składniki liczy `packages/shared` i tam są
  // pokryte co do złotówki — tutaj sprawdza się to, czego czysta funkcja nie
  // widzi: że Kwota stoi w Widgecie i nadąża za formularzem.
  // Wzorzec, a nie napis wprost: polski zapis kwoty rozdziela grupy cyfr
  // spacją nierozdzielającą, a Playwright normalizuje ją po swojemu.
  const kwota = page.locator('.kwota__razem')
  await expect(kwota).toContainText(/120,00\s*zł/)

  await wypelnijFormularz(page, {
    uczestnicy: 2,
    imie: 'Anna Kowalska',
    email: 'anna@example.pl',
    telefon: '600100200',
    // Wypożyczenie jedzie razem z Rezerwacją jako pozycja tego samego zapisu —
    // to jedyne, czego czysta funkcja z definicji nie zobaczy. Ile sztuk wolno
    // wziąć, rozstrzyga się w `packages/shared` i nie jest tu sprawdzane.
    bron: { typ: 'Glock 17', sztuki: 1 },
    // Zapotrzebowanie jedzie tym samym zapisem, co Wypożyczenie. Liczba sztuk
    // celowo większa niż jakikolwiek magazyn: Rodzaj amunicji nie ma puli
    // (ADR 0004), więc nikt jej nigdzie po drodze nie przytnie ani nie odmówi
    // — a tego, że w schemacie nie ma czego egzekwować, czysta funkcja
    // z definicji nie zobaczy.
    amunicja: { rodzaj: '9 × 19 mm Parabellum', sztuki: 1000 },
  })

  // Ta sama Kwota po wypełnieniu formularza: 120 zł za Blok + 30 zł za drugiego
  // Uczestnika + 50 zł za sztukę „Glocka 17" + 1000 × 1,50 zł za amunicję.
  await expect(kwota).toContainText(/1\s*700,00\s*zł/)

  await expect(page.getByText('Anna Kowalska')).toBeVisible()
  await expect(page.getByText('Glock 17 — 1 szt.')).toBeVisible()
  await expect(page.getByText('9 × 19 mm Parabellum — 1000 szt.')).toBeVisible()
  await expect(page.getByText(czas)).toBeVisible()

  await page.getByRole('button', { name: 'Rezerwuję' }).click()

  await expect(page.getByRole('heading', { name: 'Termin jest Twój' })).toBeVisible({
    timeout: ZIMNY_START_MS,
  })

  // Kwota na potwierdzeniu przychodzi z Edge Function, a nie z rachunku
  // policzonego jeszcze raz w przeglądarce: to ona została zapisana przy
  // Rezerwacji. Zgodność z Kwotą z formularza znaczy, że obie strony liczyły
  // jedną kopią reguły — czego żaden test czystej funkcji nie potwierdzi.
  await expect(kwota).toContainText(/1\s*700,00\s*zł/)

  // Kalendarz wraca tam, gdzie go zostawiono — z Blokiem już zajętym.
  await page.getByRole('button', { name: 'Wróć do kalendarza' }).click()
  const pozycja = page.locator('.blok', { hasText: czas })
  await expect(pozycja).toHaveClass(/blok--niedostepny/)
  await expect(pozycja).toContainText('termin już zajęty')
})
