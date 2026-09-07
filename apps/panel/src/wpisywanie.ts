/**
 * Ręczny wpis Rezerwacji przyjętej przez telefon — trzecia i ostatnia rzecz,
 * którą Panel w bazie **zmienia**, i tak samo jak odwołanie oraz Blokada idzie
 * Edge Function: prawa zapisu nie ma tu żadna publiczna rola (ADR 0009), a o to,
 * czy Oś należy do Strzelnicy tego konta, pyta baza (ADR 0010).
 *
 * Strzelnicy w żądaniu nie ma i nie ma jej czym podstawić — inaczej niż
 * w Widgecie, który podaje ją slugiem z adresu ramki. Tu upoważnieniem jest
 * token konta, a konto ma dokładnie jedną Strzelnicę.
 */
import type { ManualBookingOutcome, ManualBookingRequest } from '@strzelnica/shared'
import { wolajFunkcje } from './funkcja.js'
import type { PanelClient } from './supabase.js'

const WPISZ = 'wpisz-rezerwacje'

export function wpiszRezerwacje(
  client: PanelClient,
  // Całe żądanie, bo `ManualBookingRequest` jest tym, co po drugiej stronie
  // odczyta `readManualBookingRequest` — rozłożenie go tutaj na pola byłoby
  // rozłożeniem, które trzeba złożyć z powrotem wiersz niżej.
  request: ManualBookingRequest,
): Promise<ManualBookingOutcome> {
  return wolajFunkcje<ManualBookingOutcome>(client, WPISZ, request)
}
