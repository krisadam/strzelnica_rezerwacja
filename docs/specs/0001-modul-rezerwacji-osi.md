# Moduł rezerwacji osi strzeleckich

## Problem Statement

Strzelnica przyjmuje rezerwacje telefonicznie i mailowo, prowadząc grafik poza
systemem. Klient nie widzi, które terminy są wolne, i nie wie z góry, ile
zapłaci — musi zadzwonić i czekać na odpowiedź. Obsługa ręcznie sprawdza, czy
Oś jest wolna, czy starczy Instruktorów dla klientów bez Pozwolenia na broń
i czy nie obiecano tej samej broni dwóm grupom naraz. Pomyłka wychodzi
w sobotę rano, kiedy grupa już przyjechała.

Strzelnica ma własną stronę WWW, ale nie ma zespołu, który zbudowałby na niej
rezerwacje. Potrzebuje czegoś, co wkleja się na istniejącą stronę.

## Solution

Moduł rezerwacji osadzany na dowolnej stronie WWW jednym znacznikiem
`<script>`. Klient widzi kalendarz z wolnymi Blokami wybranej Osi, wybiera
termin, deklaruje liczbę Uczestników i Pozwolenie na broń, zamawia
Wypożyczenie broni i amunicję, widzi wyliczoną Kwotę do zapłaty i rezerwuje
bez zakładania konta. Dostępność, którą widzi, uwzględnia nie tylko zajętość
Osi, ale też Pulę instruktorów i pule sztuk broni — system nie przyjmie
Rezerwacji, której Strzelnica nie jest w stanie zrealizować.

Strzelnica dostaje Panel: podgląd i obsługę Rezerwacji, ręczne wpisywanie
zgłoszeń telefonicznych, Blokady Osi oraz pełną konfigurację — Osie, rozkład
Bloków, godziny otwarcia, katalogi broni i amunicji, cennik, Pulę
instruktorów, dozwolone domeny osadzenia.

Płatność następuje na miejscu; moduł jedynie prezentuje Kwotę.

## User Stories

### Widget — przeglądanie dostępności

1. Jako Osoba rezerwująca chcę zobaczyć kalendarz wolnych terminów bez
   zakładania konta, żeby ocenić ofertę, zanim cokolwiek podam o sobie.
2. Jako Osoba rezerwująca chcę wybrać Oś z listy Osi Strzelnicy, żeby
   zarezerwować przestrzeń odpowiednią do broni, z której chcę strzelać.
3. Jako Osoba rezerwująca chcę zobaczyć Bloki danego dnia z oznaczeniem
   wolny/zajęty, żeby od razu wiedzieć, w co mogę kliknąć.
4. Jako Osoba rezerwująca chcę przechodzić między dniami i tygodniami, żeby
   znaleźć termin pasujący do mojego kalendarza.
5. Jako Osoba rezerwująca chcę, żeby dni poza horyzontem rezerwacji były
   niedostępne, żeby nie planować terminu, którego Strzelnica nie potwierdzi.
6. Jako Osoba rezerwująca chcę, żeby Bloki zbyt bliskie (poniżej minimalnego
   wyprzedzenia) były niedostępne, żeby nie rezerwować terminu, na który
   Strzelnica nie zdąży się przygotować.
7. Jako Osoba rezerwująca chcę, żeby dni zamknięte i Blokady Osi nie
   pokazywały żadnych Bloków, żeby nie próbować rezerwować w czasie serwisu.
8. Jako Osoba rezerwująca bez Pozwolenia na broń chcę widzieć tylko terminy,
   w których Strzelnica ma wolnego Instruktora, żeby nie wybrać terminu,
   w którym i tak zostanę odrzucona.
9. Jako Osoba rezerwująca chcę zrozumieć, dlaczego termin jest niedostępny
   (brak Instruktora czy zajęta Oś), żeby wiedzieć, czy zmiana deklaracji coś
   da.

### Widget — składanie rezerwacji

