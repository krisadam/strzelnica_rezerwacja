# Kontekst domenowy — Rezerwacja osi strzeleckich

Słownik pojęć projektu. Zawiera wyłącznie język domeny — bez decyzji
implementacyjnych (te trafiają do `docs/adr/`).

## Strzelnica (Facility)

Pojedynczy obiekt strzelecki z własnym grafikiem, cennikiem, katalogiem broni
i amunicji oraz własną konfiguracją. System obsługuje wiele niezależnych
Strzelnic; dane jednej nigdy nie są widoczne dla drugiej.

## Oś (Lane)

Wydzielona przestrzeń strzelecka wewnątrz Strzelnicy, będąca jednostką
rezerwacji. Oś jest **wyłączna**: w danym czasie zajmuje ją dokładnie jedna
Rezerwacja. Dwie niezależne grupy nigdy nie dzielą Osi.

Oś ma **pojemność** — maksymalną liczbę Uczestników, jaką Strzelnica dopuszcza
na niej jednocześnie. Pojemność jest limitem walidacyjnym Rezerwacji, nie
zasobem sprzedawanym osobno.

## Slot

Jednostka siatki czasu grafiku, trwająca 30 minut. Grafik każdej Osi jest
zbudowany wyłącznie ze Slotów — nie istnieje rezerwacja rozpoczynająca się
poza siatką.

## Rezerwacja (Booking)

Zajęcie jednej Osi na określony czas przez jedną grupę. Składa się na nią:
Osoba rezerwująca, liczba Uczestników, deklaracja Pozwolenia na broń,
ewentualne Wypożyczenie broni i amunicji oraz informacja o Instruktorze.

## Osoba rezerwująca

Klient dokonujący Rezerwacji. Nie posiada konta w systemie — identyfikuje się
adresem e-mail, a dostęp do własnej Rezerwacji uzyskuje przez link z tokenem.
Odrębna od Uczestnika: Osoba rezerwująca zwykle jest jednym z Uczestników,
ale system śledzi tylko ją.

## Potwierdzenie adresu

Kliknięcie przez Osobę rezerwującą linku przysłanego na podany przez nią adres.
Do tej chwili Rezerwacja jest **oczekująca**: zajmuje Oś tak samo jak każda
inna, ale tylko przez czas na potwierdzenie. Adres niepotwierdzony w tym czasie
znaczy Rezerwację **wygasłą** — termin wraca do puli, bo zmyślony adres nie ma
blokować soboty. Link działa raz: potwierdza Rezerwację oczekującą i nie robi
nic więcej.

## Link do zarządzania

Adres, pod którym Osoba rezerwująca wraca do własnej Rezerwacji — po szczegóły
i po anulowanie. Bez konta jest jedynym dowodem, że Rezerwacja jest jej, więc
żyje tak długo jak ona. Odrębny od linku potwierdzającego adres: tamten działa
raz i nie robi nic więcej.

## Czas na potwierdzenie

Ile czasu Osoba rezerwująca ma na kliknięcie linku, licząc od złożenia
Rezerwacji. Jednakowy dla wszystkich Strzelnic — inaczej niż Horyzont
rezerwacji czy Okno anulowania, nie jest ustawieniem Strzelnicy.

## Uczestnik

Osoba fizycznie obecna na Osi podczas Rezerwacji. System zna wyłącznie ich
**liczbę**, nie tożsamość.

## Pozwolenie na broń

Deklaracja Osoby rezerwującej o posiadaniu pozwolenia. Jest oświadczeniem
składanym przy Rezerwacji, weryfikowanym fizycznie na miejscu — system nie
sprawdza jego prawdziwości. Brak Pozwolenia wymusza obecność Instruktora.

## Instruktor

Pracownik Strzelnicy nadzorujący strzelanie. Jego obecność jest **wymagana**,
gdy Osoba rezerwująca nie deklaruje Pozwolenia na broń, i **opcjonalna**
w pozostałych przypadkach.

## Cennik

Stawki, z których liczy się Kwota do zapłaty: stawka za Blok — własność Osi,
obejmująca pierwszego Uczestnika — oraz stawka za uczestnictwo i stawka za
Instruktora, wspólne dla całej Strzelnicy. Ceny za sztukę niosą katalogi: Typ
broni i Rodzaj amunicji. Wszystko w groszach; waluta jedna — PLN.

## Kwota do zapłaty

Wartość Rezerwacji wyliczona z Cennika Strzelnicy. Moduł ją **prezentuje**,
ale nie pobiera — rozliczenie następuje na miejscu w Strzelnicy.

Złożona Rezerwacja niesie Kwotę wraz ze stawkami i cenami, z których się
policzyła. Zmiana Cennika nie dotyczy Rezerwacji złożonych wcześniej: klient
płaci to, co zobaczył, a nie to, co Strzelnica ustaliła po jego zgłoszeniu.

## Widget

Publiczna część modułu, osadzana na dowolnej stronie WWW przez skrypt
tworzący ramkę. Widoczna dla Osoby rezerwującej.

## Panel

Wewnętrzna część modułu, dostępna dla obsługi Strzelnicy po zalogowaniu:
konfiguracja Osi, cennika, katalogów i godzin oraz obsługa Rezerwacji.

## Blok

