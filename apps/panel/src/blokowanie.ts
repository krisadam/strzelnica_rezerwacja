/**
 * Wprowadzenie Blokady Osi — druga i ostatnia rzecz, którą Panel w bazie
 * **zmienia**, i tak samo jak odwołanie Rezerwacji idzie Edge Function:
 * prawa zapisu nie ma tu żadna publiczna rola (ADR 0009), a o tym, czy Oś
 * należy do Strzelnicy tego konta, rozstrzyga baza (ADR 0010).
 */
import type { ClosureOutcome, ClosureRequest } from '@strzelnica/shared'
import { writeClosureRequest } from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'
import type { PanelClient } from './supabase.js'

const ZABLOKUJ = 'zablokuj-os'

export function zablokujOs(
  client: PanelClient,
  request: ClosureRequest,
): Promise<ClosureOutcome> {
  // Chwile w zapisie ISO, bo `Date` nie przechodzi sieci — a po drugiej stronie
  // odczyta je `readClosureRequest`. Jedna funkcja pisze, jedna czyta.
  return wolajFunkcje<ClosureOutcome>(client, ZABLOKUJ, writeClosureRequest(request))
}
