/**
 * Wszystkie teksty Widgetu w jednym miejscu — spec: „teksty w jednym słowniku
 * zamiast wplecione w komponenty". Jeden wygląd i jeden język dla wszystkich
 * Strzelnic, więc słownik jest stały, a nie ładowany.
 */
import type {
  AmmunitionDemand,
  AmmunitionKind,
  BookingDraft,
  BookingProblem,
  ConfirmationProblem,
  Database,
  OrderedItem,
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
  /** Jednostka wspólna dla Wypożyczeń i amunicji — jedno i drugie liczy się w sztukach. */
  sztuki: (ile: number) => `${ile} szt.`,
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
    etykieta: 'Wypożyczenie',
    wlasnaBron: 'brak — własna broń',
  },
  /**
   * Zapotrzebowanie na amunicję. Stoi w formularzu obok Wypożyczenia, ale
   * mówi o czymś innym i musi to powiedzieć wprost: Strzelnica nie odkłada
   * tych sztuk na bok (ADR 0004). Bez tego zdania „zamówiłem 200 sztuk"
   * czytałoby się jak rezerwacja towaru — a rozczarowanie na miejscu byłoby
   * nasze, nie klienta.
   *
   * Nie ma tu odpowiednika „pozostało N sztuk" ani Rodzaju wyczerpanego:
   * puli nie ma, więc nie ma czego odliczać.
   */
  amunicja: {
    legenda: 'Amunicja',
    wyjasnienie:
      'To zapowiedź dla Strzelnicy, żeby przygotowała amunicję na Twój przyjazd — ' +
      'nie rezerwacja towaru. Możesz też przyjechać z własną albo dokupić na miejscu.',
    brakKatalogu: 'Ta Strzelnica nie przyjmuje zamówień na amunicję.',
    etykieta: 'Amunicja',
    wlasnaAmunicja: 'brak — własna albo kupiona na miejscu',
  },
  /**
   * Kwota do zapłaty. Etykiety składników są nazwami z CONTEXT.md, a nie
   * skrótami: Osoba rezerwująca czyta rachunek raz i ma go zrozumieć bez
   * wracania do reszty formularza.
   *
   * Zdanie o płatności na miejscu stoi przy każdej Kwocie. Moduł Kwotę
   * wyłącznie prezentuje — nie ma płatności online, zadatku ani faktury —
   * a formularz, który liczy pieniądze i nie mówi, gdzie się je płaci, każe
   * szukać pola karty do samego końca.
   */
  kwota: {
    naglowek: 'Kwota do zapłaty',
    blok: 'Blok na Osi',
    uczestnictwo: 'Opłata za uczestnictwo',
    instruktor: 'Instruktor',
    bron: 'Wypożyczenie broni',
    amunicja: 'Amunicja',
    razem: 'Razem',
    naMiejscu: 'Płatność na miejscu w Strzelnicy — tutaj nic nie pobieramy.',
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
  /**
   * Ekran po wysłaniu zgłoszenia. Termin jest już zajęty, ale jeszcze nie na
   * dobre: mówimy o tym wprost, bo Osoba rezerwująca, która zamknie tę stronę
   * przekonana, że sprawa załatwiona, straci termin bez ostrzeżenia.
   */
  potwierdzenie: {
    naglowek: 'Sprawdź skrzynkę',
    tresc: (minuty: number) =>
      `Wysłaliśmy link potwierdzający na Twój adres. Kliknij w niego w ciągu ${minuty} minut — ` +
      'do tego czasu trzymamy dla Ciebie ten termin. Potem wraca do puli.',
    // Zamrożenie Kwoty jest obietnicą wobec klienta, więc mówi się o nim
    // wprost, i to dopiero tutaj: przed złożeniem Rezerwacji nie ma jeszcze
    // czego zamrażać, a cennik do tej chwili wolno Strzelnicy zmienić.
    kwotaZamrozona: 'Ta Kwota już się nie zmieni, także gdy Strzelnica zmieni cennik.',
    numer: (id: string) => `Numer Rezerwacji: ${id}`,
    wrocDoKalendarza: 'Wróć do kalendarza',
  },
  /**
   * Ekran, na który prowadzi link z e-maila. Osoba rezerwująca trafia tu wprost
   * ze skrzynki, więc każde zdanie musi dać się przeczytać bez pamięci o tym,
   * co działo się w formularzu pół godziny wcześniej.
   */
  potwierdzenieAdresu: {
    wczytywanie: 'Potwierdzamy Twój adres…',
    naglowek: 'Termin jest Twój',
    tresc: 'Adres potwierdzony, Rezerwacja jest trwała. Strzelnica czeka.',
    // Drugie wejście w ten sam link. Niczego nie zmienia — i właśnie dlatego
    // nie ma czym straszyć: Rezerwacja jest w porządku.
    juzPotwierdzona: 'Ten adres był już potwierdzony. Twoja Rezerwacja jest w mocy.',
    odmowa: 'Nie potwierdziliśmy adresu',
    powod: {
      'link-nieznany':
        'Nie znamy tego linku. Sprawdź, czy wkleiłeś go w całości — bywa, ' +
        'że klient poczty łamie długie adresy.',
      'rezerwacja-wygasla':
        'Ten termin czekał na potwierdzenie i się nie doczekał — wrócił do puli. ' +
        'Wybierz go jeszcze raz, jeśli wciąż jest wolny.',
      'rezerwacja-nieaktualna':
        'Ta Rezerwacja nie czeka już na potwierdzenie. Jeśli to pomyłka, ' +
        'skontaktuj się ze Strzelnicą.',
    } satisfies Record<ConfirmationProblem, string>,
    blad: 'Nie udało się potwierdzić adresu. Spróbuj jeszcze raz za chwilę.',
    doKalendarza: 'Zarezerwuj termin',
  },
  /**
   * Ekran spod linku do zarządzania Rezerwacją. Osoba rezerwująca wraca tu po
   * dniach albo tygodniach — z e-maila, nie ze strony Strzelnicy — więc ekran
   * musi się przeczytać sam, bez pamięci o formularzu.
   */
  zarzadzanie: {
    wczytywanie: 'Wczytujemy Twoją Rezerwację…',
    naglowek: 'Szczegóły Twojej Rezerwacji',
    /**
     * Co znaczy stan Rezerwacji. Wszystkie stany, także te, których klient
     * pod tym linkiem normalnie nie zobaczy: link żyje tak długo, jak
     * Rezerwacja, więc dożyje każdego z nich.
     */
    stan: {
      potwierdzona: 'Rezerwacja jest w mocy — Strzelnica czeka.',
      oczekujaca:
        'Ta Rezerwacja czeka jeszcze na potwierdzenie adresu. Sprawdź skrzynkę ' +
        'i kliknij link, który tam wysłaliśmy.',
      'anulowana-przez-klienta': 'Ta Rezerwacja jest anulowana. Termin wrócił do puli.',
      'odwolana-przez-strzelnice':
        'Strzelnica odwołała tę Rezerwację. Szczegóły powinny być w wiadomości od niej.',
      wygasla:
        'Ta Rezerwacja wygasła — adres nie został potwierdzony w czasie, a termin ' +
        'wrócił do puli.',
    } satisfies Record<Database['public']['Enums']['booking_status'], string>,
    /** Zdanie przy przycisku: dopóki jest czas, mówimy, ile go zostało. */
    doKiedy: (kiedy: string) => `Możesz anulować samodzielnie do ${kiedy}.`,
    anuluj: 'Anuluj Rezerwację',
    /**
     * Anulowanie zwalnia termin nieodwracalnie i cudzy klik weźmie go w minutę,
     * więc pytamy raz — a nie stawiamy przycisku, który działa od razu.
     */
    pewnie: 'Na pewno anulować? Termin od razu wróci do puli i ktoś inny może go wziąć.',
    tak: 'Tak, anuluj',
    nie: 'Zostawiam Rezerwację',
    anulowanie: 'Anulujemy…',
    anulowano: 'Anulowaliśmy Twoją Rezerwację. Termin wrócił do puli.',
    /** Powód, dla którego przycisku nie ma. Odmowa bez powodu wygląda na usterkę. */
    poOknie: (kiedy: string) =>
      `Okno anulowania minęło ${kiedy} — sami nie zwolnimy już tego terminu. ` +
      'Jeśli nie przyjedziesz, zadzwoń albo napisz do Strzelnicy.',
    kontakt: {
      naglowek: 'Kontakt do Strzelnicy',
      email: 'E-mail',
      telefon: 'Telefon',
      brak:
        'Ta Strzelnica nie podała nam kontaktu. Szukaj go na jej stronie — tej samej, ' +
        'na której rezerwowałeś.',
    },
    /**
     * Jedyna odmowa z własnym zdaniem. O pozostałych — oknie już domkniętym
     * i Rezerwacji nie do anulowania — mówi widok odczytany po kliknięciu na
     * nowo, i mówi dokładniej, bo zna stan Rezerwacji; zdanie napisane tutaj
     * musiałoby go zgadywać i stanęłoby obok prawdziwego.
     */
    linkNieznany:
      'Nie znamy tego linku. Sprawdź, czy wkleiłeś go w całości — bywa, ' +
      'że klient poczty łamie długie adresy.',
    blad: 'Nie udało się wczytać Rezerwacji. Spróbuj jeszcze raz za chwilę.',
    bladAnulowania: 'Nie udało się anulować Rezerwacji. Spróbuj jeszcze raz za chwilę.',
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
    'niepoprawne-zapotrzebowanie':
      'Popraw zamówienie amunicji: każdy Rodzaj najwyżej raz i po całych sztukach.',
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
 * Zamówione pozycje jednym zdaniem — wspólny kształt dla Wypożyczeń
 * i Zapotrzebowania, bo obie są tym samym: katalog razy liczba sztuk.
 *
 * Kolejność bierze się z katalogu, nie z kolejności klikania: lista, która
 * przestawia się przy każdej zmianie liczby sztuk, każe czytać ją od nowa.
 * Pozycja spoza katalogu idzie na koniec, a nie znika po cichu — zamówienie,
 * którego Strzelnica nie zna, ma być widoczne.
 *
 * Brak pozycji mówi o sobie wprost: pusta wartość w podsumowaniu wyglądałaby
 * na coś, o co nikt nie zapytał.
 */
function opisPozycji(
  pozycje: readonly { id: string; quantity: number }[],
  katalog: readonly { id: string; name: string }[],
  brak: string,
): string {
  const znane = katalog.flatMap((wpis) => {
    const pozycja = pozycje.find((kandydat) => kandydat.id === wpis.id)
    return pozycja ? [`${wpis.name} — ${teksty.sztuki(pozycja.quantity)}`] : []
  })
  const obce = pozycje
    .filter((pozycja) => !katalog.some((wpis) => wpis.id === pozycja.id))
    .map((pozycja) => `${pozycja.id} — ${teksty.sztuki(pozycja.quantity)}`)

  const opisane = [...znane, ...obce]
  return opisane.length === 0 ? brak : opisane.join(', ')
}

/**
 * Zamówiony sprzęt jednym zdaniem. Powtarzany na podsumowaniu i potwierdzeniu —
 * Osoba rezerwująca ma widzieć zamówioną broń wszędzie tam, gdzie widzi resztę
 * Rezerwacji.
 */
export function opisWypozyczen(
  rentals: readonly WeaponRental[],
  weaponTypes: readonly WeaponType[],
): string {
  return opisPozycji(
    rentals.map((pozycja) => ({ id: pozycja.weaponTypeId, quantity: pozycja.quantity })),
    weaponTypes,
    teksty.wypozyczenie.wlasnaBron,
  )
}

/**
 * Zamówiona amunicja jednym zdaniem — siostrzana wobec `opisWypozyczen`
 * i z tego samego powodu: Osoba rezerwująca ma widzieć zamówienie wszędzie
 * tam, gdzie widzi resztę Rezerwacji.
 */
export function opisZapotrzebowania(
  ammunition: readonly AmmunitionDemand[],
  kinds: readonly AmmunitionKind[],
): string {
  return opisPozycji(
    ammunition.map((pozycja) => ({ id: pozycja.ammunitionKindId, quantity: pozycja.quantity })),
    kinds,
    teksty.amunicja.wlasnaAmunicja,
  )
}

/**
 * Zamówione pozycje jednym zdaniem, gdy przychodzą już z nazwami — tak wygląda
 * Rezerwacja odczytana z bazy, w odróżnieniu od tej składanej w formularzu,
 * gdzie pozycje są identyfikatorami katalogu i nazwę trzeba im dopiero
 * dołożyć (`opisWypozyczen`, `opisZapotrzebowania`).
 *
 * Brak mówi o sobie wprost, tak samo jak tam: pusta wartość w opisie
 * wyglądałaby na coś, o co nikt nie zapytał.
 */
export function opisZamowionych(pozycje: readonly OrderedItem[], brak: string): string {
  if (pozycje.length === 0) return brak
  return pozycje
    .map((pozycja) => `${pozycja.name} — ${teksty.sztuki(pozycja.quantity)}`)
    .join(', ')
}
