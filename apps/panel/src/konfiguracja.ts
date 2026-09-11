/**
 * Konfiguracja Strzelnicy — Osie, rozkład ich Bloków, godziny otwarcia
 * i Wyjątki kalendarzowe. Wszystko, co Panel w bazie **zmienia** poza obsługą
 * Rezerwacji, i wszystko tak samo jak odwołanie i Blokada idzie Edge
 * Functions: prawa zapisu nie ma tu żadna publiczna rola (ADR 0009), a o tym,
 * czyja jest Strzelnica, rozstrzyga baza po numerze konta (ADR 0010).
 *
 * W jednym pliku, bo są jedną sprawą oglądaną z czterech stron: Oś bez rozkładu
 * nie ma terminów, rozkład bez Osi nie ma czego opisywać, a jedno i drugie poza
 * godzinami otwarcia jest widoczne i niedostępne.
 */
import type {
  ExceptionRequest,
  HoursOutcome,
  HoursRequest,
  LaneDraft,
  LaneOutcome,
  ScheduleOutcome,
  ScheduleRequest,
} from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'
import type { PanelClient } from './supabase.js'

const ZAPISZ_OS = 'zapisz-os'
const USTAW_ROZKLAD = 'ustaw-rozklad'
const USTAW_GODZINY = 'ustaw-godziny'
const USTAW_WYJATEK = 'ustaw-wyjatek'

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
