# Wspólny plik tokenów wizualnych

Ticket: [#45](https://github.com/krisadam/strzelnica_rezerwacja/issues/45).
Przesłanka: [ADR 0014](../adr/0014-ciemna-baza-takze-w-widgecie.md).

## Problem Statement

Paleta modułu stoi dziś w dwóch miejscach naraz: bloki `:root` w arkuszu Panelu
i w arkuszu Widgetu. Te same nazwy zmiennych, te same wartości, dwie ręcznie
utrzymywane kopie.

Skutek jest podwójny. Każda zmiana koloru jest dwiema zmianami, a jeśli któraś
z nich zostanie pominięta, nic o tym nie powie: CSS nie ma jak zauważyć, że
granat w Panelu przestał być tym samym granatem, co w Widgecie. Rozjazd już się
zresztą zaczął — Panel ma dwie zmienne, których Widget nie ma (tło drugiego
poziomu oraz kolor rzeczy wyjętych ze sprzedaży: Blokady, Osi wyłączonej,
pozycji katalogu wycofanej).

Dziś jest to drobna niedogodność, bo paleta się nie zmienia. Przestaje nią być
w chwili, gdy zaczyna się przemalowywanie modułu na ciemną bazę (ADR 0014):
wtedy każdy odcień trzeba wpisać dwa razy, w dwóch plikach, przy każdej korekcie
— i przy pierwszym przeoczeniu obie aplikacje przestają być jednym produktem.

## Solution

Tokeny wizualne — paleta oraz to, co dziś stoi obok niej w tym samym bloku
`:root` — przenoszą się do **jednego pliku w `packages/shared`**, który oba
arkusze importują. Wartości nie zmieniają się o jeden odcień.

Ten ticket niczego nie przemalowuje. Jego jedynym efektem widocznym dla
kogokolwiek jest brak efektu: ekrany przed zmianą i po niej mają być
identyczne. Zmiana wyglądu przychodzi osobnymi ticketami i staje się przez to
tania — jeden plik zamiast dwóch, jedna zmiana zamiast dwóch.

Jest to ta sama zasada, którą projekt stosuje już do reguł domeny: siatka
Slotów, dostępność i Kwota mieszkają w `packages/shared` w jednej kopii dla
Panelu i dla Edge Function, bo druga kopia reguły to reguła, która kiedyś
odpowie inaczej. Tu chodzi o dokładnie to samo, tylko o kolory.

## User Stories

1. Jako Deweloper chcę mieć paletę w jednym pliku, żeby zmiana odcienia była
   jedną zmianą, a nie dwiema.
2. Jako Deweloper chcę, żeby niemożliwe było zmienienie koloru w Panelu bez
   zmienienia go w Widgecie, bo to jeden produkt i ma wyglądać jak jeden.
3. Jako Deweloper chcę, żeby nazwy tokenów zostały te same, co dziś, żeby diff
   tego ticketu dało się przeczytać jako przeniesienie, a nie jako przepisanie.
4. Jako Deweloper chcę, żeby uzasadnienia stojące dziś przy tokenach w
   komentarzach przewędrowały razem z nimi, bo w tym repozytorium komentarz przy
   bloku CSS jest dokumentacją decyzji, a nie ozdobą.
5. Jako Deweloper chcę, żeby nowy plik dało się zaimportować nazwą pakietu, a
   nie ścieżką w rodzaju `../../../`, bo taka ścieżka pęka przy pierwszym
   przeniesieniu pliku.
6. Jako Deweloper chcę, żeby po tej zmianie Widget znał wszystkie tokeny, także
   te, których dziś nie używa, żeby przemalowywanie nie zaczynało się od
   dokładania brakujących zmiennych.
7. Jako Recenzent chcę, żeby ten ticket nie zawierał ani jednej zmiany
   wizualnej, żebym mógł go przejrzeć w minutę i nie musiał oceniać gustu.
8. Jako Recenzent chcę wiedzieć z opisu, że suma zmiennych rośnie o dwie pozycje
   po stronie Widgetu, żeby nie brać tego za przypadkowy dodatek.
9. Jako Osoba rezerwująca chcę, żeby po tej zmianie formularz rezerwacji
   wyglądał dokładnie tak, jak wyglądał wczoraj, bo nie zamawiałam żadnej
   zmiany.
10. Jako Użytkownik panelu chcę, żeby kalendarz Osi, znaczniki Blokad i lista
    Rezerwacji miały te same kolory, co przed zmianą, bo rozpoznaję po nich stan
    dnia i nauczyłem się ich.
11. Jako Użytkownik panelu chcę, żeby kolor rzeczy wyjętych ze sprzedaży —
    Blokady, Osi wyłączonej, pozycji katalogu wycofanej — nadal był tym samym
    jednym kolorem, bo mówi o tej samej rzeczy w trzech miejscach.
12. Jako Strzelnica chcę, żeby Widget osadzony na mojej stronie działał i
    wyglądał po wdrożeniu tak samo, bo nie dostałam żadnego powiadomienia o
    zmianie.
13. Jako Agent biorący następny ticket chcę zastać jedno miejsce, w którym
    zmienia się kolor, żeby nie musieć zgadywać, czy druga kopia gdzieś jeszcze
    jest.
14. Jako Deweloper chcę mieć test, który zauważy, że wspólny arkusz nie dotarł
    do którejś z aplikacji, bo ta awaria jest cicha: strona renderuje się dalej,
    tylko bez kolorów.
15. Jako Deweloper chcę, żeby ten test sprawdzał obie aplikacje osobno, bo
    rozwiązanie importu może zadziałać w jednej i nie zadziałać w drugiej.
16. Jako Deweloper chcę, żeby ten ticket nie dotknął skryptu osadzającego ani
    protokołu wysokości ramki, bo to niezależna sprawa i psucie jej przy okazji
    byłoby kosztem bez powodu.

## Implementation Decisions

### Zawartość wspólnego pliku

Nowy arkusz w `packages/shared` niesie **sumę** obecnych bloków `:root` z obu
aplikacji — czyli zmienne wspólne plus te dwie, które ma dziś tylko Panel.
Wartości przenoszą się **dosłownie**, bez korekty choćby o jeden odcień.

Razem ze zmiennymi przenoszą się trzy deklaracje, które stoją dziś w tym samym
bloku i opisują tę samą rzecz — krój pisma, kolor tekstu i tło. Rozdzielanie ich
od palety zostawiłoby w arkuszach szczątek bloku `:root` i pytanie, czemu akurat
te trzy zostały.

Komentarze uzasadniające wędrują razem z tokenami. Konwencja tego repozytorium
jest taka, że każdy blok CSS mówi, dlaczego wygląda, jak wygląda; token bez
uzasadnienia byłby regresem względem stanu obecnego.

### Nazwy tokenów zostają nietknięte

Żadna zmienna nie zmienia nazwy. Przemianowanie przy okazji przeniesienia
zamieniłoby diff czytelny jako „to samo, w innym miejscu" w diff, który trzeba
czytać linia po linii. Jeśli któraś nazwa jest zła, jest to osobny ticket.

### Import nazwą pakietu wymaga podścieżki w eksportach

Pakiet współdzielony eksportuje dziś wyłącznie swój punkt wejścia. Import
arkusza nazwą pakietu nie rozwiąże się, dopóki mapa eksportów nie dostanie
wpisu dla tego pliku. Wariant ze ścieżką względną w górę drzewa katalogów
odrzucony: działa, ale pęka przy pierwszym przeniesieniu i nie mówi niczego
o tym, że plik jest częścią interfejsu pakietu.

### Oba arkusze tracą własne bloki `:root`

Każda z aplikacji importuje wspólny arkusz jako pierwszą rzecz w swoim pliku
stylów i zostawia u siebie wyłącznie reguły dotyczące własnych ekranów. Import
stoi w arkuszu, a nie w module wejściowym aplikacji, żeby arkusz pozostał
samowystarczalny — czytający go widzi, skąd biorą się zmienne, których używa.

### Widget dostaje dwa tokeny, których nie używa

Zmienne obecne dziś tylko w Panelu będą po tej zmianie zdefiniowane także
w Widgecie. Jest to świadoma cena jednego źródła i nie ma żadnego skutku
wizualnego: zmienna, do której nikt się nie odwołuje, niczego nie maluje.
Alternatywa — dwa pliki tokenów, wspólny i panelowy — przywraca problem, który
ten ticket rozwiązuje, tylko o poziom wyżej.

### Czego ten ticket nie dotyka

Skrypt osadzający, osobny build skryptu osadzającego, protokół wysokości ramki,
promienie, skala nagłówków, kolor przycisku głównego. Build skryptu
osadzającego ma własne wejście i nie przetwarza arkuszy stylów, więc nie ma jak
go tą zmianą naruszyć — i nie zaglądamy do niego.

## Testing Decisions

Dobry test opisuje zachowanie widoczne z zewnątrz i nie wie nic o tym, jak
system jest zbudowany. Tutaj oznacza to test, który przestaje przechodzić, gdy
aplikacja renderuje się bez palety — a nie test, który przestaje przechodzić,
gdy plik z tokenami zmieni nazwę albo miejsce.

Ryzyko tej zmiany nie leży w logice, więc **szew podstawowy projektu — czyste
funkcje na Vitest — jest tu nieprzydatny**. Nie przybywa ani jedna reguła
domeny. Ryzyko leży w cichej awarii: jeśli import wspólnego arkusza nie
rozwiąże się w którejś z aplikacji, zmienne nie powstaną, odwołania do nich
staną się nieprawidłowe i strona będzie renderować się dalej — bez błędu,
bez ostrzeżenia, tylko bez kolorów.

### Szew: istniejące testy przeglądarkowe (Playwright)

Jeden nowy plik testu, dwie asercje — po jednej na aplikację. Każda sprawdza,
że token czyta się z korzenia dokumentu i ma dokładnie tę wartość, którą miał
przed wyciągnięciem. To weryfikuje jedyną rzecz, której nie widać inaczej: że
wspólny arkusz faktycznie dociera do obu aplikacji.

Obie aplikacje muszą być sprawdzone osobno. Mają osobne konfiguracje budowania
i rozwiązanie importu może zadziałać w jednej, a nie zadziałać w drugiej —
sprawdzenie jednej z nich nie mówi nic o drugiej.

Widget wewnątrz ramki na stronie gospodarza nie potrzebuje osobnej asercji:
ramka ładuje ten sam build Widgetu, który sprawdza asercja pierwsza.

Prior art: istniejący test osadzenia liczy już wielkości w przeglądarce przez
wykonanie kodu na stronie, więc odczyt wartości wyliczonej ze stylów nie
wprowadza nowego wzorca.

### Świadomie nietworzone szwy

**Test w pakiecie współdzielonym czytający plik z tokenami.** Sprawdzałby
zawartość pliku, a nie to, czy którakolwiek aplikacja go ładuje — czyli
mijałby się z całym ryzykiem tej zmiany, dając przy tym poczucie pokrycia.

**Testy wizualne i migawki ekranu.** Kryterium „zero zmiany wizualnej" kusi,
żeby je dorzucić, ale wprowadzają klasę fałszywych alarmów, której ten projekt
dziś nie ma, i utrudniłyby kolejne tickety, których celem jest właśnie zmiana
wyglądu.

### Pytanie do rozstrzygnięcia przy implementacji

Nie wiadomo, czy narzędzie budujące przerywa build błędem przy nierozwiązywalnym
imporcie w CSS, czy tylko ostrzega. Jeśli przerywa, samo zbudowanie obu
aplikacji jest tańszym strażnikiem, a asercja w przeglądarce zostaje pasem
bezpieczeństwa. Odpowiedź należy sprawdzić w trakcie prac i zanotować
w opisie zmiany — nie zgadywać.

### Co musi dalej przechodzić

Cały istniejący zestaw testów przeglądarkowych bez zmian. Ten ticket nie
dotyka ani nazw klas, ani treści, ani struktury dokumentu, więc każdy test,
który przestanie przechodzić, jest sygnałem błędu, a nie powodem do poprawienia
testu.

## Out of Scope

- **Przemalowanie modułu na ciemną bazę** — decyzja zapisana w ADR 0014,
  wykonanie w osobnych ticketach. Ten ticket jest wyłącznie warunkiem, który je
  potania.
- **Promienie, skala nagłówków, kształty kontrolek.**
- **Zmiana koloru przycisku głównego**, który dziś reużywa kolor wolnego
  terminu.
- **Promień i margines ramki w skrypcie osadzającym.**
- **Motywowanie wyglądu per Strzelnica** — poza zakresem całego modułu
  i pozostaje poza nim.
- **Strona demo gospodarza** — zostaje jasna i obca celowo.
- **Jakiekolwiek zmiany treści** w słownikach tekstów obu aplikacji.

## Further Notes

Powodem, dla którego ten ticket ma sens teraz, a nie kiedykolwiek, jest ADR
0014: moduł ma zostać przemalowany, a przemalowywanie dwóch kopii palety to
dwie szanse na rozjazd przy każdej korekcie odcienia.

Prototyp warstwy wizualnej rozstrzygnął już, w którą stronę pójdzie samo
przemalowanie — hierarchię niosą obwódki na jednym płaskim tle, nie warstwy
jasności. Nie ma to wpływu na ten ticket: wartości przenoszą się tu bez zmiany,
a rozstrzygnięcie dotyczy ticketów następnych.

Rozjazd, o którym mowa w opisie problemu, nie jest hipotezą — dwie zmienne
Panelu, których Widget nie ma, są jego pierwszym objawem.