10. Jako Osoba rezerwująca chcę podać liczbę Uczestników, żeby Strzelnica
    wiedziała, ilu nas przyjedzie.
11. Jako Osoba rezerwująca chcę, żeby system nie pozwolił przekroczyć
    pojemności Osi, żeby nie przyjechać w składzie, którego nie da się
    obsłużyć.
12. Jako Osoba rezerwująca chcę zadeklarować, czy posiadam Pozwolenie na broń,
    żeby Strzelnica wiedziała, czy potrzebny jest Instruktor.
13. Jako Osoba rezerwująca bez Pozwolenia chcę, żeby Instruktor został dodany
    automatycznie i żeby było to widoczne, żeby nie zaskoczyła mnie pozycja
    w rachunku.
14. Jako Osoba rezerwująca z Pozwoleniem chcę móc dobrowolnie zamówić
    Instruktora, żeby skorzystać ze szkolenia mimo posiadanego pozwolenia.
15. Jako Osoba rezerwująca chcę wybrać Typy broni do Wypożyczenia i liczbę
    sztuk każdego, żeby przyjechać bez własnej broni.
16. Jako Osoba rezerwująca chcę móc wypożyczyć kilka różnych Typów broni
    w jednej Rezerwacji, żeby każdy z Uczestników strzelał z czego innego.
17. Jako Osoba rezerwująca chcę, żeby Typy broni wyczerpane w tym terminie
    były niedostępne lub ograniczone do pozostałej liczby sztuk, żeby nie
    zamówić broni, której nie ma.
18. Jako Osoba rezerwująca chcę zamówić amunicję, podając rodzaj i liczbę
    sztuk, żeby Strzelnica przygotowała ją przed moim przyjazdem.
19. Jako Osoba rezerwująca chcę móc przyjechać z własną bronią i własną
    amunicją i nie zamawiać niczego, żeby zapłacić tylko za Oś.
20. Jako Osoba rezerwująca chcę widzieć Kwotę do zapłaty aktualizującą się
    przy każdej zmianie formularza, żeby kontrolować koszt na bieżąco.
21. Jako Osoba rezerwująca chcę widzieć rozbicie Kwoty na składniki, żeby
    rozumieć, za co płacę.
22. Jako Osoba rezerwująca chcę wiedzieć, że płacę na miejscu, żeby nie szukać
    w module formularza płatności.
23. Jako Osoba rezerwująca chcę podać imię, e-mail i telefon, żeby Strzelnica
    mogła się ze mną skontaktować.
24. Jako Osoba rezerwująca chcę zaakceptować regulamin i politykę prywatności
    Strzelnicy, żeby wiedzieć, na co się godzę.
25. Jako Osoba rezerwująca chcę zobaczyć podsumowanie Rezerwacji przed
    wysłaniem, żeby wyłapać własną pomyłkę.
26. Jako Osoba rezerwująca chcę zobaczyć czytelne potwierdzenie po wysłaniu,
    żeby wiedzieć, że termin jest mój.
27. Jako Osoba rezerwująca chcę dostać jasny komunikat, gdy w międzyczasie ktoś
    zajął mój termin, i wrócić do kalendarza, żeby wybrać inny.

### Widget — potwierdzenie adresu i zarządzanie rezerwacją

28. Jako Osoba rezerwująca chcę dostać e-mail z linkiem potwierdzającym adres,
    żeby Rezerwacja stała się trwała.
29. Jako Strzelnica chcę, żeby Rezerwacja bez potwierdzenia adresu wygasała po
    30 minutach, żeby fałszywy e-mail nie blokował soboty.
30. Jako Osoba rezerwująca chcę dostać e-mail z podsumowaniem Rezerwacji
    i Kwotą, żeby mieć to na piśmie.
31. Jako Osoba rezerwująca chcę wejść w link z e-maila i zobaczyć szczegóły
    swojej Rezerwacji, żeby przypomnieć sobie godzinę i zamówiony sprzęt.
