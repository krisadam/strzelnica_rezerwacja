/**
 * Wszystkie teksty Panelu w jednym miejscu — tak samo jak w Widgecie i z tego
 * samego powodu: jeden język i jeden wygląd dla wszystkich Strzelnic, więc
 * słownik jest stały, a nie ładowany.
 *
 * Odrębny od słownika Widgetu, choć część zdań brzmi podobnie: tam mówi się do
 * klienta o jego Rezerwacji, tu do obsługi o cudzych. „Termin jest Twój" i „Jan
 * Przykładowy, 2 os." to nie są dwa warianty jednego zdania.
 */
import type {
  ClosureProblem,
  Database,
  InstructorPresence,
  OrderedItem,
  RevocationProblem,
} from '@strzelnica/shared'

type BookingStatus = Database['public']['Enums']['booking_status']

export const teksty = {
  tytul: 'Panel Strzelnicy',
  wczytywanie: 'Wczytuję Rezerwacje…',
  bladWczytywania: 'Nie udało się wczytać Rezerwacji. Odśwież stronę i spróbuj ponownie.',

  logowanie: {
    naglowek: 'Zaloguj się',
    wstep: 'Panel jest dostępny wyłącznie dla obsługi Strzelnicy.',
    email: 'Adres e-mail',
    haslo: 'Hasło',
    zaloguj: 'Zaloguj',
    logowanie: 'Loguję…',
    /**
     * Jedna odpowiedź na złe hasło i na nieistniejące konto: rozróżnienie
     * powiedziałoby zgadującemu, które adresy w tej Strzelnicy istnieją.
     */
    odmowa: 'Nie udało się zalogować. Sprawdź adres i hasło.',
    brakDanych: 'Podaj adres e-mail i hasło.',
  },

  sesja: {
    wyloguj: 'Wyloguj',
  },

  kalendarz: {
    naglowek: 'Kalendarz dnia',
    dzien: 'Dzień kalendarza',
    poprzedniDzien: 'Poprzedni dzień',
    nastepnyDzien: 'Następny dzień',
    dzisiaj: 'Dzisiaj',
    /**
     * Oś, na której dziś nic nie stoi — ani Rezerwacja, ani Blokada.
     * Odpowiedź, nie brak treści: „wolna" jest tym, po co obsługa tu zagląda.
     */
    pustaOs: 'Oś wolna cały dzień',
    /**
     * Znacznik Blokady w kolumnie Osi. Stoi tam, gdzie przy Rezerwacji stoi
     * nazwisko — bo to jest odpowiedź na to samo pytanie: kto ma tę Oś.
     */
    blokada: 'Blokada',
  },

  lista: {
    naglowek: 'Lista Rezerwacji',
    dzien: 'Dzień',
    os: 'Oś',
    wszystkieOsie: 'Wszystkie Osie',
    wyczysc: 'Wyczyść filtry',
    pusta: 'Żadna Rezerwacja nie pasuje do filtrów.',
    ile: (ile: number) => `Rezerwacji: ${ile}`,
    /** Nagłówki kolumn listy. */
    kolumny: {
      termin: 'Termin',
      os: 'Oś',
      klient: 'Osoba rezerwująca',
      uczestnicy: 'Uczestnicy',
      stan: 'Stan',
      kwota: 'Kwota',
    },
  },

  szczegoly: {
    naglowek: 'Szczegóły Rezerwacji',
    wroc: 'Wróć do Rezerwacji',
    termin: 'Termin',
    os: 'Oś',
    stan: 'Stan',
    uczestnicy: 'Uczestnicy',
    pozwolenie: 'Pozwolenie na broń',
    maPozwolenie: 'zadeklarowane',
    brakPozwolenia: 'brak — Instruktor wymagany',
    instruktor: 'Instruktor',
    wypozyczenie: 'Wypożyczenie broni',
    wlasnaBron: 'własna broń',
    amunicja: 'Zapotrzebowanie na amunicję',
    wlasnaAmunicja: 'własna amunicja',
    imie: 'Imię i nazwisko',
    email: 'Adres e-mail',
    telefon: 'Telefon',
    kwota: 'Kwota do zapłaty',
    /** Kwota jest zamrożona w chwili złożenia — obsługa rozlicza ją na miejscu. */
    kwotaUwaga: 'Kwota zamrożona w chwili złożenia Rezerwacji; zapłata na miejscu.',
    /**
     * Powód odwołania stoi w opisie razem ze stanem, a nie osobno pod nim:
     * stan „odwołana przez Strzelnicę" bez powodu kazałby dzwonić po
     * koleżankę, która odwoływała — i po to samo dzwoniłby klient.
     */
    powodOdwolania: 'Powód odwołania',
  },

  /**
   * Odwołanie Rezerwacji przez Strzelnicę. Zdania mówią o skutku dla klienta,
   * bo to on jest tu stroną, która się dowiaduje: obsługa wie, co robi,
   * a klient dostaje list i puste popołudnie.
   */
  odwolanie: {
    naglowek: 'Odwołanie Rezerwacji',
    wstep:
      'Klient dostanie e-mail z powodem odwołania i kontaktem do Strzelnicy, ' +
      'a termin od razu wróci do puli.',
    powod: 'Powód odwołania',
    /** Podpowiedź, bo powód czyta klient, a nie dziennik systemu. */
    podpowiedz: 'Jedno zdanie dla klienta — np. „Awaria wentylacji na Osi".',
    odwolaj: 'Odwołaj Rezerwację',
    /**
     * Pytanie jest tu treścią, nie uprzejmością: odwołania nie da się odkliknąć
     * — list do klienta wychodzi od razu, a termin bierze pierwszy chętny.
     */
    pewnie: 'Na pewno odwołać? Klient dostanie e-mail, a termin wróci do puli.',
    tak: 'Tak, odwołaj',
    nie: 'Zostawiam Rezerwację',
    odwolywanie: 'Odwołujemy…',
    /**
     * Zdanie o skutku, i wyłącznie o tym, co skutkiem naprawdę jest: termin
     * wrócił do puli. O liście mówi zdanie przy formularzu — „klient
     * dostanie" — bo obietnicę składa się przed wysłaniem, a nie po. Panel nie
     * ma czym sprawdzić, czy list doszedł: jego niepowodzenie zostaje wpisem
     * w dzienniku, tak samo jak przy każdym innym liście tego modułu, i nie
     * unieważnia odwołania.
     */
    odwolano: 'Odwołaliśmy Rezerwację — termin wrócił do puli.',
    /**
     * Odwołanie, które weszło przed nami: drugie stanowisko obsługi albo drugie
     * kliknięcie. Klient ma już swój list i nie dostanie drugiego, więc zdanie
     * mówi o stanie, a nie o skutku, którego nie było.
     */
    juzOdwolana: 'Ta Rezerwacja była już odwołana — teraz nic się nie zmieniło.',
    /**
     * Odmowy, każda z podpowiedzią co dalej. „Brak powodu" wypisuje sam
     * formularz, jeszcze przed wysłaniem; dwie pozostałe przychodzą z bazy
     * i znaczą Rezerwację, która zmieniła się bez nas — Panel odświeża się raz
     * na minutę, a klient bywa szybszy.
     *
     * Odwzorowanie jest pełne, bo pełny jest zbiór odmów — nie dlatego, że
     * Panel każdą z nich zobaczy. „Nieznana Rezerwacja" znaczy wiersz, którego
     * baza tej Strzelnicy nie przypisuje, a Panel klika w Rezerwację wziętą
     * z tej właśnie Strzelnicy: żeby to zdanie stanęło na ekranie, Rezerwacja
     * musiałaby zniknąć między odczytem a kliknięciem.
     */
    problem: {
      'brak-powodu': 'Podaj powód odwołania — klient dostanie go w e-mailu.',
      'nieznana-rezerwacja':
        'Tej Rezerwacji już nie ma. Odśwież ekran i sprawdź, co się z nią stało.',
      'nie-do-odwolania':
        'Tej Rezerwacji nie ma czego odwoływać — sprawdź jej stan w odświeżonym opisie.',
    } satisfies Record<RevocationProblem, string>,
    blad: 'Nie udało się odwołać Rezerwacji. Spróbuj jeszcze raz za chwilę.',
  },

  /**
   * Blokada Osi. Zdania mówią o Osi i o sprzedaży, a nie o kliencie: klienta
   * przy Blokadzie nie ma i to jest cała różnica między nią a Odwołaniem.
   */
  blokada: {
    naglowek: 'Blokada Osi',
    wstep:
      'Oś zniknie ze sprzedaży na wskazany czas — dowolny, także dalszy niż ' +
      'horyzont rezerwacji; kalendarz wyżej pokaże Blokadę, gdy wejdzie w jego ' +
      'okno. Klient zobaczy zajęty termin, bez powodu — powód czyta wyłącznie ' +
      'obsługa.',
    /**
     * Nie samo „Oś", choć pole wskazuje to samo, co filtr listy: dwa pola
     * o jednej nazwie na jednym ekranie każą czytającemu — i testowi
     * przeglądarkowemu — zgadywać, o które chodzi.
     */
    os: 'Oś do wyłączenia',
    od: 'Od',
    do: 'Do',
    powod: 'Powód wyłączenia',
    /** Podpowiedź, bo powód czyta następna zmiana obsługi, a nie klient. */
    podpowiedz: 'Np. „Serwis przenośnika tarcz".',
    zablokuj: 'Wyłącz Oś ze sprzedaży',
    blokowanie: 'Wyłączamy…',
    /**
     * Zdanie o skutku, i wyłącznie o tym, co skutkiem jest: terminu nie ma
     * w sprzedaży. Ekran czyta dane od nowa, więc Blokada za chwilę stanie
     * w kalendarzu sama — i to ona jest właściwym potwierdzeniem.
     */
    zablokowano: 'Oś wyłączona — terminy zniknęły ze sprzedaży.',
    /**
     * Odmowy, każda z podpowiedzią co dalej. Dwie pierwsze wypisuje sam
     * formularz, jeszcze przed wysłaniem; „termin zajęty" przychodzi z bazy,
     * bo dopiero ona wie, co stoi na Osi w tej sekundzie.
     *
     * „Nieznana Oś" znaczy Oś, której baza tej Strzelnicy nie przypisuje,
     * a formularz wybiera Oś z listy tej właśnie Strzelnicy: żeby to zdanie
     * stanęło na ekranie, Oś musiałaby zniknąć między odczytem a kliknięciem.
     */
    problem: {
      'zly-zakres': 'Podaj początek i koniec Blokady — koniec musi być późniejszy.',
      'brak-powodu': 'Podaj powód wyłączenia — przeczyta go następna zmiana obsługi.',
      'termin-zajety':
        'W tym czasie Oś jest już czyjaś. Rezerwację trzeba najpierw odwołać — ' +
        'klient ma dostać powód, a nie zastać zamknięte.',
      'nieznana-os': 'Tej Osi już nie ma. Odśwież ekran i sprawdź, co się z nią stało.',
    } satisfies Record<ClosureProblem, string>,
    blad: 'Nie udało się wprowadzić Blokady. Spróbuj jeszcze raz za chwilę.',
  },

  /**
   * Skąd wziął się Instruktor — albo dlaczego go nie ma. Rozróżnienie robi
   * `instructorPresence` z `@strzelnica/shared`, tu są wyłącznie słowa: te same
   * trzy przypadki opisuje inaczej list do klienta, a inaczej Panel.
   */
  instruktorStan: {
    wymagany: 'obecny — wymagany brakiem Pozwolenia',
    zamowiony: 'obecny — zamówiony dobrowolnie',
    brak: 'bez Instruktora',
  } satisfies Record<InstructorPresence, string>,

  /**
   * Stan Rezerwacji jednym słowem — w liście stoi w kolumnie, więc zdanie
   * z Widgetu („Termin jest Twój") nie ma tu czego robić.
   */
  stan: {
    oczekujaca: 'oczekuje na potwierdzenie',
    potwierdzona: 'potwierdzona',
    'anulowana-przez-klienta': 'anulowana przez klienta',
    'odwolana-przez-strzelnice': 'odwołana przez Strzelnicę',
    wygasla: 'wygasła',
  } satisfies Record<BookingStatus, string>,

  uczestnicy: (ile: number) => `${ile} os.`,
  sztuki: (ile: number) => `${ile} szt.`,
}

/**
 * Zamówiony sprzęt jednym zdaniem. Ta sama postać, co w Widgecie i w liście
 * do Strzelnicy — obsługa czyta to samo, co dostał klient.
 */
export function opisZamowionych(pozycje: readonly OrderedItem[], brak: string): string {
  if (pozycje.length === 0) return brak
  return pozycje
    .map((pozycja) => `${pozycja.name} — ${teksty.sztuki(pozycja.quantity)}`)
    .join(', ')
}
