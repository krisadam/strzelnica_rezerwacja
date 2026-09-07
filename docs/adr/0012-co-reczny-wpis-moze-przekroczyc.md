# Co ręczny wpis może przekroczyć — i czym jest odnotowane

Ticket #17 mówi: Użytkownik panelu „może przy tym świadomie złamać reguły,
których system nie zna — bo wie o sytuacji więcej niż system", i wymienia trzy:
pojemność Osi, godziny otwarcia i Pulę instruktorów. Osobnym punktem dodaje
regułę, której złamać nie wolno: wyłączność Osi. O pozostałych odmowach, które
ta droga zapisu napotyka — Pula sztuk Typu broni, termin, który minął,
minimalne wyprzedzenie, horyzont, dzień zamknięty — nie mówi nic.

Rozstrzygamy je tutaj, bo „reguła, której system nie zna" jest zdaniem
o **konfiguracji Strzelnicy**, a nie o czymkolwiek, co stoi na drodze zapisu.

## Zbiór jest zamknięty i wyliczony wprost

Przekroczyć wolno dokładnie trzy limity i są one typem w bazie
(`limit_override`), a nie kolumną tekstową:

| Limit | Czego system nie wie |
| --- | --- |
| pojemność Osi | że na tej Osi zmieści się dziś szósty strzelec, bo grupa przychodzi z jednym karabinem |
| godziny otwarcia | że obsługa zostanie po godzinach, bo to stały klient |
| Pula instruktorów | że drugi Instruktor wraca właśnie ze zmiany |

Wspólne mają to, że każdy z nich opisuje, co Strzelnica **zwykle** robi. Zmiana
odpowiedzi na „ilu ludzi zmieści się na Osi" nie zmienia niczego w świecie —
zmienia zdanie o świecie, które ktoś kiedyś wpisał do konfiguracji.

Wartość dopisana do tego typu znaczy nowy limit oddany obsłudze do złamania,
więc dopisuje się ją migracją, świadomie — a nie przez przeoczenie
w odwzorowaniu powodów niedostępności. Pilnuje tego odwzorowanie pełne
(`TERM_READING` w `packages/shared/src/manual.ts`): powód dopisany do
dostępności zatrzymuje kontrolę typów i każe zdecydować, po której stronie
stoi.

## Czego przekroczyć nie wolno — i dlaczego każde z osobna

**Wyłączność Osi.** Ticket wyklucza ją wprost, ale nawet bez tego zdania nie
byłoby jej czym przekroczyć: dwie grupy na jednej Osi w tym samym czasie to nie
odstępstwo od reguły Strzelnicy, tylko dwie grupy na jednej Osi. Nie ma tu
żadnej wiedzy, którą obsługa mogłaby mieć ponad system — Oś jest jedna. Pilnuje
tego ograniczenie wykluczające na `bookings` i wyzwalacze Blokad, więc ręczny
wpis odbija się od schematu, a nie od osądu policzonego przed zapisem; ADR 0011
zapowiedział to zdaniem „reguła należy do tabeli, więc obowiązuje każdą drogę
zapisu — także ręczny wpis Rezerwacji w Panelu, którego jeszcze nie ma".

**Pula sztuk Typu broni.** Wygląda na siostrę Puli instruktorów i nią nie jest.
Pula instruktorów mówi, ilu Instruktorów Strzelnica **zapewnia** — jest
obietnicą grafiku pracy. Pula sztuk mówi, ile egzemplarzy Strzelnica **ma** — to
inwentarz. Obsługa, która zna czwarty Glock, nie przekracza tu limitu; ona wie
o egzemplarzu, którego nie ma w katalogu, a właściwym miejscem tej wiedzy jest
katalog. Odstępstwo zapisane przy Rezerwacji zostawiłoby katalog nieprawdziwym
i wróciłoby przy następnym zamówieniu, i przy każdym kolejnym.

**Termin, który minął.** Nie jest zdaniem o konfiguracji, tylko o zegarze. Wpis
Rezerwacji na termin już rozpoczęty jest ewidencją tego, co się stało — a
ewidencji odbytych strzelań ten moduł nie prowadzi i spec jej nie ma.