32. Jako Osoba rezerwująca chcę anulować Rezerwację samodzielnie do 24 godzin
    przed terminem, żeby nie dzwonić w tej sprawie.
33. Jako Osoba rezerwująca chcę zobaczyć, że jest za późno na anulowanie, wraz
    z kontaktem do Strzelnicy, żeby wiedzieć, co dalej.
34. Jako Osoba rezerwująca chcę dostać e-mail, gdy Strzelnica odwoła moją
    Rezerwację, żeby nie przyjechać na zamknięty obiekt.

### Panel — obsługa rezerwacji

35. Jako Użytkownik panelu chcę zalogować się na konto przypisane do mojej
    Strzelnicy, żeby zobaczyć jej Rezerwacje.
36. Jako Użytkownik panelu chcę widzieć Rezerwacje w widoku kalendarza
    z podziałem na Osie, żeby ogarnąć dzień jednym spojrzeniem.
37. Jako Użytkownik panelu chcę widzieć Rezerwacje jako listę z filtrami po
    dacie i Osi, żeby szybko znaleźć konkretne zgłoszenie.
38. Jako Użytkownik panelu chcę otworzyć Rezerwację i zobaczyć wszystkie jej
    szczegóły — kontakt, Uczestników, Pozwolenie, Wypożyczenia,
    Zapotrzebowanie na amunicję, Instruktora i Kwotę — żeby przygotować
    stanowisko.
39. Jako Użytkownik panelu chcę zobaczyć dzienne zestawienie zamówionej broni
    i amunicji, żeby przygotować sprzęt z wyprzedzeniem.
40. Jako Użytkownik panelu chcę odwołać Rezerwację z podaniem powodu, żeby
    klient dostał informację, gdy coś się stanie.
41. Jako Użytkownik panelu chcę dostać e-mail o każdej nowej Rezerwacji, żeby
    nie musieć zaglądać do Panelu co godzinę.
42. Jako Użytkownik panelu chcę dostać e-mail, gdy klient anuluje, żeby
    zwolnić przygotowany sprzęt.
43. Jako Użytkownik panelu chcę wpisać Rezerwację telefoniczną ręcznie, żeby
    grafik w systemie był jedynym grafikiem.
44. Jako Użytkownik panelu chcę móc świadomie naruszyć limity przy ręcznym
    wpisie (pojemność Osi, godziny otwarcia, Pula instruktorów), żeby obsłużyć
    sytuację, o której wiem więcej niż system.
45. Jako Użytkownik panelu chcę widzieć przy Rezerwacji jej Źródło i to, że
    naruszono przy niej limit, żeby rozumieć, skąd wzięło się odstępstwo.
46. Jako Użytkownik panelu chcę wprowadzić Blokadę Osi na dowolny zakres czasu,
    żeby zdjąć ją ze sprzedaży na czas serwisu lub zawodów.

### Panel — konfiguracja

47. Jako Użytkownik panelu chcę dodawać i edytować Osie wraz z ich pojemnością,
    żeby odwzorować układ obiektu.
48. Jako Użytkownik panelu chcę zdefiniować rozkład Bloków dla Osi osobno na
    każdy dzień tygodnia, żeby odwzorować realny rytm dnia.
49. Jako Użytkownik panelu chcę skopiować rozkład Bloków na pozostałe dni
    i inne Osie, żeby nie wypełniać tego samego siedem razy.
50. Jako Użytkownik panelu chcę ustawić godziny otwarcia Strzelnicy i wyjątki
    na konkretne daty, żeby święta i dni zamknięte znikły z kalendarza.
51. Jako Użytkownik panelu chcę zarządzać katalogiem Typów broni wraz z pulą
    sztuk i ceną, żeby klienci widzieli aktualną ofertę.
52. Jako Użytkownik panelu chcę zarządzać katalogiem amunicji wraz z ceną za
    sztukę, żeby wycena była aktualna.
