/**
 * Wszystkie teksty Widgetu w jednym miejscu — spec: „teksty w jednym słowniku
 * zamiast wplecione w komponenty". Jeden wygląd i jeden język dla wszystkich
 * Strzelnic, więc słownik jest stały, a nie ładowany.
 */
import type { BookingProblem, Unavailability } from '@strzelnica/shared'
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
    'termin-zajety': 'termin już zajęty',
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

  formularz: {
    naglowek: 'Twoja Rezerwacja',
    termin: 'Termin',
    os: 'Oś',
    liczbaUczestnikow: 'Liczba Uczestników',
    limitUczestnikow: (ile: number) => `Ta Oś mieści najwyżej ${ile} os.`,
    imie: 'Imię i nazwisko',
    email: 'Adres e-mail',
    telefon: 'Telefon',
    zgoda: 'Akceptuję regulamin i politykę prywatności Strzelnicy.',
    dalej: 'Dalej',
    zmienTermin: 'Zmień termin',
  },
  podsumowanie: {
    naglowek: 'Sprawdź, zanim wyślesz',
    uczestnicy: (ile: number) => `${ile} os.`,
    poprawDane: 'Popraw dane',
    rezerwuje: 'Rezerwuję',
    wysylanie: 'Wysyłam zgłoszenie…',
  },
  potwierdzenie: {
    naglowek: 'Termin jest Twój',
    tresc: 'Zapisaliśmy Rezerwację. Strzelnica ma już Twoje zgłoszenie.',
    numer: (id: string) => `Numer Rezerwacji: ${id}`,
    wrocDoKalendarza: 'Wróć do kalendarza',
  },
  /**
   * Zastrzeżenia liczy `bookingProblems` z `@strzelnica/shared` — ta sama
   * funkcja, którą pyta serwer. Tutaj są wyłącznie ich zdania po polsku.
   */
  zastrzezenie: {
    // Nie „zajęty": termin bywa niedostępny także dlatego, że właśnie minął
    // albo zszedł poniżej minimalnego wyprzedzenia. Kalendarz obok podaje
    // przy każdym Bloku powód z osobna.
    'termin-niedostepny':
      'Ten termin nie jest już dostępny. Wybierz inny — kalendarz ma świeże dane.',
    'liczba-uczestnikow-poza-zakresem': 'Podaj liczbę Uczestników — co najmniej jednego.',
    'ponad-pojemnosc-osi': 'Tylu Uczestników nie zmieści się na tej Osi.',
    'brak-imienia': 'Podaj imię i nazwisko.',
    'niepoprawny-email': 'Podaj poprawny adres e-mail.',
    'brak-telefonu': 'Podaj numer telefonu.',
    'brak-zgody': 'Bez akceptacji regulaminu nie zapiszemy Rezerwacji.',
  } satisfies Record<BookingProblem, string>,
  bladZapisu: 'Nie udało się wysłać zgłoszenia. Spróbuj jeszcze raz.',
} as const
