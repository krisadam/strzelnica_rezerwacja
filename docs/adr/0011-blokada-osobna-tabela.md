# Blokada osobną tabelą, a nie Rezerwacją bez klienta

Spec mówi: „Rezerwacja i Blokada zajmują Oś na wyłączność i muszą być
rozstrzygane przez tę samą logikę kolizji". Zdanie o **jednej** logice kolizji
czyta się jak zaproszenie do jednej tabeli: Blokada byłaby wtedy wierszem
`bookings` bez kontaktu i bez Kwoty, a wyłączność Osi pilnowałoby to samo
ograniczenie wykluczające, co dziś. Wybieramy jednak osobną tabelę
`lane_closures`, a jedność logiki kolizji stawiamy tam, gdzie spec ją stawia —
w **dostępności**, nie w schemacie.

Powód pierwszy: `bookings` to tabela o Osobie rezerwującej. Niesie imię, adres
i telefon — wszystkie trzy `not null` — liczbę Uczestników, deklarację
Pozwolenia, Kwotę i cztery stawki, z których się policzyła, oraz dwa tokeny,
którymi klient wraca do swojej Rezerwacji. Blokada nie ma z tego ani jednej
rzeczy. Wpisanie jej tam znaczy poluzowanie tych kolumn do „dopuszczalnie
puste" — a wtedy schemat przestaje odmawiać Rezerwacji bez nazwiska, czyli
temu, przed czym te `not null` stoją. Kolumna dopuszczająca puste jest
obietnicą, że puste się zdarza.

Powód drugi: stan. Cykl życia Rezerwacji — oczekująca, potwierdzona, anulowana,
odwołana, wygasła — opisuje jedną rzecz: co się dzieje między Osobą rezerwującą
a jej terminem. Blokada nie czeka na potwierdzenie adresu, nie wygasa po
Czasie na potwierdzenie, nie da się jej anulować linkiem i nie ma jej po co
odwoływać z powodem dla klienta. Wartość „blokada" w tym typie byłaby stanem,
którego nie dotyczy ani jedna reguła, która ten typ w ogóle uzasadnia — a każde
pytanie „czy ten stan trzyma termin", „czy z tego stanu wolno anulować", „czy
temu stanowi wysłać list" trzeba by od niej odtąd odsiewać.

Powód trzeci, najbardziej praktyczny: kolumny wspólne to `lane_id` i zakres
czasu, i to wszystko. Tabela, której połowa kolumn dotyczy połowy wierszy, nie
jest jedną tabelą — jest dwiema, zapisanymi w jednym miejscu i rozdzielanymi
przy każdym odczycie warunkiem na stan.

## Co dochodzi ponad Oś i zakres czasu

Model danych ze spec opisuje Blokadę jako „Oś × zakres czasu", a ticket #16 nie
mówi o powodzie ani słowem. Dokładamy go mimo to i jest to **rozszerzenie
zakresu**, nie wykonanie go: `lane_closures.reason` jest `not null` i niepusty.

