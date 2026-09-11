# Osi się nie kasuje, a rozkład zapisuje się w całości

Ticket #19 daje Strzelnicy dwa ekrany: Osie z pojemnością i rozkład Bloków dla
każdej Osi na każdy dzień tygodnia, razem z kopiowaniem dnia na inne dni i Osi
na inną Oś. Prosi też o dwie rzeczy, które brzmią jak oczywistość, a rozstrzygają
kształt zapisu: „zmiana rozkładu jest natychmiast widoczna w Widgecie" oraz
„zmiana rozkładu nie narusza istniejących Rezerwacji, nawet gdy przestają pasować
do nowego rozkładu".

Dwie decyzje niżej biorą się wprost z tego drugiego zdania.

## Oś się wyłącza, a nie kasuje

Ticket mówi „wyłączanie Osi" i nie mówi „kasowanie". Bierzemy to dosłownie
i zamykamy drogę: kolumna `lanes.active`, żadnego `delete`.

Powód nie jest ostrożnością. Rezerwacja wskazuje Oś kluczem obcym z `on delete
cascade` — tak samo pozycje rozkładu, Blokady i Wypożyczenia. Skasowanie Osi
zabrałoby więc ze sobą **cudze Rezerwacje**, i to bez śladu: klient dowiedziałby
się o tym dopiero na parkingu. Rezerwacja znika z grafiku jedną drogą —
odwołaniem przez Strzelnicę, z powodem wysłanym na piśmie (ticket #15) — a ekran
konfiguracji nie ma prawa być drugą.

Wyłączenie robi to, po co sięga się po kasowanie, i nic ponadto:

- Oś znika z Widgetu **w całości**: nie ma jej w wyborze Osi, więc nie ma też
  jej terminów. Rozstrzyga o tym polityka RLS dla klucza anonimowego
  (`using (active)`), a nie warunek w zapytaniu Widgetu — zawężenie stojące
  w kodzie ekranu znika razem z pominięciem jednego `.eq(…)` przy następnej
  poprawce (ADR 0009). Obie funkcje zapisujące Rezerwację pytają o Oś czynną
  osobno, bo czytają bazę rolą serwisową, czyli z pominięciem polityk.
- Panel widzi ją dalej, ze znacznikiem przy nazwie: jej Rezerwacje stoją
  w kalendarzu, a wyłączenie da się cofnąć tylko z ekranu, na którym Oś jest
  widoczna.
- Zajętość liczy się z niej bez zmian. Oś wyłączona z Rezerwacją na jutro jest
  wciąż zajęta jutro — i musi taka być, bo ktoś przyjedzie.

Oś wyłączona nie jest przy tym limitem do przekroczenia przy ręcznym wpisie
(ADR 0012): trzy limity z tamtej listy są regułami, o których obsługa wie więcej
niż system, a wyłączona Oś jest Osią, której Strzelnica sama nie sprzedaje.
Obsługa, która chce na nią wpisać Rezerwację, włącza ją wcześniej jednym polem.

## Rozkład zapisuje się tygodniami jednej Osi

Jednostką zapisu jest **cały tydzień jednej Osi**, a nie pojedynczy Blok:
`set_lane_schedule` kasuje wszystkie pozycje rozkładu tej Osi i wstawia te, które
przyszły w żądaniu. Ekran zbiera zmiany u siebie i wysyła je jednym przyciskiem.

Trzy rzeczy za tym stoją.

**Kopiowanie jest zmianą wielu dni naraz.** Dzień przepisany na sześć innych to
sześć rozkładów zastąpionych jednocześnie, a rozkład zapisywany po jednym Bloku
pokazywałby Widgetowi każdy stan pośredni — w tym te, przez które przechodzi się
przez pomyłkę. Kopiowanie dnia, kopiowanie Osi, dopisanie Bloku i skasowanie
Bloku są przy zapisie w całości **jednym i tym samym zapisem**; żadne z nich nie
ma własnej drogi, którą dałoby się osobno zepsuć.

**Zastrzeżenia dotyczą tygodnia, nie Bloku.** Blok wolno przeciągnąć przez
północ (sobotni 23:00–01:00 stoi w seedzie), więc zachodzenie Bloków liczy się na
osi całego tygodnia, zamkniętej w koło: po niedzieli wraca poniedziałek tej samej
Osi. Sprawdzenie oglądające jeden dzień nie zobaczyłoby kolizji, która wystaje
poza jego granicę — a sprawdzenie oglądające jeden **Blok** nie zobaczyłoby
żadnej.

**Nazwać stan pośredni byłoby trudniej, niż go nie mieć.** Rozkład w połowie
zapisany jest ofertą, której Strzelnica nigdy nie ułożyła; zapis w całości nie ma
takiego stanu, bo kasowanie i wstawianie stoją w jednej transakcji.

Ceną jest to, że każdy zapis przepisuje wiersze, których nikt nie ruszał — mają
po nim nowe identyfikatory. Nie kosztuje to nic: identyfikatora pozycji rozkładu
nie trzyma nikt. Rezerwacja niesie własny termin i o rozkład nie pyta nikogo po
tym, jak powstała, a Widget czyta rozkład od nowa przy każdym otwarciu.

Stąd bierze się też odpowiedź na drugie zdanie ticketu — i jest to odpowiedź
„nie ma czego robić". Rezerwacja nie wskazuje Bloku, z którego wyrosła, więc Blok
zdjęty z rozkładu nie ma jak jej dotknąć: termin, na którym stoi, jest jej
własną kolumną. Rezerwacja na 10:00 zostaje na 10:00 także wtedy, gdy Strzelnica
nie sprzedaje już tej godziny nikomu — i właśnie dlatego rozkład wolno zmieniać
bez oglądania się na kalendarz.

## Konsekwencje

Reguły rozkładu — siatka Slotów, długość, zachodzenie, kopiowanie — mieszkają
w `packages/shared/src/schedule.ts` jako czyste funkcje i są jedną kopią dla
Panelu i dla Edge Function, tak samo jak przy Blokadzie.

Ekranu rozkładu nie wolno przerobić na zapis po każdej zmianie „dla wygody":
straciłby atomowość kopiowania, a zastrzeżenie o zachodzeniu Bloków musiałoby
wtedy orzekać o tygodniu, którego połowa jest jeszcze w bazie, a połowa już na
ekranie. Niezapisane zmiany są za to nazwane wprost — ekran mówi, że Widget ich
jeszcze nie widzi.

Kasowanie Osi wróci najwcześniej razem z odpowiedzią na pytanie, co zrobić z jej
Rezerwacjami — a odpowiedź „odwołać je wszystkie z jednym powodem" jest decyzją
Strzelnicy, a nie skutkiem ubocznym kliknięcia w konfiguracji.