53. Jako Użytkownik panelu chcę ustawić stawkę za Blok, stawkę za uczestnictwo
    i stawkę za Instruktora, żeby moduł liczył Kwotę zgodnie z cennikiem.
54. Jako Użytkownik panelu chcę ustawić Pulę instruktorów, żeby system nie
    obiecał więcej nadzoru, niż mam ludzi.
55. Jako Użytkownik panelu chcę ustawić horyzont rezerwacji, minimalne
    wyprzedzenie i okno anulowania, żeby dopasować reguły do swojej praktyki.
56. Jako Użytkownik panelu chcę wskazać domeny, na których wolno osadzić mój
    Widget, żeby nikt nie wystawił moich terminów u siebie.
57. Jako Użytkownik panelu chcę skopiować gotowy kod osadzenia, żeby wkleić go
    na stronę bez pomocy programisty.
58. Jako Użytkownik panelu chcę podać treść regulaminu i link do polityki
    prywatności, żeby klient akceptował moje dokumenty, nie cudze.

### Wielodostępność i bezpieczeństwo

59. Jako Użytkownik panelu chcę mieć pewność, że nie widzę i nie mogę zmienić
    danych innej Strzelnicy, żeby dane klientów były rozdzielone.
60. Jako operator platformy chcę zakładać nowe Strzelnice skryptem, żeby
    uruchomić kolejnego klienta bez budowania panelu administracyjnego.
61. Jako Strzelnica chcę, żeby publiczny klucz w kodzie Widgetu nie pozwalał na
    odczyt danych osobowych ani zapis czegokolwiek poza poprawną Rezerwacją,
    żeby wyciek klucza nie był incydentem.

## Implementation Decisions

### Struktura projektu

Monorepo pnpm: `apps/widget` (React + Vite, aplikacja ładowana w ramce),
`apps/panel` (React + Vite, logowanie przez Supabase Auth), `packages/shared`
(typy wygenerowane ze schematu, logika dostępności, wyliczanie Kwoty, schematy
walidacji), `supabase/` (migracje, polityki RLS, funkcje bazodanowe, Edge
Functions, seed), `e2e/` (Playwright). Repozytorium:
`github.com/krisadam/strzelnica_rezerwacja`.

Logika dostępności i wyliczanie Kwoty istnieją **w jednej kopii**
w `packages/shared` i są używane przez Widget, Panel oraz Edge Function.
Rozjazd między tym, co pokazuje kalendarz, a tym, co przyjmuje serwer, jest
klasą błędów, którą ta decyzja eliminuje z definicji.

Hosting statycznych buildów: Cloudflare Pages — ze względu na kontrolę nad
nagłówkiem `frame-ancestors`. Backend: Supabase. E-maile: Resend, wołany
z Edge Function.

### Osadzanie

Skrypt-loader (`embed.js`) serwowany z naszej domeny, konfigurowany atrybutami
`data-*` (identyfikator Strzelnicy). Tworzy ramkę i przez `postMessage` odbiera
od Widgetu wysokość dokumentu oraz żądanie przewinięcia strony gospodarza do
góry ramki przy zmianie kroku formularza. Widget serwowany jest z nagłówkiem
`frame-ancestors` zbudowanym z listy domen dozwolonych dla danej Strzelnicy.
Zobacz ADR 0002.

### Model danych

Wszystkie tabele domenowe niosą `facility_id`. Czas przechowywany jako
`timestamptz` w UTC; strefa Strzelnicy (`Europe/Warsaw`) jest jej polem
konfiguracyjnym, nie stałą w kodzie. Waluta PLN, kwoty w groszach jako liczby
całkowite.

Główne byty: Strzelnica, Oś (z pojemnością i stawką za Blok), Rozkład Bloków
(Oś × dzień tygodnia × zakres czasu, gdzie zakres jest wielokrotnością
30 minut), Wyjątek kalendarzowy (data zamknięcia), Blokada (Oś × zakres
czasu), Rezerwacja, Wypożyczenie (pozycja Rezerwacji: Typ broni × liczba
sztuk), Zapotrzebowanie na amunicję (pozycja Rezerwacji: rodzaj × liczba
sztuk), Typ broni (z pulą sztuk i ceną), Rodzaj amunicji (z ceną za sztukę),
Użytkownik panelu (powiązanie konta Supabase Auth ze Strzelnicą).