**Minimalne wyprzedzenie.** Mierzy się tym samym zegarem, więc stoi po tej samej
stronie — i jest to decyzja najbardziej z tych wszystkich sporna, bo telefon
o najbliższą godzinę jest właśnie tą rozmową, o której obsługa wie więcej niż
system. Zostawiamy odmowę, bo ticket wymienia trzy limity i wyprzedzenia między
nimi nie ma, a przekroczenie oddane bez decyzji jest przekroczeniem, którego
nikt nie chciał. Jeśli okaże się potrzebne, jest to czwarta wartość
`limit_override` i garść zdań wypisanych na końcu tego ADR-u — nie przebudowa.
Nie odsyłamy tu do ekranu konfiguracji Strzelnicy: on należy do fazy F3, więc
zdanie „obsługa ustawi sobie wyprzedzenie krótsze" byłoby dziś odesłaniem
w nieistniejące miejsce.

**Horyzont rezerwacji.** Nie do przekroczenia z tego samego powodu, a przy tym
nieosiągalny z formularza: pole daty kończy się na dniu horyzontu, bo Rezerwacja
wpisana dalej nie stanęłaby w kalendarzu Panelu (`panelWindow`), a Blok dalszy
niż horyzont nie ma czego pokazać. Blokada Osi wychodzi za horyzont i wolno jej
(ADR 0011) — ale Blokada nie ma klienta, któremu obiecuje się termin.

**Dzień, którego grafik nie ma wcale.** Dwie drogi prowadzą do tego samego:
wyjątek kalendarzowy (dzień zamknięty) i dzień tygodnia bez ani jednego wiersza
godzin otwarcia. `scheduleForDay` oddaje w obu `open: false` i zero Bloków, więc
formularz nie ma czego wskazać — pokazuje zdanie „ta Oś nie ma tego dnia ani
jednego Bloku" i nie ma tam nawet czego przekraczać.

Jest to granica **godzin otwarcia jako limitu**, i warto ją nazwać wprost:
przekroczyć wolno godziny, które Strzelnica tego dnia ma — Blok wypadający przed
otwarciem albo po zamknięciu. Dnia, w którym Strzelnica nie otwiera się wcale,
przekroczyć nie wolno, bo nie ma wtedy Bloku, przy którym stanęłoby odstępstwo.
Przekroczenie znaczyłoby wymyślenie terminu, którego rozkład nie wystawił —
a ticket mówi o przekraczaniu limitów na opublikowanym Bloku, nie o zakładaniu
Bloków ręcznie. Gdyby Strzelnica chciała przyjąć grupę w dniu zamkniętym,
właściwą odpowiedzią jest zdjęcie wyjątku kalendarzowego albo dopisanie godzin,
a nie Rezerwacja obok grafiku.

## Naruszenie jest tablicą przy Rezerwacji, nie tabelą i nie notatką

`bookings.limit_overrides` to tablica wartości `limit_override`, niepusta
wyłącznie przy Źródle `panel` — i to ostatnie jest `check`iem w schemacie:
Rezerwacja z Widgetu nie ma czym przekroczyć limitu, bo o dostępności i o zapisie
orzeka u niej ta sama czysta funkcja, więc naruszenie przy niej znaczyłoby
pomyłkę w kodzie, a nie decyzję obsługi.

