/**
 * Wszystkie teksty Panelu w jednym miejscu — tak samo jak w Widgecie i z tego
 * samego powodu: jeden język i jeden wygląd dla wszystkich Strzelnic, więc
 * słownik jest stały, a nie ładowany.
 *
 * Odrębny od słownika Widgetu, choć część zdań brzmi podobnie: tam mówi się do
 * klienta o jego Rezerwacji, tu do obsługi o cudzych. „Termin jest Twój" i „Jan
 * Przykładowy, 2 os." to nie są dwa warianty jednego zdania.
 */
import {
  formatAmount,
  MAX_INSTRUCTOR_POOL,
  MAX_LANE_CAPACITY,
  MAX_RATE_GR,
  MAX_TERMS_LENGTH,
  MAX_TIME_RULE,
  MAX_UNIT_PRICE_GR,
  MAX_WEAPON_POOL,
} from '@strzelnica/shared'
import type {
  BookingSource,
  CatalogProblem,
  ClosureProblem,
  Database,
  EmbeddingProblem,
  FacilityConfigProblem,
  HoursProblem,
  InstructorPresence,
  LaneProblem,
  LimitOverride,
  ManualBookingProblem,
  OrderedItem,
  RevocationProblem,
  ScheduleProblem,
  Unavailability,
  Weekday,
} from '@strzelnica/shared'

type BookingStatus = Database['public']['Enums']['booking_status']

/**
 * Nazwy dni w porządku ISO — tym samym, którym liczy je `weekdayOf`. Jedna
 * kopia na cały Panel, bo pytają o nią dwa ekrany: rozkład Bloków i godziny
 * otwarcia. Druga rozjechałaby się przy pierwszej poprawce pisowni, a dzień
 * nazwany inaczej w dwóch miejscach jednego ekranu każe zgadywać, czy to ten
 * sam dzień.
 */