Rezerwacja i Blokada zajmują Oś na wyłączność i muszą być rozstrzygane przez tę
samą logikę kolizji. Rezerwacja ma stan: oczekująca na potwierdzenie adresu →
potwierdzona → anulowana przez klienta / odwołana przez Strzelnicę / wygasła.

Rezerwacja przechowuje **wyliczoną Kwotę oraz stawki użyte do jej wyliczenia**
w momencie złożenia. Zmiana cennika nie może zmieniać kwot już złożonych
Rezerwacji.

### Dostępność

Termin jest dostępny dla konkretnego kształtu Rezerwacji, nie bezwzględnie.
Wyznaczanie dostępnych Bloków przyjmuje: rozkład Bloków Osi, godziny otwarcia
i wyjątki, istniejące Rezerwacje i Blokady, Pulę instruktorów, pule sztuk Typów
broni, horyzont, minimalne wyprzedzenie oraz **zamierzenia klienta**
(deklaracja Pozwolenia, chęć skorzystania z Instruktora, zamawiane Typy broni).
Ten sam Blok bywa dostępny dla jednej Osoby rezerwującej i niedostępny dla
drugiej — Widget musi to komunikować, a nie tylko odrzucać przy zapisie.

Pula instruktorów jest zajmowana wyłącznie przez Rezerwacje wymagające lub
zamawiające Instruktora i liczona po nakładających się w czasie Rezerwacjach
w obrębie całej Strzelnicy. Pula Typu broni liczona analogicznie, po sztukach.

### Kwota do zapłaty

Suma liniowa: stawka za Blok (właściwość Osi) + stawka za uczestnictwo ×
(liczba Uczestników − 1) + Σ (cena Typu broni × liczba sztuk) + Σ (cena
amunicji × liczba sztuk) + stawka za Instruktora, jeśli Instruktor jest obecny
— niezależnie od tego, czy był wymagany, czy zamówiony dobrowolnie.

Pierwszy Uczestnik nie jest objęty stawką za uczestnictwo; jest wliczony
w stawkę za Blok.

Brak cennika zależnego od pory dnia i dnia tygodnia; stawka za Blok jest
własnością Osi, co pozostawia miejsce na taką regułę bez zmiany kształtu
danych.

### Zapis i bezpieczeństwo

Odczyt danych publicznych (Osie, rozkład Bloków, katalogi, zajętość terminów,
konfiguracja Strzelnicy) — bezpośrednio z klienta przez PostgREST pod kontrolą
RLS. Zajętość udostępniana w formie pozbawionej danych osobowych.

Zapis Rezerwacji, jej potwierdzenie i anulowanie — wyłącznie przez Edge
Functions. Funkcja tworząca Rezerwację waliduje wszystko ponownie po stronie
serwera i wykonuje zapis w jednej transakcji z blokadą, tak by dwa równoczesne
zgłoszenia na ten sam Blok nie mogły oba się powieść. Weryfikuje nagłówek
`Origin` względem listy domen Strzelnicy. Zobacz ADR 0003.

Dostęp do Rezerwacji dla klienta bez konta odbywa się przez token w podpisanym
linku, nie przez identyfikator Rezerwacji.

Panel: Supabase Auth, jedna rola — każdy Użytkownik panelu Strzelnicy ma pełne
uprawnienia w jej obrębie. RLS odcina go od danych innych Strzelnic. Rola
operatora platformy istnieje poza modelem Strzelnicy i nie ma interfejsu.

### E-maile

