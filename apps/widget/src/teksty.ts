/**
 * Wszystkie teksty Widgetu w jednym miejscu — spec: „teksty w jednym słowniku
 * zamiast wplecione w komponenty". Jeden wygląd i jeden język dla wszystkich
 * Strzelnic, więc słownik jest stały, a nie ładowany.
 */
import type { Unavailability } from '@strzelnica/shared'
import { TYTUL_RAMKI } from '@strzelnica/shared'

export const teksty = {
  /** Ta sama nazwa, którą skrypt osadzający nadaje ramce. */
  tytul: TYTUL_RAMKI,
  wybierzOs: 'Wybierz Oś',
  pojemnosc: (ile: number) => `do ${ile} os.`,
  poprzedniDzien: 'Poprzedni dzień',
  nastepnyDzien: 'Następny dzień',
  wczytywanie: 'Wczytuję grafik…',
  wolny: 'wolny',
  niedostepny: 'niedostępny',
  powod: {
    'poza-godzinami-otwarcia': 'poza godzinami otwarcia',
    'poza-horyzontem': 'poza horyzontem rezerwacji',
    przeszlosc: 'termin już minął',
    'ponizej-wyprzedzenia': 'zbyt bliski termin',
  } satisfies Record<Unavailability, string>,
  /**
   * Powód, dla którego „Następny dzień" przestaje działać. Bez tego zdania
   * wyłączony przycisk wygląda na usterkę.
   */
  zasiegKalendarza: (ostatniDzien: string) => `Ostatni dzień w kalendarzu: ${ostatniDzien}.`,
  dzienZamkniety: 'Tego dnia Strzelnica jest zamknięta.',
  osBezBlokow: 'Ta Oś nie ma tego dnia żadnych Bloków.',
  brakOsi: 'Ta Strzelnica nie ma jeszcze żadnej Osi.',
  brakParametru:
    'Brak wskazania Strzelnicy. Dodaj do adresu parametr ?strzelnica=identyfikator.',
  bladWczytywania: 'Nie udało się wczytać grafiku.',
} as const