const DNI_TYGODNIA = {
  1: 'Poniedziałek',
  2: 'Wtorek',
  3: 'Środa',
  4: 'Czwartek',
  5: 'Piątek',
  6: 'Sobota',
  7: 'Niedziela',
} satisfies Record<Weekday, string>

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

  /**
   * Zestawienie dnia. Zdania mówią o magazynie i o zmianie, a nie o kliencie:
   * to jest lista do skompletowania przed otwarciem, a nie opis czyjejś
   * Rezerwacji.
   */
  zestawienie: {
    naglowek: 'Zestawienie dnia',
    wstep:
      'Co przygotować na ten dzień, zsumowane po wszystkich Rezerwacjach — ' +
      'dzień bierze się z kalendarza wyżej. Liczą się wyłącznie potwierdzone: ' +
      'oczekująca termin wprawdzie trzyma, ale do potwierdzenia adresu nie ' +
      'wiadomo nawet, czy ten ktoś istnieje, a po anulowanej, odwołanej ' +
      'i wygasłej nie przyjedzie już nikt.',
    bron: 'Broń do wypożyczenia',
    /** Nikt nie zamawia broni — odpowiedź, nie brak treści. */
    brakBroni: 'Tego dnia nikt nie wypożycza broni.',
    amunicja: 'Amunicja',
    brakAmunicji: 'Tego dnia nikt nie zamawia amunicji.',
    instruktor: 'Instruktor',
    /**
     * Rezerwacje, a nie sztuki: Instruktor jest człowiekiem do postawienia na
     * Osi, więc liczy się tym, ile razy ma gdzieś stanąć.
     */
    ilu: (ile: number) => `Rezerwacji z Instruktorem: ${ile}`,
    brakInstruktora: 'Tego dnia żadna Rezerwacja nie potrzebuje Instruktora.',
    /**
     * Nic do przygotowania — a to nie to samo, co brak Rezerwacji: dzień pełen
     * strzelających z własnej broni wygląda tutaj tak samo jak pusty, i słusznie,
     * bo z magazynu nie schodzi wtedy nic.
     */
    pusto:
      'Tego dnia nie ma czego przygotować — żadna potwierdzona Rezerwacja nie ' +
      'zamawia sprzętu ani Instruktora.',
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
   * Osie. Zdania mówią o obiekcie, a nie o dniu: to jest jedyny ekran Panelu,
   * którego treść nie zmienia się od tego, co przyniesie poranek.
   */
  osie: {
    naglowek: 'Osie',
    wstep:
      'Czym Strzelnica dysponuje i ile osób wolno na tym postawić. Oś ' +
      'wyłączona znika z Widgetu razem ze wszystkimi swoimi terminami, ale ' +
      'zostaje tutaj i w kalendarzu — razem z Rezerwacjami, które już na niej ' +
      'stoją. Skasować Osi nie da się wcale i jest to decyzja: skasowana ' +
      'zabrałaby ze sobą cudze Rezerwacje, a te znikają wyłącznie odwołaniem.',
    nazwa: 'Nazwa',
    /** Pojemność jest limitem Rezerwacji, a nie zasobem sprzedawanym osobno. */
    pojemnosc: 'Pojemność (Uczestników)',
    pojemnoscOpis: 'Ilu Uczestników wolno postawić na tej Osi jednocześnie.',
    /**
     * Stawka za Blok stoi przy Osi, a nie w cenniku Strzelnicy: jest jej
     * własnością, bo to na niej kiedyś stanie cennik zależny od pory dnia.
     * Pole pyta o złote, bo w złotych czyta się cennik; baza trzyma grosze.
     */
    stawka: 'Stawka za Blok (zł)',
    stawkaOpis: 'Za cały Blok; zero znaczy Oś w cenie wstępu.',
    /** Stawka po polsku, tak jak zobaczy ją klient — sprawdzenie, nie ozdoba. */
    stawkaPodglad: (kwota: string) =>
      `Klient zobaczy: ${kwota} za Blok, razem z pierwszym Uczestnikiem.`,
    czynna: 'Oś w ofercie',
    /** Znacznik przy nazwie wyłączonej Osi — widać go bez wchodzenia w pola. */
    wylaczona: 'wyłączona ze sprzedaży',
    zapisz: 'Zapisz',
    zapisywanie: 'Zapisuję…',
    zapisano: 'Oś zapisana.',
    nowa: 'Nowa Oś',
    /** Zdanie o tym, czego nowa Oś jeszcze nie ma — a bez czego nic nie sprzeda. */
    wstepNowej:
      'Nowa Oś wchodzi bez rozkładu, więc nie ma jeszcze ani jednego terminu ' +
      'do wzięcia. Stawkę za Blok wpisz od razu tutaj: rozkład wypisany przy ' +
      'stawce zerowej sprzedaje terminy za darmo.',
    dodaj: 'Dodaj Oś',
    dodawanie: 'Dodaję…',
    dodano: 'Oś dodana. Wypisz jej Bloki w rozkładzie niżej.',
    /**
     * Odmowy, każda z podpowiedzią co dalej. Pierwsze dwie wypisuje sam
     * formularz; „nazwa zajęta" przychodzi i stąd, i z bazy — dopiero ona wie,
     * co koleżanka z drugiej zmiany dodała minutę temu.
     *
     * „Nieznana Oś" znaczy Oś, której baza tej Strzelnicy nie przypisuje,
     * a formularz poprawia Oś wziętą z tej właśnie Strzelnicy: żeby to zdanie
     * stanęło na ekranie, Oś musiałaby zniknąć między odczytem a kliknięciem.
     */
    problem: {
      'brak-nazwy': 'Podaj nazwę Osi — po niej obsługa pozna ją w każdym polu wyboru.',
      'nazwa-zajeta': 'Taką nazwę nosi już inna Oś tej Strzelnicy. Wpisz inną.',
      'zla-pojemnosc': (
        'Pojemność jest liczbą Uczestników — całkowitą, dodatnią i nie ' +
        `większą niż ${MAX_LANE_CAPACITY}.`
      ),
      'zla-stawka': (
        'Stawka za Blok jest kwotą w złotych — zerową albo dodatnią, z co ' +
        `najwyżej dwiema cyframi po przecinku i nie większą niż ` +
        `${formatAmount(MAX_RATE_GR)}. Zero znaczy Oś w cenie wstępu.`
      ),
      'nieznana-os': 'Tej Osi już nie ma. Odśwież ekran i sprawdź, co się z nią stało.',
    } satisfies Record<LaneProblem, string>,
    blad: 'Nie udało się zapisać Osi. Spróbuj jeszcze raz za chwilę.',
  },

  /**
   * Rozkład Bloków. Zdania mówią o tygodniu, a nie o dacie: rozkład jest
   * rytmem, który powtarza się co siedem dni, a nie planem konkretnego dnia.
   */
  rozklad: {
    naglowek: 'Rozkład Bloków',
    wstep:
      'Terminy, które Strzelnica wystawia na sprzedaż: osobno dla każdej Osi ' +
      'i osobno na każdy dzień tygodnia. Bloku nie składa się z dowolnych ' +
      'minut — zaczyna się na pełnej połowie godziny i tyle samo trwa. ' +
      'Zapisany rozkład Widget pokazuje od razu; Rezerwacji już złożonych nie ' +
      'rusza wcale, także wtedy, gdy przestają do niego pasować.',
    os: 'Oś, której rozkład układasz',
    dzien: DNI_TYGODNIA,
    /** Dzień bez Bloków jest odpowiedzią, a nie brakiem treści. */
    pustyDzien: 'Tego dnia Oś nie ma żadnego Bloku.',
    poczatek: 'Początek',
    dlugosc: 'Długość (minuty)',
    dodajBlok: 'Dodaj Blok',
    /** Zakres Bloku; koniec bywa jutrzejszy, więc mówi o tym wprost. */
    zakres: (od: string, doKiedy: string, jutro: boolean) =>
      `${od}–${doKiedy}${jutro ? ' (nazajutrz)' : ''}`,
    usun: 'Usuń',
    usunOpis: (zakres: string) => `Usuń Blok ${zakres}`,
    kopiowanieDnia: 'Przepisanie dnia',
    zrodlowyDzien: 'Dzień do przepisania',
    doceloweDni: 'Dni, które mają wyglądać tak samo',
    kopiujDzien: 'Przepisz dzień',
    kopiowanieOsi: 'Przepisanie rozkładu innej Osi',
    zrodlowaOs: 'Oś do przepisania',
    kopiujOs: 'Przepisz rozkład',
    /**
     * Kopiowanie zastępuje, a nie dokłada — i trzeba to powiedzieć przed
     * kliknięciem, bo po nim dnia docelowego nie ma już czym odzyskać inaczej
     * niż porzuceniem całej poprawki.
     */
    kopiowanieWstep:
      'Przepisanie zastępuje rozkład dnia albo Osi docelowej w całości. ' +
      'Zmiana staje się prawdziwa dopiero po zapisaniu.',
    niezapisane: 'Rozkład ma niezapisane zmiany — Widget zobaczy je dopiero po zapisaniu.',
    zapisz: 'Zapisz rozkład',
    zapisywanie: 'Zapisuję…',
    zapisano: 'Rozkład zapisany — Widget pokazuje go od tej chwili.',
    /** Bez Osi nie ma czego układać; rozkład jest zawsze rozkładem którejś. */
    brakOsi: 'Najpierw dodaj Oś — rozkład jest rozkładem którejś z nich.',
    problem: {
      'poza-siatka': 'Blok zaczyna się o pełnej godzinie albo w jej połowie — nie pomiędzy.',
      'zla-dlugosc':
        'Blok trwa wielokrotność trzydziestu minut i nie dłużej niż dobę. ' +
        'Dłuższy termin wypisz jako kilka Bloków.',
      'nachodzace-bloki':
        'Dwa Bloki tej Osi zachodzą na siebie — także wtedy, gdy jeden ' +
        'przechodzi przez północ na dzień następny.',
      'nieznana-os': 'Tej Osi już nie ma. Odśwież ekran i sprawdź, co się z nią stało.',
    } satisfies Record<ScheduleProblem, string>,
    blad: 'Nie udało się zapisać rozkładu. Spróbuj jeszcze raz za chwilę.',
  },

  /**
   * Godziny otwarcia i Wyjątki kalendarzowe. Zdania mówią o **Strzelnicy**,
   * a nie o Osi: godziny są jej własnością, więc zamknięcie zdejmuje terminy
   * wszystkim Osiom naraz — i trzeba to powiedzieć wprost, bo sąsiedni ekran
   * mówi o jednej Osi na raz.
   */
  godziny: {
    naglowek: 'Godziny otwarcia',
    wstep:
      'Kiedy Strzelnica jest czynna — wspólnie dla wszystkich Osi. Blok ' +
      'wypisany poza godzinami zostaje w kalendarzu, ale nie jest do wzięcia, ' +
      'a dzień zamknięty nie pokazuje klientowi ani jednego Bloku. Rezerwacji ' +
      'już złożonych zmiana nie rusza: te, które wypadną poza godziny, ' +
      'wypiszemy niżej do rozstrzygnięcia.',
    dzien: DNI_TYGODNIA,
    /** Pole zaznaczane przy dniu; niezaznaczony znaczy dzień zamknięty. */
    otwarte: 'Otwarte',
    otwarcie: 'Otwarcie',
    zamkniecie: 'Zamknięcie',
    /** Zamknięcie po północy należy już do dnia następnego i mówi to wprost. */
    nazajutrz: (godzina: string) => `${godzina} (nazajutrz)`,
    /** Godziny dnia jednym napisem — tak samo jak zakres Bloku w rozkładzie. */
    zakres: (od: string, doKiedy: string) => `${od}–${doKiedy}`,
    /** Dzień zamknięty jest odpowiedzią, a nie brakiem treści. */
    zamkniety: 'Zamknięte przez cały dzień.',
    niezapisane: 'Godziny mają niezapisane zmiany — Widget zobaczy je dopiero po zapisaniu.',
    zapisz: 'Zapisz godziny',
    zapisywanie: 'Zapisuję…',
    zapisano: 'Godziny zapisane — Widget pokazuje je od tej chwili.',
    blad: 'Nie udało się zapisać godzin. Spróbuj jeszcze raz za chwilę.',

    /**
     * Kolizje: Rezerwacje, które po tej zmianie stoją poza godzinami. Zdanie
     * mówi, co się z nimi stanie — czyli nic — bo o to pyta się pierwsze:
     * ekran, który tylko ostrzega, każe podejrzewać, że coś właśnie skasował.
     */
    kolizje: {
      naglowek: 'Rezerwacje poza godzinami',
      wstep:
        'Te Rezerwacje stoją poza godzinami, które właśnie ustawiasz. Zostają ' +
        'na Osi — zmiana godzin nikomu terminu nie odbiera. Rozstrzygnij każdą ' +
        'sama: odwołaj z powodem albo zostaw, bo klient i tak przyjedzie.',
    },

    /**
     * Wyjątki. Osobna lista pod tygodniem, bo odpowiadają na inne pytanie:
     * tydzień mówi o rytmie, wyjątek o jednej dacie — i to on wygrywa.
     */
    wyjatki: {
      naglowek: 'Wyjątki kalendarzowe',
      wstep:
        'Daty, które nie idą rytmem tygodnia: święta, zawody, dzień skrócony. ' +
        'Wyjątek zastępuje godziny tygodniowe w całości — także wtedy, gdy ' +
        'otwiera dzień, który w tygodniu jest zamknięty. Data, która wyjątek ' +
        'już ma, dostaje nowy w miejsce poprzedniego.',
      /** Lista pusta jest odpowiedzią: kalendarz idzie rytmem tygodnia. */
      pusto: 'Żadna data nie wychodzi poza rytm tygodnia.',
      /** Legenda ramki formularza — mówi, czego dotyczy to, co w niej stoi. */
      formularz: 'Wyjątek na wskazaną datę',
      data: 'Data',
      powod: 'Powód (dla obsługi)',
      /** Niezaznaczone znaczy dzień skrócony — wtedy pola godzin mają treść. */
      zamkniecieCalodniowe: 'Zamknięte przez cały dzień',
      dodaj: 'Zapisz wyjątek',
      dodawanie: 'Zapisuję…',
      zapisano: 'Wyjątek zapisany — Widget widzi go od tej chwili.',
      /**
       * Wiersz listy: data, jej dzień tygodnia, co się tego dnia dzieje
       * i powód. Powód bywa pusty — wyjątek bez opisu jest wyjątkiem, a nie
       * wpisem niedokończonym — więc doklejamy go dopiero, gdy jest.
       */
      pozycja: (data: string, dzien: string, opis: string, powod: string) =>
        `${data} · ${dzien} — ${opis}${powod ? ` · ${powod}` : ''}`,
      /**
       * Ostrzeżenie przy wyjątku, którego zdjęcie wypchnie Rezerwacje poza
       * godziny — bo data wydłużona wyjątkiem wraca do krótszego tygodnia.
       * Liczbą, a nie zdaniem z odmianą: „Rezerwacji: 3" jest poprawne dla
       * każdej liczby, a lista i tak stoi wyżej.
       */
      zdjecieKoliduje: (ile: number) => `· po zdjęciu poza godzinami stanie Rezerwacji: ${ile}`,
      zdejmij: 'Zdejmij',
      zdejmijOpis: (data: string) => `Zdejmij wyjątek z dnia ${data}`,
      zdjeto: 'Wyjątek zdjęty — data wraca do rytmu tygodnia.',
      blad: 'Nie udało się zapisać wyjątku. Spróbuj jeszcze raz za chwilę.',
      /** Opis wyjątku na liście: sama data nie mówi, co się na niej dzieje. */
      opis: (godziny: string | null) => godziny ?? 'zamknięte przez cały dzień',
    },

    /**
     * Odmowy. Wszystkie trzy pierwsze wypisuje sam formularz, zanim cokolwiek
     * wyśle; serwer liczy je po raz drugi tą samą funkcją.
     *
     * „Nieznana Strzelnica" znaczy konto bez powiązania — Panel powiedziałby to
     * samo już przy wczytywaniu, więc żeby to zdanie stanęło na ekranie, wpis
     * musiałby zniknąć między odczytem a kliknięciem.
     */
    problem: {
      'zle-godziny':
        'Zamknięcie musi wypadać po otwarciu i nie później niż dobę po nim. ' +
        'Dzień bez ani jednej minuty otwarcia zaznacz jako zamknięty.',
      'powtorzony-dzien': 'Ten sam dzień tygodnia ma dwie pary godzin. Zostaw jedną.',
      'zla-data': 'Podaj datę wyjątku w postaci RRRR-MM-DD.',
      'nieznana-strzelnica':
        'To konto nie jest powiązane z żadną Strzelnicą. Zgłoś to operatorowi platformy.',
    } satisfies Record<HoursProblem, string>,
  },

  /**
   * Listy „do rozstrzygnięcia" — Rezerwacje, które po zmianie konfiguracji
   * przestają się w niej mieścić. Wspólne dla godzin otwarcia i dla katalogu,
   * bo obie odpowiadają na to samo pytanie i wyglądają tak samo; różni je
   * wyłącznie zdanie wstępne, a to podaje ekran, który listę pokazuje.
   */
  kolizje: {
    /**
     * Kalendarz Panelu sięga tydzień wstecz i po horyzont Strzelnicy, więc
     * dalej nie ma czego zestawiać ani z godzinami, ani z pulą. Milczenie o tym
     * wyglądałoby jak „nie ma kolizji".
     */
    okno: 'Sprawdzamy wyłącznie Rezerwacje z okna kalendarza wyżej.',
    pozycja: (dzien: string, godziny: string, os: string, klient: string) =>
      `${dzien}, ${godziny} · ${os} · ${klient}`,
  },

  /**
   * Cennik wspólny dla całej Strzelnicy, Pula instruktorów i reguły czasowe.
   * Zdania mówią o tym, co obsługa ustala **raz**, a co potem rozstrzyga
   * o każdym pojedynczym terminie i o każdej Kwocie — więc każde z nich mówi
   * też, co znaczy zero: żadna z tych sześciu liczb nie jest pomyłką przy
   * zerze, a każde zero znaczy co innego.
   */
  cennik: {
    naglowek: 'Cennik i reguły',
    wstep:
      'Ile u Ciebie kosztuje strzelanie, ilu masz Instruktorów i jak daleko ' +
      'w przód przyjmujesz zgłoszenia. Zmiana wchodzi natychmiast i widzi ją ' +
      'każdy klient, który akurat ma otwarty formularz — ale Rezerwacji ' +
      'złożonych wcześniej nie rusza: każda niesie własną Kwotę wraz ze ' +
      'stawkami, po których się policzyła, i własny termin.',
    /** Stawka po polsku, tak jak zobaczy ją klient — sprawdzenie, nie ozdoba. */
    stawkaPodglad: (kwota: string) => `Klient zobaczy: ${kwota}.`,
    zapisz: 'Zapisz cennik i reguły',
    zapisywanie: 'Zapisuję…',
    zapisano: 'Cennik i reguły zapisane.',
    blad: 'Nie udało się zapisać cennika i reguł. Spróbuj jeszcze raz za chwilę.',

    stawki: {
      naglowek: 'Stawki Strzelnicy',
      /**
       * Trzeba tu powiedzieć wprost, czego na tym ekranie **nie ma**: stawka
       * za Blok jest własnością Osi, więc szukanie jej tutaj kończyłoby się
       * telefonem do kogoś, kto pamięta.
       */
      wstep:
        'Dwie stawki wspólne dla wszystkich Osi. Stawkę za Blok ustawia się ' +
        'osobno na każdej Osi, w sekcji „Osie" wyżej — bo bywa na nich różna. ' +
        'Ceny sprzętu niosą katalogi.',
      uczestnictwo: 'Stawka za uczestnictwo (zł)',
      /** Pierwszy Uczestnik jest wliczony w stawkę za Blok — inaczej liczyłby się dwa razy. */
      uczestnictwoOpis: 'Za każdego Uczestnika poza pierwszym; zero znaczy w cenie Bloku.',
      instruktor: 'Stawka za Instruktora (zł)',
      instruktorOpis:
        'Za samą obecność Instruktora — tak samo, gdy wymagany, jak gdy zamówiony.',
    },

    pula: {
      naglowek: 'Pula instruktorów',
      wstep:
        'Ilu Instruktorów jesteś w stanie zapewnić w tym samym czasie. ' +
        'Liczy się po całej Strzelnicy, bo Instruktor nadzoruje ludzi, a nie ' +
        'stanowisko: Rezerwacje z różnych Osi konkurują o tę samą Pulę. ' +
        'Wyczerpana zdejmuje termin klientowi bez Pozwolenia i temu, który ' +
        'Instruktora zamawia — pozostałym nie odbiera nic.',
      etykieta: 'Pula (Instruktorów)',
      /**
       * Zero jest tu konfiguracją, a nie pomyłką, i trzeba to powiedzieć
       * wprost: obsługa musi wiedzieć, co dokładnie wyłącza, zanim wpisze zero.
       */
      opis: 'Zero znaczy Strzelnicę bez nadzoru — zarezerwuje tylko ktoś z Pozwoleniem.',
    },

    /**
     * Przekroczenia Puli: Rezerwacje, którym po jej zmniejszeniu Instruktorów
     * już nie starcza. Zdanie mówi, co się z nimi stanie — czyli nic — bo o to
     * pyta się pierwsze: ekran, który tylko ostrzega, każe podejrzewać, że coś
     * właśnie skasował. Ta sama decyzja, co przy puli sztuk broni.
     */
    przekroczenia: {
      naglowek: 'Rezerwacje ponad Pulę instruktorów',
      wstep:
        'Tym Rezerwacjom nadzoru w tej Puli już nie starcza. Zostają ze swoim ' +
        'Instruktorem — zmniejszenie Puli nikomu go nie odbiera. Rozstrzygnij ' +
        'każdą sama: zmień komuś grafik, zadzwoń do klienta albo odwołaj ' +
        'z powodem.',
      /** Ilu Instruktorów w tym czasie obiecano i z jakiej Puli — liczbami, bez odmiany. */
      nadzor: (zajetych: number, pula: number) =>
        `· Instruktorów w tym czasie: ${zajetych} z ${pula}`,
    },

    reguly: {
      naglowek: 'Reguły czasowe',
      wstep:
        'Jak daleko w przód przyjmujesz zgłoszenia, jak blisko terminu jeszcze ' +
        'je przyjmujesz i do kiedy klient anuluje sam. Zmiana dotyczy tego, co ' +
        'klient dopiero zarezerwuje — terminów już wziętych nie skraca ani nie ' +
        'przesuwa.',
      horyzont: 'Horyzont rezerwacji (dni)',
      /** Liczony od dzisiejszego dnia Strzelnicy, nie od jutra — zero czyta się inaczej. */
      horyzontOpis: 'Licząc od dzisiaj; zero znaczy przyjmowanie wyłącznie na dzisiaj.',
      wyprzedzenie: 'Minimalne wyprzedzenie (minut)',
      wyprzedzenieOpis:
        'Ile minut przed początkiem Bloku zamykasz zapisy; zero znaczy do ostatniej chwili.',
      okno: 'Okno anulowania (godzin)',
      oknoOpis:
        'Na ile godzin przed terminem klient anuluje sam; zero znaczy aż do samego terminu.',
    },

    /**
     * Odmowy, każda z podpowiedzią co dalej. Wszystkie wypisuje sam formularz —
     * inaczej niż przy Osi i katalogu, gdzie o zajętej nazwie rozstrzyga dopiero
     * baza: tu nie ma nazwy, o którą dwie zmiany mogłyby się pobić, bo wiersz
     * Strzelnicy jest jeden.
     *
     * „Nieznana Strzelnica" znaczy konto bez powiązania — zdarza się między
     * założeniem konta a wpisem w `panel_users`, a ten ekran otwiera się
     * wyłącznie po odczycie, który już to powiązanie znalazł.
     */
    problem: {
      'zla-stawka-uczestnictwa': (
        'Stawka za uczestnictwo jest kwotą w złotych — zerową albo dodatnią, ' +
        'z co najwyżej dwiema cyframi po przecinku i nie większą niż ' +
        `${formatAmount(MAX_RATE_GR)}.`
      ),
      'zla-stawka-instruktora': (
        'Stawka za Instruktora jest kwotą w złotych — zerową albo dodatnią, ' +
        'z co najwyżej dwiema cyframi po przecinku i nie większą niż ' +
        `${formatAmount(MAX_RATE_GR)}.`
      ),
      'zla-pula-instruktorow': (
        'Pula instruktorów jest liczbą ludzi — całkowitą, od zera do ' +
        `${MAX_INSTRUCTOR_POOL}. Zero znaczy Strzelnicę bez nadzoru.`
      ),
      'zly-horyzont': (
        'Horyzont rezerwacji jest liczbą dni — całkowitą, od zera do ' +
        `${MAX_TIME_RULE}. Zero znaczy przyjmowanie wyłącznie na dzisiaj.`
      ),
      'zle-wyprzedzenie': (
        'Minimalne wyprzedzenie jest liczbą minut — całkowitą, od zera do ' +
        `${MAX_TIME_RULE}. Zero znaczy zapisy do ostatniej chwili.`
      ),
      'zle-okno-anulowania': (
        'Okno anulowania jest liczbą godzin — całkowitą, od zera do ' +
        `${MAX_TIME_RULE}. Zero znaczy anulowanie aż do samego terminu.`
      ),
      'nieznana-strzelnica':
        'To konto nie jest powiązane z żadną Strzelnicą. Zgłoś to operatorowi platformy.',
    } satisfies Record<FacilityConfigProblem, string>,
  },

  /**
   * Osadzenie Widgetu i dokumenty Strzelnicy. Jedyny ekran konfiguracji, który
   * mówi o cudzej stronie WWW — więc zdania są tu o tym, co obsługa ma zrobić
   * u siebie, a nie o grafiku: skopiować znacznik, wpisać domenę, wkleić
   * regulamin.
   */
  osadzenie: {
    naglowek: 'Osadzenie i dokumenty',
    wstep:
      'Gdzie wolno pokazać Twój Widget i na jakich warunkach się u Ciebie ' +
      'rezerwuje. Zmiana wchodzi natychmiast: domena skasowana z listy ' +
      'przestaje osadzać przy następnym wejściu, a nowy regulamin widzi ' +
      'pierwszy klient, który otworzy formularz.',
    zapisz: 'Zapisz osadzenie i dokumenty',
    zapisywanie: 'Zapisuję…',
    zapisano: 'Osadzenie i dokumenty zapisane.',
    blad: 'Nie udało się zapisać osadzenia. Spróbuj jeszcze raz za chwilę.',

    znacznik: {
      naglowek: 'Kod do wklejenia',
      wstep:
        'Wklej to na swojej stronie w miejscu, w którym ma stanąć rezerwacja. ' +
        'Nic poza tym nie jest potrzebne — kalendarz pojawi się sam. Pamiętaj, ' +
        'żeby domena tej strony stała niżej na liście dozwolonych.',
      etykieta: 'Znacznik osadzenia',
      kopiuj: 'Kopiuj',
      skopiowano: 'Skopiowane.',
      /**
       * Adres Widgetu i identyfikator Strzelnicy są konfiguracją platformy,
       * a nie jej własną, więc ich brak jest sprawą dla nas — i trzeba to
       * powiedzieć wprost, żeby nikt nie szukał pola, którego tu nie ma.
       */
      brakZnacznika:
        'Nie ma z czego złożyć znacznika — brakuje adresu, spod którego ' +
        'podawany jest Widget, albo identyfikatora Twojej Strzelnicy. Jedno ' +
        'i drugie ustawia operator platformy; zgłoś mu to.',
    },

    domeny: {
      naglowek: 'Dozwolone domeny',
      wstep:
        'Strony, na których wolno osadzić Twój Widget. Pusta lista znaczy ' +
        '„nigdzie": dopóki nie wpiszesz swojej domeny, przeglądarka nie pokaże ' +
        'kalendarza u nikogo. Skasowanie domeny działa tak samo — zabiera ' +
        'Widget z tamtej strony, ale nie rusza ani jednej Rezerwacji, która ' +
        'już z niej przyszła.',
      etykieta: 'Domena',
      opis: 'Sam adres domeny, ze schematem i bez ścieżki, np. https://moja-strzelnica.pl',
      dodaj: 'Dodaj domenę',
      usun: (domena: string) => `Usuń ${domena}`,
      pusta: 'Żadna strona nie może osadzić Twojego Widgetu.',
      /**
       * Wpis nie do odczytania — wytknięty od razu, zanim wejdzie na listę.
       * Zdanie stoi tu, a nie bierze się z wyjątku `normalizeOrigin`: ten mówi
       * do konsoli i do Edge Function, a na ekran Panelu idzie polszczyzna
       * z tego słownika, tak samo jak każde inne zdanie tego ekranu.
       */
      zlyZapis:
        'To nie jest domena: podaj sam adres ze schematem, bez ścieżki ' +
        'i parametrów, np. https://moja-strzelnica.pl',
    },

    dokumenty: {
      naglowek: 'Regulamin i polityka prywatności',
      wstep:
        'To, co klient akceptuje przy Rezerwacji. Twoje dokumenty, nie nasze — ' +
        'dopóki są puste, przy zgodzie stoi samo zdanie o akceptacji i klient ' +
        'nie ma czego przeczytać.',
      regulamin: 'Treść regulaminu',
      regulaminOpis: `Pokazuje się w Widgecie przy zgodzie; najwyżej ${MAX_TERMS_LENGTH} znaków.`,
      polityka: 'Adres polityki prywatności',
      politykaOpis: 'Pełny adres strony z polityką, np. https://moja-strzelnica.pl/prywatnosc',
    },

    /**
     * Odmowy, każda z podpowiedzią co dalej. „Nieznana Strzelnica" znaczy konto
     * bez powiązania — tak samo jak przy cenniku.
     */
    problem: {
      'zla-domena':
        'Któraś z domen nie jest domeną: ma być sam adres ze schematem, bez ' +
        'ścieżki i parametrów, np. https://moja-strzelnica.pl',
      'za-dlugi-regulamin': `Regulamin ma najwyżej ${MAX_TERMS_LENGTH} znaków. Zostaw w nim to, na co klient się godzi, a resztę wystaw na swojej stronie.`,
      'zly-adres-polityki':
        'Adres polityki prywatności ma być pełnym adresem strony, ' +
        'np. https://moja-strzelnica.pl/prywatnosc. Pusty znaczy: nie podaję.',
      'nieznana-strzelnica':
        'To konto nie jest powiązane z żadną Strzelnicą. Zgłoś to operatorowi platformy.',
    } satisfies Record<EmbeddingProblem, string>,
  },

  /**
   * Katalogi sprzętu: Typy broni i Rodzaje amunicji. Zdania mówią o ofercie
   * i o magazynie, a nie o grafiku — to jedyny ekran konfiguracji, który nie
   * mówi o czasie wcale.
   */
  katalogi: {
    naglowek: 'Katalogi sprzętu',
    wstep:
      'Czym u Ciebie się strzela i czym się do tego ładuje — to, co klient ' +
      'wybiera w formularzu Rezerwacji. Pozycji się nie kasuje, tylko wycofuje: ' +
      'wycofana znika z Widgetu, ale zostaje w Rezerwacjach złożonych wcześniej ' +
      'i dalej opisuje sprzęt, który komuś obiecano. Zmiana ceny Kwot już ' +
      'złożonych Rezerwacji nie rusza — każda niesie ceny, po których się ' +
      'policzyła.',
    nazwa: 'Nazwa',
    /** Pole pyta o złote, bo w złotych czyta się cennik; baza trzyma grosze. */
    cena: 'Cena za sztukę (zł)',
    cenaOpis: 'Za jedną sztukę; zero znaczy sprzęt w cenie wstępu.',
    /** Cena po polsku, tak jak zobaczy ją klient — sprawdzenie, nie ozdoba. */
    cenaPodglad: (kwota: string) => `Klient zobaczy: ${kwota} za sztukę.`,
    /** Znacznik przy nazwie pozycji wycofanej — widać go bez wchodzenia w pola. */
    wycofana: 'wycofana ze sprzedaży',
    zapisz: 'Zapisz',
    zapisywanie: 'Zapisuję…',
    dodawanie: 'Dodaję…',

    bron: {
      naglowek: 'Typy broni',
      wstep:
        'Pula to liczba sztuk, którymi dysponujesz: więcej nie wypożyczysz ' +
        'w nakładających się na siebie terminach. Pula zerowa znaczy Typ, ' +
        'którego chwilowo nie ma czym obsłużyć — a nie Typ wycofany.',
      pula: 'Pula (sztuk)',
      pulaOpis: 'Zero znaczy Typ, którego chwilowo nie ma czym obsłużyć — nie wycofany.',
      wOfercie: 'Typ w ofercie',
      nowy: 'Nowy Typ broni',
      dodaj: 'Dodaj Typ',
      dodano: 'Typ broni dodany.',
      zapisano: 'Typ broni zapisany.',
    },

    amunicja: {
      naglowek: 'Rodzaje amunicji',
      /**
       * Brak puli jest tu treścią, a nie przeoczeniem (ADR 0004) — i trzeba to
       * powiedzieć wprost, bo formularz obok o pulę pyta.
       */
      wstep:
        'Amunicja nie ma puli i mieć nie będzie: nie wraca do Ciebie, więc ' +
        'system nie prowadzi jej stanu magazynowego i nigdy nie odmówi ' +
        'z powodu jej braku. Zapotrzebowanie klienta jest zapowiedzią, po ' +
        'której masz co przygotować.',
      wOfercie: 'Rodzaj w ofercie',
      nowy: 'Nowy Rodzaj amunicji',
      dodaj: 'Dodaj Rodzaj',
      dodano: 'Rodzaj amunicji dodany.',
      zapisano: 'Rodzaj amunicji zapisany.',
    },

    /**
     * Przekroczenia puli: Rezerwacje, którym po jej zmniejszeniu sztuk już nie
     * starcza. Zdanie mówi, co się z nimi stanie — czyli nic — bo o to pyta się
     * pierwsze: ekran, który tylko ostrzega, każe podejrzewać, że coś właśnie
     * skasował.
     */
    przekroczenia: {
      naglowek: 'Rezerwacje ponad pulę',
      wstep:
        'Tym Rezerwacjom sztuk w tej puli już nie starcza. Zostają ze swoimi ' +
        'sztukami — zmniejszenie puli nikomu broni nie odbiera. Rozstrzygnij ' +
        'każdą sama: pożycz sprzęt, zadzwoń do klienta albo odwołaj z powodem.',
      /** Ile sztuk w tym czasie obiecano i z jakiej puli — liczbami, bez odmiany. */
      sztuki: (wydane: number, pula: number) => `· sztuk w tym czasie: ${wydane} z ${pula}`,
    },

    /**
     * Odmowy, każda z podpowiedzią co dalej. Trzy pierwsze wypisuje sam
     * formularz; „nazwa zajęta" przychodzi i stąd, i z bazy — dopiero ona wie,
     * co koleżanka z drugiej zmiany dodała minutę temu.
     *
     * „Nieznana pozycja" znaczy pozycję, której baza tej Strzelnicy nie
     * przypisuje, a formularz poprawia pozycję wziętą z tej właśnie Strzelnicy:
     * żeby to zdanie stanęło na ekranie, musiałaby zniknąć między odczytem
     * a kliknięciem.
     */
    problem: {
      'brak-nazwy': 'Podaj nazwę — po niej klient pozna sprzęt w formularzu.',
      'nazwa-zajeta':
        'Taką nazwę nosi już inna pozycja tego katalogu — także wycofana. Wpisz inną.',
      'zla-pula': `Pula jest liczbą sztuk: całkowitą, nieujemną i nie większą niż ${MAX_WEAPON_POOL}.`,
      'zla-cena':
        'Cenę podaj w złotych, najwyżej z dwiema cyframi po przecinku — na ' +
        `przykład 50,00 — i nie wyższą niż ${formatAmount(MAX_UNIT_PRICE_GR)} za sztukę.`,
      'nieznana-pozycja':
        'Tej pozycji już nie ma. Odśwież ekran i sprawdź, co się z nią stało.',
    } satisfies Record<CatalogProblem, string>,
    blad: 'Nie udało się zapisać pozycji katalogu. Spróbuj jeszcze raz za chwilę.',
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
 * Pozycja zamówienia jednym napisem: nazwa z katalogu i liczba sztuk. Osobno,
 * bo czytają ją dwa ekrany — opis Rezerwacji i Zestawienie dnia — a dwie kopie
 * tego myślnika rozjechałyby się przy pierwszej poprawce jednej z nich.
 */
export function opisPozycji(pozycja: OrderedItem): string {
  return `${pozycja.name} — ${teksty.sztuki(pozycja.quantity)}`
}

/**
 * Zamówiony sprzęt jednym zdaniem. Ta sama postać, co w Widgecie i w liście
 * do Strzelnicy — obsługa czyta to samo, co dostał klient.
 */
export function opisZamowionych(pozycje: readonly OrderedItem[], brak: string): string {
  if (pozycje.length === 0) return brak
  return pozycje.map(opisPozycji).join(', ')
}