Wysyłane synchronicznie przez Edge Function w reakcji na zdarzenie:
potwierdzenie adresu (do klienta), potwierdzenie Rezerwacji z Kwotą (do
klienta), powiadomienie o nowej Rezerwacji (do Strzelnicy), powiadomienie
o anulowaniu przez klienta (do Strzelnicy), powiadomienie o odwołaniu przez
Strzelnicę (do klienta). Szablony w repozytorium.

Brak zadań cyklicznych w tej fazie — przypomnienia przed terminem
i anonimizacja danych wymagają schedulera.

### Interfejs

Widget: kalendarz z wyborem Osi i dnia, formularz krokowy, podsumowanie,
potwierdzenie. Jeden wygląd dla wszystkich Strzelnic — bez konfiguracji kolorów
i brandingu. Język polski, teksty w jednym słowniku zamiast wplecione
w komponenty.

Panel: kalendarz Rezerwacji, lista z filtrami, formularz ręcznej Rezerwacji,
ekrany konfiguracji.

### Kolejność prac

F0 — repozytorium, monorepo, schemat, RLS, seed jednej Strzelnicy, CI.
F1 — Widget end-to-end: kalendarz, formularz, Kwota, zapis przez Edge Function,
e-maile, testy.
F2 — Panel: logowanie, kalendarz i lista Rezerwacji, odwoływanie, ręczna
Rezerwacja, Blokady.
F3 — Panel konfiguracji: Osie, Bloki, godziny, katalogi, cennik, Pula
instruktorów, dozwolone domeny, regulamin.

## Testing Decisions

Dobry test opisuje zachowanie widoczne dla Osoby rezerwującej lub Użytkownika
panelu i nie wie nic o tym, jak system jest zbudowany. Test, który przestaje
przechodzić po przeniesieniu funkcji do innego modułu, jest zły. Test, który
przestaje przechodzić, gdy klient może zarezerwować zajęty termin, jest dobry.

Projekt jest nowy — nie ma prior artu w repozytorium. Wzorce ustalone tutaj
stają się prior artem dla kolejnych faz.

### Szew podstawowy: czyste funkcje w `packages/shared` (Vitest)

Tu mieszka większość testów. Reguły domeny są wyrażone jako funkcje bez bazy
i bez sieci: wyznaczanie dostępnych Bloków oraz wyliczanie Kwoty. Ich wejściem
są zwykłe dane — rozkład Bloków, godziny otwarcia i wyjątki, istniejące
Rezerwacje i Blokady, Pula instruktorów, pule sztuk Typów broni, reguły czasowe
oraz zamierzenia klienta. „Teraz" jest parametrem, nie odczytem zegara.

Ten wybór niesie zobowiązanie architektoniczne: **każda reguła, która ma być
przetestowana, musi dać się wyrazić jako czysta funkcja**. Jeśli logika osiada
w komponencie Reacta albo w ciele Edge Function, staje się nietestowalna na tym
szwie — i to jest sygnał do jej wyciągnięcia, a nie do dopisania testu wyżej.

Zakres: kolizje Rezerwacji i Blokad; Rezerwacja stykająca się końcem
z początkiem kolejnej; Blokada częściowo pokrywająca Blok; wyjątek
kalendarzowy; Blok przecinający granicę doby; horyzont i minimalne wyprzedzenie
dokładnie na granicy; wyczerpana Pula instruktorów i wynikająca z niej różnica
dostępności między klientem z Pozwoleniem a bez; ostatnia sztuka Typu broni;
pojemność Osi; wszystkie składniki Kwoty, w tym reguła pierwszego Uczestnika;
okno anulowania.

### Szew pomocniczy: przeglądarka (Playwright, lokalny Supabase w Dockerze)

Wąska warstwa weryfikacyjna, nie drugie pokrycie tych samych reguł. Sprawdza
wyłącznie to, czego czysta funkcja z definicji nie widzi:

- **Wyścig o ten sam Blok** — dwa konteksty przeglądarki składające Rezerwację
  równocześnie; dokładnie jedna wygrywa. To własność transakcji, nie logiki.
