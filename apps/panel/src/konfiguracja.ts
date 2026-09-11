/**
 * Konfiguracja Strzelnicy — Osie i rozkład ich Bloków. Trzecia i czwarta
 * rzecz, którą Panel w bazie **zmienia**, i tak samo jak odwołanie Rezerwacji
 * oraz Blokada idą Edge Functions: prawa zapisu nie ma tu żadna publiczna rola
 * (ADR 0009), a o tym, czy Oś należy do Strzelnicy tego konta, rozstrzyga baza
 * (ADR 0010).
 *
 * Obie w jednym pliku, bo są jedną sprawą oglądaną z dwóch stron: Oś bez
 * rozkładu nie ma terminów, a rozkład bez Osi nie ma czego opisywać.
 */
import type { LaneDraft, LaneOutcome, ScheduleOutcome, ScheduleRequest } from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'
import type { PanelClient } from './supabase.js'

const ZAPISZ_OS = 'zapisz-os'
const USTAW_ROZKLAD = 'ustaw-rozklad'

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