Sztywny przedział czasu na grafiku Osi, będący jedyną jednostką Rezerwacji.
Bloki definiuje Strzelnica; każdy trwa wielokrotność Slotu (30 minut).
Osoba rezerwująca nie wybiera długości ani początku dowolnie — wybiera jeden
z opublikowanych Bloków. Przerwa techniczna między Rezerwacjami wynika
z odstępu między Blokami w rozkładzie, a nie z osobnej reguły.

## Horyzont rezerwacji

Jak daleko w przód Strzelnica przyjmuje Rezerwacje: liczba dni jej kalendarza
odmierzana od dzisiaj, gdzie horyzont zerowy znaczy „wyłącznie dzisiaj",
a trzydziestodniowy sięga trzydziestego dnia po dzisiejszym. Dni za horyzontem
nie mają Bloków do wzięcia i Osoba rezerwująca nie dochodzi do nich
kalendarzem.

## Minimalne wyprzedzenie

Ile czasu przed początkiem Bloku zamyka się jego rezerwacja. Termin, do którego
zostało mniej, pozostaje widoczny jako niedostępny — Strzelnica nie zdąży się
na niego przygotować.

## Okno anulowania

Ile czasu przed terminem Osoba rezerwująca może anulować Rezerwację sama. Po
jego upływie zostaje jej kontakt do Strzelnicy.

## Pula instruktorów

Liczba Instruktorów, których Strzelnica jest w stanie zapewnić w danym czasie.
Rezerwacja wymagająca Instruktora zajmuje jedno miejsce w Puli. Wyczerpanie
Puli czyni termin niedostępnym **wyłącznie** dla Rezerwacji wymagających
Instruktora — ta sama Oś w tym samym czasie pozostaje dostępna dla Osoby
rezerwującej deklarującej Pozwolenie na broń.

## Zajętość

Czas, w którym Oś jest już czyjaś. Składają się na nią Rezerwacje i Blokady —
dla dostępności nierozróżnialne, bo obie zajmują Oś na wyłączność. Zajętość
jest tym, co Osoba rezerwująca widzi o cudzych Rezerwacjach: Oś i przedział
czasu, nigdy kto ani ilu.

## Wypożyczenie

Pozycja Rezerwacji wskazująca Typ broni i liczbę sztuk. Jedna Rezerwacja może
zawierać wiele Wypożyczeń różnych Typów.

## Typ broni

Pozycja katalogu Strzelnicy (np. „Glock 17") wraz z **pulą** — liczbą sztuk
dostępnych do wypożyczenia. Suma sztuk danego Typu w nakładających się
Rezerwacjach nie może przekroczyć Puli.

## Rodzaj amunicji

Pozycja katalogu Strzelnicy (np. „9 × 19 mm Parabellum"). W odróżnieniu od
Typu broni **nie ma puli**: amunicja nie wraca do Strzelnicy, więc nie ma
stałej liczby sztuk, którą dałoby się rozdzielać między Rezerwacje.

## Zapotrzebowanie na amunicję

Deklarowany przez Osobę rezerwującą rodzaj i liczba sztuk amunicji. Jest
**zapowiedzią dla Strzelnicy**, nie rezerwacją towaru: system nie prowadzi
stanu magazynowego i nigdy nie odmawia z powodu braku amunicji. Służy do
wyliczenia Kwoty do zapłaty i do przygotowania się Strzelnicy.

## Adres powiadomień

Skrzynka, pod którą Strzelnica dowiaduje się o Rezerwacjach swoich Osi bez
zaglądania do Panelu. Jej ustawienie — jak Horyzont rezerwacji czy Okno
anulowania. Pusty znaczy Strzelnicę, która powiadomień nie chce, a nie
konfigurację niedokończoną.

## Kontakt Strzelnicy

Adres i telefon, które Strzelnica podaje klientom. Odrębne od Adresu
powiadomień: tamten jest skrzynką obsługi i nie wychodzi na zewnątrz, a to jest
właśnie to, co ma wyjść — po upływie Okna anulowania zostaje Osobie
rezerwującej telefon i nic więcej. Jego ustawienie — jak Horyzont rezerwacji
czy Okno anulowania.

## Użytkownik panelu

Osoba z dostępem do Panelu jednej Strzelnicy. Wszyscy Użytkownicy panelu danej
Strzelnicy mają identyczne uprawnienia.

## Opłata za uczestnictwo

Składnik Kwoty do zapłaty naliczany za osoby **poza pierwszą** na Osi.
Pierwszy Uczestnik jest objęty stawką za Blok; każdy kolejny powiększa Kwotę
o stawkę za uczestnictwo.

## Blokada

Wyłączenie Osi z rezerwacji na wskazany czas, wprowadzane przez Panel
(serwis, zawody, przerwa techniczna). Dla logiki dostępności zachowuje się
identycznie jak Rezerwacja — zajmuje Oś na wyłączność — ale nie ma Osoby
rezerwującej ani Kwoty do zapłaty.

## Źródło rezerwacji

Informacja o tym, czy Rezerwacja powstała w Widgecie, czy została wprowadzona
ręcznie w Panelu. Rezerwacja z Panelu może naruszać limity Strzelnicy
(pojemność Osi, godziny otwarcia, Pula instruktorów) — takie naruszenie jest
przy niej trwale odnotowane.