- **Przejście całej ścieżki** — od kalendarza do potwierdzenia, raz, jako dowód
  że warstwy są połączone.
- **Izolacja Strzelnic** — Użytkownik panelu nie widzi danych obcej Strzelnicy.
  To własność RLS, nie logiki.
- **Osadzenie** — Widget działa w ramce na stronie gospodarza i dostosowuje
  wysokość.
- **Potwierdzenie adresu i wygaśnięcie** — ścieżka przez link z e-maila.

E-maile weryfikowane przez przechwytywanie wysyłki w środowisku testowym —
sprawdzamy fakt wysyłki i zawartość linku, nie dostarczenie.

### Świadomie nietworzone szwy

Brak osobnego szwu na Edge Function i brak testów jednostkowych zapytań do
bazy. Funkcja jest cienką skorupą wokół logiki z `packages/shared`; to, co robi
ponad nią, weryfikuje test wyścigu.

### Dane i czas w testach

Seed generuje rozkład Bloków w oknie 30 dni od dnia uruchomienia; testy przez
przeglądarkę celują w daty względne wobec „teraz". Czas nie jest zamrażany —
zamrożenie zegara w przeglądarce nie zamraża zegara bazy, a rozjazd między nimi
produkuje testy padające wyłącznie na CI. Testy na szwie podstawowym dostają
„teraz" jako parametr, więc nie mają tego problemu w ogóle.

## Out of Scope

- Płatności online, zadatki, zwroty, faktury. Moduł prezentuje Kwotę i nic
  poza tym.
- Konta klientów, historia rezerwacji klienta, program lojalnościowy.
- Zmiana istniejącej Rezerwacji (termin, liczba osób, sprzęt). Klient anuluje
  i rezerwuje ponownie.
- Imienny grafik Instruktorów, ich urlopy, kompetencje i przypisanie do
  Rezerwacji. Instruktor jest liczbą w Puli.
- Stan magazynowy amunicji i walidacja zgodności kalibru z wypożyczaną bronią.
  Zobacz ADR 0004.
- Ewidencja egzemplarzy broni, numery seryjne, książka wydań.
- Cennik zależny od pory dnia, dnia tygodnia i sezonu; rabaty, kody
  promocyjne, pakiety.
- Przypomnienia przed terminem i automatyczna anonimizacja danych — wymagają
  schedulera.
- Panel operatora platformy i samodzielna rejestracja Strzelnic.
- Wersje językowe inne niż polska, waluty inne niż PLN, strefy inne niż
  `Europe/Warsaw` w interfejsie.
- Personalizacja wyglądu Widgetu przez Strzelnicę.
- Podział uprawnień w Panelu na role.
- Weryfikacja prawdziwości deklaracji o Pozwoleniu na broń.
- Sprzedaż pojedynczych miejsc na Osi. Oś jest wyłączna.

## Further Notes

Dostępność zależy od treści formularza — to najbardziej nieoczywista własność
tego systemu i najczęstsze źródło nieporozumień przy implementacji interfejsu.
Kalendarz nie może być statyczną siatką „wolne/zajęte" wyliczoną raz; musi
reagować na deklarację Pozwolenia i zamawiany sprzęt.

Rezerwacja wpisana ręcznie w Panelu z naruszeniem limitu tworzy stan, w którym
dane przeczą regułom systemu. Logika dostępności musi to znieść bez wyjątku
i bez „naprawiania" — Strzelnica świadomie przyjęła taką Rezerwację.

Kwota jest zamrażana przy złożeniu Rezerwacji. Kuszące jest liczenie jej zawsze
na bieżąco z cennika; oznaczałoby to, że klient płaci inną kwotę, niż zobaczył
w e-mailu.

Decyzje utrwalone jako ADR: multi-tenant mimo jednego klienta (0001), ramka
zamiast web componentu (0002), zapis wyłącznie przez Edge Function (0003), brak
stanu magazynowego amunicji (0004), sztywne Bloki (0005).