Osobnej tabeli nie ma, bo naruszenie nie niesie ani jednej własnej danej poza
swoją nazwą: nie ma powodu (powodem jest ta rozmowa telefoniczna), nie ma autora
(Użytkownicy panelu Strzelnicy są nierozróżnialni — spec, „Out of Scope") i nie
ma chwili innej niż chwila zapisu Rezerwacji, przy której stoi. Tabela dołożyłaby
klucz obcy i odczyt, a odpowiadałaby na to samo pytanie.

Pola tekstowego też nie ma i jest to ta sama decyzja, co przy powodzie Odwołania,
tylko odwrotnie rozstrzygnięta: tam powód jest zdaniem do klienta i musi być
napisem, tu naruszenie jest jedną z trzech znanych rzeczy i ma się dać zliczyć.
Napis „za dużo osób" i napis „ponad pojemność" byłyby dwoma naruszeniami tego
samego limitu.

## Listę odnotowanych naruszeń liczy serwer, a żądanie niesie tylko zgodę

Żądanie ręcznego wpisu ma pole `overrides`, ale nie jest ono tym, co trafia do
bazy. Trafia tam osąd Edge Function — policzony z tych samych danych, z których
policzyła się dostępność. `overrides` z żądania służy do jednego: sprawdzenia, że
obsługa potwierdziła każdy limit, jaki ten wpis przekracza
(`unconfirmedOverrides`).

Powód jest ten sam, dla którego zgłoszenie nie ma pola na Kwotę: lista przysłana
z przeglądarki byłaby naruszeniem, które sam naruszający sobie wystawia. Ubocznie
rozwiązuje to wyścig — między pytaniem o pewność a zapisem klient bywa szybszy
i zabiera Instruktora z Puli, a wtedy wpis przekracza limit, o którym nikogo nie
zapytano; serwer to widzi i odmawia.

## Co ta decyzja kosztuje

Dostępność musiała przestać oddawać **jeden** powód niedostępności Bloku.
`Block.refusals` jest odtąd listą wszystkich powodów w kolejności pierwszeństwa,
a `available` i pierwszy jej wyraz są tego wyrazami — Widget pokazuje pierwszy,
bo klient naprawia jeden i przelicza od nowa, a Panel czyta wszystkie, bo dzieli
je na przekroczenia i odmowy. Powód pierwszy z brzegu znaczyłby ręczny wpis
przyjęty na termin, który już minął — bo minięcie stanęłoby za godzinami
otwarcia, przekroczonymi tą samą decyzją.

## Zgoda, której nikt nie kliknął

`bookings.consented_at` jest `not null` z wartością domyślną `now()` i mówi
o chwili, w której Osoba rezerwująca zaakceptowała regulamin. Przy telefonie nikt
nic nie klika, a kolumna i tak się wypełni — więc formularz ma **pole
zaznaczane** dla obsługi: „Klient zaakceptował regulamin i politykę prywatności
w rozmowie". Bez niego kolumna twierdziłaby coś, czego nikt nie stwierdził;
z nim twierdzi to, co obsługa właśnie zadeklarowała, a zastrzeżenie
`brak-zgody` odmawia wpisu, dopóki pole stoi puste.

Ticket o zgodę nie prosi i jest to świadome rozszerzenie zakresu — ale
mniejsze niż alternatywa: Rezerwacja z Panelu bez tego pola byłaby jedyną
w systemie, przy której `consented_at` nie znaczy nic. Odwrócenie tej decyzji
to jedno pole formularza i jedno zastrzeżenie mniej; kolumna zostaje, bo należy
do schematu Rezerwacji, nie do tej drogi zapisu.

## Czego przy ręcznym wpisie nie ma: listu

Ani do klienta, ani do Strzelnicy. Klient jest na linii i słyszy termin oraz
Kwotę od obsługi — list z podsumowaniem byłby drugim głosem w tej samej
rozmowie, a link do potwierdzenia adresu nie ma czego potwierdzać: adresu nie
wpisał on, tylko obsługa ze słuchu. Powiadomienie o nowej Rezerwacji poszłoby
zaś do Strzelnicy, która właśnie tę Rezerwację wpisuje.

Ticket nie prosi tu o żaden list i my go nie dokładamy. Gdyby okazało się, że
klient dzwoniący po Rezerwację chce jednak dostać ją na piśmie — razem z linkiem
do zarządzania, który już ma, bo `management_token` losuje się każdej Rezerwacji
— jest to jedno wywołanie `bookingSummaryEmail` w `wpisz-rezerwacje` i nic
poza tym.

## Gdyby ktoś tę decyzję odwrócił

Oddanie obsłudze czwartego limitu znaczy: wartość w typie `limit_override`,
wiersz w `TERM_READING`, zdanie w słowniku Panelu i test w `manual.test.ts`,
który pilnuje zamkniętości zbioru. Nic poza tym od niej nie zależy — ani
formularz, ani zapis, ani ekran szczegółów nie wymieniają limitów z nazwy.
