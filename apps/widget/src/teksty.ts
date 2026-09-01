/**
 * Wszystkie teksty Widgetu w jednym miejscu — spec: „teksty w jednym słowniku
 * zamiast wplecione w komponenty". Jeden wygląd i jeden język dla wszystkich
 * Strzelnic, więc słownik jest stały, a nie ładowany.
 */
import type {
  BookingDraft,
  BookingProblem,
  Unavailability,
  WeaponRental,
  WeaponType,
} from '@strzelnica/shared'
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
    'brak-instruktora': 'brak wolnego Instruktora',
    'brak-sztuk-broni': 'brak tylu sztuk zamówionej broni',
  } satisfies Record<Unavailability, string>,
  /**
   * Powód, dla którego „Następny dzień" przestaje działać. Bez tego zdania
   * wyłączony przycisk wygląda na usterkę.
   */
  zasiegKalendarza: (ostatniDzien: string) => `Ostatni dzień w kalendarzu: ${ostatniDzien}.`,
  /**
   * Deklaracje rozstrzygające, które terminy są wolne. Stoją przy kalendarzu,
   * a nie dopiero w formularzu, bo kalendarz odpowiada na nie od razu — ten sam
   * Blok bywa wolny dla Osoby rezerwującej z Pozwoleniem i niedostępny dla tej
   * bez niego.
   */
  deklaracje: {
    legenda: 'Twoje deklaracje',
    pozwolenie: 'Mam pozwolenie na broń',
    chceInstruktora: 'Chcę Instruktora',
    instruktorWymagany: 'Bez Pozwolenia Instruktor jest wymagany — dodajemy go do Rezerwacji.',
    wplyw: 'Terminy w kalendarzu uwzględniają te deklaracje.',
  },
  instruktor: {
    etykieta: 'Instruktor',
    wymagany: 'tak — wymagany, bo nie deklarujesz Pozwolenia',
    zamowiony: 'tak — zamówiony dobrowolnie',
    brak: 'nie',
  },
  /**
   * Wypożyczenie broni. Stoi w formularzu, a nie przy kalendarzu: liczba
   * pozostałych sztuk jest własnością terminu, więc daje się pokazać dopiero
   * po jego wybraniu. Zmiana zamówienia i tak przelicza cały grafik — Blok bez
   * dość sztuk gaśnie po powrocie do kalendarza.
   */
  wypozyczenie: {
    legenda: 'Wypożyczenie broni',
    wyjasnienie: 'Możesz przyjechać z własną bronią i nie zamawiać niczego.',
    pozostalo: (ile: number) => `pozostało ${ile} szt. w tym terminie`,
    wyczerpany: 'wszystkie sztuki są w tym terminie zajęte',
    wyczerpanyZamowiony: 'w tym terminie nie ma już wolnych sztuk — zdejmij tę pozycję',
    brakKatalogu: 'Ta Strzelnica nie wypożycza broni.',
    sztuki: (ile: number) => `${ile} szt.`,
    etykieta: 'Wypożyczenie',
    wlasnaBron: 'brak — własna broń',
  },
  pozwolenie: {
    etykieta: 'Pozwolenie na broń',
    mam: 'deklaruję, że posiadam',
    nieMam: 'nie posiadam',
  },
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
    // Jedyne zastrzeżenie, które Osoba rezerwująca naprawia nie zmianą terminu,
    // tylko zmianą własnej deklaracji — więc mówi jej o obu drogach.
    'brak-instruktora':
      'W tym terminie Strzelnica nie ma już wolnego Instruktora. Wybierz inny termin ' +
      'albo zaznacz Pozwolenie na broń, jeśli je posiadasz.',
    'liczba-uczestnikow-poza-zakresem': 'Podaj liczbę Uczestników — co najmniej jednego.',
    // Naprawia się mniejszym zamówieniem albo innym terminem — jak przy
    // Instruktorze, mówimy o obu drogach.
    'brak-sztuk-broni':
      'W tym terminie nie ma tylu sztuk zamawianej broni. Zamów mniej sztuk ' +
      'albo wybierz inny termin.',
    'ponad-pojemnosc-osi': 'Tylu Uczestników nie zmieści się na tej Osi.',
    'niepoprawne-wypozyczenie':
      'Popraw Wypożyczenie: każdy Typ broni najwyżej raz i po całych sztukach.',
    'brak-imienia': 'Podaj imię i nazwisko.',
    'niepoprawny-email': 'Podaj poprawny adres e-mail.',
    'brak-telefonu': 'Podaj numer telefonu.',
    'brak-zgody': 'Bez akceptacji regulaminu nie zapiszemy Rezerwacji.',
  } satisfies Record<BookingProblem, string>,
  bladZapisu: 'Nie udało się wysłać zgłoszenia. Spróbuj jeszcze raz.',
} as const

/**
 * Zdanie o Instruktorze dla wybranych deklaracji. Powtarzane na formularzu,
 * podsumowaniu i potwierdzeniu — Osoba rezerwująca bez Pozwolenia ma widzieć
 * Instruktora w Rezerwacji wszędzie tam, gdzie widzi jej resztę, a nie
 * dowiadywać się o nim dopiero z rachunku.
 */
export function opisInstruktora(draft: BookingDraft): string {
  if (!draft.hasPermit) return teksty.instruktor.wymagany
  return draft.wantsInstructor ? teksty.instruktor.zamowiony : teksty.instruktor.brak
}

/**
 * Zamówiony sprzęt jednym zdaniem. Powtarzany na podsumowaniu i potwierdzeniu —
 * Osoba rezerwująca ma widzieć zamówioną broń wszędzie tam, gdzie widzi resztę
 * Rezerwacji.
 *
 * Kolejność bierze się z katalogu, nie z kolejności klikania: lista, która
 * przestawia się przy każdej zmianie liczby sztuk, każe czytać ją od nowa.
 * Typ spoza katalogu idzie na koniec, a nie znika po cichu — zamówienie,
 * którego Strzelnica nie zna, ma być widoczne.
 *
 * Brak Wypożyczeń mówi o sobie wprost: pusta pozycja w podsumowaniu wyglądałaby
 * na coś, o co nikt nie zapytał.
 */
export function opisWypozyczen(
  rentals: readonly WeaponRental[],
  weaponTypes: readonly WeaponType[],
): string {
  const znane = weaponTypes.flatMap((typ) => {
    const pozycja = rentals.find((kandydat) => kandydat.weaponTypeId === typ.id)
    return pozycja ? [`${typ.name} — ${teksty.wypozyczenie.sztuki(pozycja.quantity)}`] : []
  })
  const obce = rentals
    .filter((pozycja) => !weaponTypes.some((typ) => typ.id === pozycja.weaponTypeId))
    .map((pozycja) => `${pozycja.weaponTypeId} — ${teksty.wypozyczenie.sztuki(pozycja.quantity)}`)

  const pozycje = [...znane, ...obce]
  return pozycje.length === 0 ? teksty.wypozyczenie.wlasnaBron : pozycje.join(', ')
}
