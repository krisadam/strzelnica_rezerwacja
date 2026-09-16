/**
 * Konfiguracja Strzelnicy — Osie, rozkład ich Bloków, godziny otwarcia,
 * Wyjątki kalendarzowe i katalogi sprzętu. Wszystko, co Panel w bazie **zmienia** poza obsługą
 * Rezerwacji, i wszystko tak samo jak odwołanie i Blokada idzie Edge
 * Functions: prawa zapisu nie ma tu żadna publiczna rola (ADR 0009), a o tym,
 * czyja jest Strzelnica, rozstrzyga baza po numerze konta (ADR 0010).
 *
 * W jednym pliku, bo są jedną sprawą oglądaną z kilku stron: Oś bez rozkładu
 * nie ma terminów, rozkład bez Osi nie ma czego opisywać, jedno i drugie poza
 * godzinami otwarcia jest widoczne i niedostępne, a katalogi mówią, co się na
 * tym wszystkim wypożycza.
 */
import type {
  AmmunitionKindDraft,
  CatalogOutcome,
  ExceptionRequest,
  HoursOutcome,
  HoursRequest,
  LaneDraft,
  LaneOutcome,
  ScheduleOutcome,
  ScheduleRequest,
  WeaponTypeDraft,
} from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'
import type { PanelClient } from './supabase.js'

const ZAPISZ_OS = 'zapisz-os'
const USTAW_ROZKLAD = 'ustaw-rozklad'
const USTAW_GODZINY = 'ustaw-godziny'
const USTAW_WYJATEK = 'ustaw-wyjatek'
const ZAPISZ_TYP_BRONI = 'zapisz-typ-broni'
const ZAPISZ_RODZAJ_AMUNICJI = 'zapisz-rodzaj-amunicji'

/**
 * Zapis Osi — nowej, gdy `id` jest puste, i poprawionej, gdy wskazuje. Formularz
 * jedzie tu wprost, bez przepisywania po polu: `LaneDraft` jest zarazem treścią
 * żądania, a po drugiej stronie odczyta go `readLaneRequest`.
 */
export function zapiszOs(client: PanelClient, draft: LaneDraft): Promise<LaneOutcome> {
  return wolajFunkcje<LaneOutcome>(client, ZAPISZ_OS, { ...draft })
}

/**
 * Zapis całego tygodnia rozkładu jednej Osi. Bez funkcji piszącej żądanie,
 * inaczej niż przy Blokadzie: tam chwile trzeba było zamienić na napisy ISO,
 * bo `Date` nie przechodzi sieci, a tu jadą same liczby — po drugiej stronie
 * odczyta je `readScheduleRequest`.
 */
export function ustawRozklad(
  client: PanelClient,
  request: ScheduleRequest,
): Promise<ScheduleOutcome> {
  return wolajFunkcje<ScheduleOutcome>(client, USTAW_ROZKLAD, {
    laneId: request.laneId,
    week: [...request.week],
  })
}

/**
 * Zapis całego tygodnia godzin otwarcia. Dzień zamknięty jest tu dniem
 * **pominiętym** na liście, a nie osobnym polem: brak wiersza znaczy zamknięte,
 * tak samo w bazie, jak w `hoursForDay`.
 */
export function ustawGodziny(client: PanelClient, request: HoursRequest): Promise<HoursOutcome> {
  return wolajFunkcje<HoursOutcome>(client, USTAW_GODZINY, { week: [...request.week] })
}

/**
 * Zapis Wyjątku kalendarzowego — dopisanie, poprawka albo zdjęcie. Żądanie
 * jedzie tu wprost, bez przepisywania po polu: `ExceptionRequest` jest zarazem
 * treścią formularza, a po drugiej stronie odczyta go `readExceptionRequest`.
 */
export function ustawWyjatek(
  client: PanelClient,
  request: ExceptionRequest,
): Promise<HoursOutcome> {
  return wolajFunkcje<HoursOutcome>(client, USTAW_WYJATEK, { ...request })
}

/**
 * Zapis Typu broni — nowego, gdy `id` jest puste, poprawionego, gdy wskazuje,
 * i wycofanego, gdy `active` jest fałszem. Formularz jedzie tu wprost, tak samo
 * jak przy Osi; cena idzie w groszach i mówi to nazwą pola, bo tak nazywa ją
 * schemat (`unit_price_gr`).
 */
export function zapiszTypBroni(
  client: PanelClient,
  draft: WeaponTypeDraft,
): Promise<CatalogOutcome> {
  const { unitPrice, ...reszta } = draft
  return wolajFunkcje<CatalogOutcome>(client, ZAPISZ_TYP_BRONI, {
    ...reszta,
    unitPriceGr: unitPrice,
  })
}

/** Zapis Rodzaju amunicji. Bez puli — Rodzaj amunicji jej nie ma (ADR 0004). */
export function zapiszRodzajAmunicji(
  client: PanelClient,
  draft: AmmunitionKindDraft,
): Promise<CatalogOutcome> {
  const { unitPrice, ...reszta } = draft
  return wolajFunkcje<CatalogOutcome>(client, ZAPISZ_RODZAJ_AMUNICJI, {
    ...reszta,
    unitPriceGr: unitPrice,
  })
}