Powód: Blokada bez powodu jest wierszem, który mówi obsłudze „tej Osi nie
sprzedawaj" i nic więcej. Kolejna zmiana nie wie, czy wolno ją zdjąć, więc
dzwoni do koleżanki, która ją wpisała — a wtedy Blokada w Panelu jest zadaniem
tej rozmowy, nie jej uniknięciem. To ten sam rachunek, który przy Odwołaniu
uczynił powód regułą schematu (ticket #15), z jedną różnicą: tam powód idzie do
klienta listem, tu nie wychodzi poza obsługę, bo Osobie rezerwującej wolno
wiedzieć wyłącznie, że termin jest zajęty. Sam spec zresztą już go zna —
w słowniku Blokada stoi z nawiasem „(serwis, zawody, przerwa techniczna)",
a to jest lista powodów.

Gdyby ktoś tę decyzję odwrócił, znika kolumna, jedno zastrzeżenie
(`brak-powodu`), jedno pole formularza i jeden wiersz w kolumnie kalendarza —
nic poza tym od niej nie zależy.

## Blok objęty Blokadą zostaje widoczny jako zajęty

Spec, historia 7: „chcę, żeby dni zamknięte i Blokady Osi **nie pokazywały
żadnych Bloków**, żeby nie próbować rezerwować w czasie serwisu". Dzień
zamknięty tak właśnie się zachowuje: `scheduleForDay` oddaje `open: false`
i zero Bloków. Blokada — nie. Blok, o który zahacza, zostaje na grafiku jako
niedostępny, z powodem „termin już zajęty", czyli dokładnie tym samym, co przy
cudzej Rezerwacji.

Robimy to świadomie, bo wariant dosłowny łamie dwie inne reguły naraz. Ticket
#16 wymaga, żeby „funkcja dostępności traktowała Blokady i Rezerwacje tą samą
logiką kolizji", a CONTEXT.md nazywa je „dla dostępności nierozróżnialnymi" —
Blok znikający wyłącznie od Blokady wymagałby rozgałęzienia w `scheduleForDay`
po tym, **skąd** wzięła się Zajętość, i wystawiłby Osobie rezerwującej
różnicę, o której nie ma prawa wiedzieć: Blok pokazany jako zajęty znaczy
„ktoś tam jest", a Blok zniknięty — „Strzelnica coś naprawia".

Cel historii 7 jest przy tym osiągnięty: terminu objętego Blokadą nie da się
wziąć i mówi o tym wprost, więc nie ma jak „próbować rezerwować w czasie
serwisu". Zniknięcie zostaje dniowi zamkniętemu, który jest wyjątkiem
kalendarzowym **Strzelnicy**, a nie zajętością jednej Osi.

## Co ta decyzja kosztuje

Ograniczenie wykluczające obejmuje jedną tabelę, więc wyłączność Osi **między**
Rezerwacją a Blokadą nie da się już wyrazić jednym `exclude`. Zamiast niego
stoją dwa wyzwalacze — po jednym z każdej strony — i blokada doradcza na
Strzelnicę w obu funkcjach zapisujących (`place_booking`, `place_closure`):
wyzwalacz czytający w swojej transakcji nie widzi cudzego wiersza jeszcze
niezatwierdzonego, więc dopiero blokada ustawia oba zapisy w kolejkę. Kolejność
jest tu jedyną obroną i wolno na niej stanąć, bo droga zapisu z zewnątrz jest
dokładnie jedna (ADR 0003).

Wyzwalacz ma nad sprawdzeniem w funkcji tę zaletę, że reguła należy do
**tabeli**: obowiązuje każdą drogę zapisu, także seed i ręczny wpis Rezerwacji
w Panelu, którego jeszcze nie ma. Ma i wadę: odmowa przychodzi jako wyjątek
z własnym SQLSTATE (`LC001`), a nie jako wynik, więc każda Edge Function
zapisująca musi ten kod rozpoznać i nazwać po swojemu. Jedno miejsce na
Rezerwację, jedno na Blokadę.

## Konsekwencje

Dostępność widzi **jeden** kształt: `Occupancy` z `packages/shared`. Blokada
wchodzi w niego przez `closureOccupancy`, Rezerwacja przez `occupancyFromRow`,
a kolizję orzeka o obu jedna funkcja `occupied`. To jest owa „ta sama logika
kolizji" ze spec — i jest jedna, choć tabele są dwie.

Widok `lane_occupancy` wystawia odtąd `union all` obu tabel, więc Osoba
rezerwująca nie ma czym odróżnić terminu wziętego przez kogoś od terminu
zdjętego przez obsługę — i nie ma czego: Zajętość to Oś i zakres czasu, nigdy
kto ani dlaczego. Ubocznie widok przestał być zapisywalny sam z siebie, bo
Postgres nie aktualizuje widoków z `union` — okno tylko do odczytu jest tu
odtąd własnością widoku, a nie skutkiem `revoke`.

Zdjęcia Blokady ta decyzja nie przesądza i ten ticket go nie ma: Blokada
wprowadzona pomyłkowo znika dopiero razem z ekranem, który będzie umiał ją
skasować. Osobna tabela czyni to jednak zwykłym `delete` na własnym wierszu,
a nie kolejnym przejściem stanu w cyklu życia Rezerwacji.
