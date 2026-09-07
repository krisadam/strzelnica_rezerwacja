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
  BookingSource,
  ClosureProblem,
  Database,
  InstructorPresence,
  LimitOverride,
  ManualBookingProblem,
  OrderedItem,
  RevocationProblem,
  Unavailability,
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
    /** Źródło niesie każda Rezerwacja, więc wiersz jest w każdym opisie. */
    zrodlo: 'Źródło',
    /**
     * Przekroczone limity stoją zaraz pod Źródłem, bo tłumaczą właśnie je:
     * Rezerwacja na sześć osób na Osi czteroosobowej bez tego wiersza wygląda
     * na pomyłkę systemu, a nie na decyzję, którą ktoś podjął świadomie.
     */
    przekroczenia: 'Przekroczone limity',
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
   * Ręczna Rezerwacja telefoniczna. Zdania mówią do obsługi o kimś, kto właśnie
   * dzwoni — stąd „klient deklaruje", a nie „mam pozwolenie" jak w Widgecie:
   * formularz wypełnia ktoś inny niż ten, o kim jest.
   */
  recznyWpis: {
    naglowek: 'Rezerwacja telefoniczna',
    wstep:
      'Wpisz zgłoszenie przyjęte przez telefon. Rezerwacja powstaje od razu ' +
      'potwierdzona — klient nie musi klikać w żaden link — i nie idzie do niego ' +
      'żaden e-mail, więc termin i Kwotę podaj mu w rozmowie.',
    /**
     * Nie samo „Oś" ani „Dzień": tak nazywają się pola filtrów listy i pole
     * kalendarza, a dwa pola o jednej nazwie na jednym ekranie każą czytającemu
     * — i testowi przeglądarkowemu — zgadywać, o które chodzi.
     */
    os: 'Oś Rezerwacji',
    dzien: 'Dzień Rezerwacji',
    termin: 'Termin',
    /** Bloków dnia nie ma wcale: Strzelnica jest zamknięta albo Oś nie pracuje. */
    brakTerminow: 'Tego dnia ta Oś nie ma ani jednego Bloku w rozkładzie.',
    wybierzTermin: 'Wybierz termin',
    uczestnicy: 'Liczba Uczestników',
    pojemnosc: (ile: number) => `Pojemność Osi: ${ile}`,
    pozwolenie: 'Klient deklaruje Pozwolenie na broń',
    instruktor: 'Klient zamawia Instruktora',
    /** Brak Pozwolenia wymusza Instruktora — pole przestaje być pytaniem. */
    instruktorWymagany: 'Instruktor wymagany — klient nie deklaruje Pozwolenia.',
    wypozyczenie: 'Wypożyczenie broni',
    pozostalo: (ile: number) => `pozostało ${ile} szt.`,
    amunicja: 'Zapotrzebowanie na amunicję',
    imie: 'Imię i nazwisko',
    email: 'Adres e-mail',
    telefon: 'Telefon',
    /**
     * Zgoda jest tu oświadczeniem obsługi o tym, co powiedziała klientowi —
     * bo kolumna `consented_at` twierdzi, że akceptacja się zdarzyła, a nikt
     * poza obsługą nie może o niej wiedzieć.
     */
    zgoda: 'Klient zaakceptował regulamin i politykę prywatności w rozmowie',
    kwota: 'Kwota do zapłaty',
    kwotaUwaga: 'Podaj tę Kwotę klientowi — to ona zostanie zapisana przy Rezerwacji.',
    wpisz: 'Wpisz Rezerwację',
    wpisywanie: 'Wpisujemy…',
    /**
     * Pytanie o pewność jest tu treścią, nie uprzejmością: to ono jest owym
     * „jawnym potwierdzeniem", bez którego limitu przekroczyć nie wolno.
     * Wymienia każdy przekraczany limit z osobna, bo obsługa potwierdza to,
     * co widzi, a nie to, co się domyśla.
     */
    pewnie: 'Ta Rezerwacja przekracza limity Strzelnicy:',
    pewnieOgon:
      'Zostanie to odnotowane przy Rezerwacji na trwałe i widoczne w jej ' +
      'szczegółach. Wpisujemy?',
    tak: 'Tak, wpisuję mimo to',
    nie: 'Poprawiam zgłoszenie',
    /**
     * Zdanie o skutku i tylko o nim: Rezerwacja stoi. O tym, że nie poszedł
     * żaden list, mówi zdanie przy formularzu — obietnicę składa się przed,
     * a nie po.
     */
    wpisano: 'Wpisaliśmy Rezerwację — termin jest zajęty od tej chwili.',
    /** Co dokładnie zostało odnotowane; liczy to serwer, nie ten ekran. */
    wpisanoZPrzekroczeniem: 'Przy Rezerwacji odnotowaliśmy przekroczone limity:',
    /**
     * Odmowy, każda z podpowiedzią co dalej. Zastrzeżenia do pól wypisuje sam
     * formularz; „termin zajęty" i „brak sztuk broni" przychodzą także z bazy,
     * bo dopiero ona wie, co stoi na Osi w tej sekundzie.
     *
     * Odwzorowanie jest pełne, bo pełny jest zbiór odmów — nie dlatego, że
     * Panel każdą z nich zobaczy. „Niepotwierdzone przekroczenie" znaczy limit,
     * który pojawił się między pytaniem o pewność a zapisem: klient zdążył
     * zabrać Instruktora z Puli.
     */
    problem: {
      'termin-niedostepny': 'Tego terminu nie da się wziąć — wybierz inny.',
      'termin-zajety':
        'Ten termin jest już czyjś. Rezerwację trzeba najpierw odwołać, ' +
        'a Blokadę zdjąć — wyłączności Osi nie da się przekroczyć.',
      'brak-sztuk-broni':
        'Tyle sztuk Strzelnica nie ma w tym terminie. Zamów mniej albo dopisz ' +
        'brakujące egzemplarze do katalogu.',
      'liczba-uczestnikow-poza-zakresem': 'Podaj liczbę Uczestników — co najmniej jednego.',
      'niepoprawne-wypozyczenie': 'Popraw Wypożyczenie: każdy Typ raz i co najmniej jedna sztuka.',
      'niepoprawne-zapotrzebowanie':
        'Popraw Zapotrzebowanie: każdy Rodzaj raz i co najmniej jedna sztuka.',
      'brak-imienia': 'Podaj imię i nazwisko Osoby rezerwującej.',
      'niepoprawny-email': 'Podaj adres e-mail Osoby rezerwującej.',
      'brak-telefonu': 'Podaj telefon Osoby rezerwującej.',
      'brak-zgody': 'Zaznacz akceptację regulaminu — bez niej Rezerwacja nie powstaje.',
      'niepotwierdzone-przekroczenie':
        'Limity zmieniły się od ostatniego sprawdzenia. Kliknij jeszcze raz ' +
        'i potwierdź to, co przekracza ta Rezerwacja teraz.',
      'nieznana-os': 'Tej Osi już nie ma. Odśwież ekran i sprawdź, co się z nią stało.',
    } satisfies Record<ManualBookingProblem, string>,
    blad: 'Nie udało się wpisać Rezerwacji. Spróbuj jeszcze raz za chwilę.',
  },

  /**
   * Limit Strzelnicy, który ręczny wpis przekracza. Te same trzy zdania stoją
   * w pytaniu o pewność i w szczegółach Rezerwacji: obsługa potwierdza dokładnie
   * to, co potem przy niej przeczyta.
   */
  przekroczenie: {
    'poza-godzinami-otwarcia': 'termin poza godzinami otwarcia Strzelnicy',
    'brak-instruktora': 'Instruktor ponad Pulę Strzelnicy',
    'ponad-pojemnosc-osi': 'Uczestnicy ponad pojemność Osi',
  } satisfies Record<LimitOverride, string>,

  /**
   * Skąd Rezerwacja się wzięła. Obsługa czyta z tego, z kim rozmawia, dzwoniąc
   * w jej sprawie — więc zdanie mówi o człowieku, a nie o kanale.
   */
  zrodlo: {
    widget: 'Widget — klient zarezerwował sam',
    panel: 'Panel — Rezerwacja przyjęta przez telefon',
  } satisfies Record<BookingSource, string>,

  /**
   * Dlaczego termin nie jest wolny — krótko, bo stoi w jednej linii listy
   * wyboru. Odrębne od słownika Widgetu, choć część powodów brzmi podobnie:
   * tam klient dowiaduje się, czego nie kupi, a tu obsługa, co przekracza.
   */
  powodTerminu: {
    'poza-godzinami-otwarcia': 'poza godzinami otwarcia',
    'poza-horyzontem': 'za horyzontem rezerwacji',
    przeszlosc: 'termin już minął',
    'ponizej-wyprzedzenia': 'za blisko początku',
    'termin-zajety': 'termin już zajęty',
    'brak-instruktora': 'brak wolnego Instruktora',
    'brak-sztuk-broni': 'brak sztuk zamówionej broni',
  } satisfies Record<Unavailability, string>,

  /** Termin, którego nic nie zdejmuje — tak samo jak w kalendarzu Widgetu. */
  wolnyTermin: 'wolny',

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
