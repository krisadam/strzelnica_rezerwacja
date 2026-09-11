# Moduł rezerwacji osi strzeleckich

Moduł rezerwacji osadzany na stronie WWW Strzelnicy: publiczny **Widget** dla
Osoby rezerwującej i wewnętrzny **Panel** dla obsługi. Kontekst domenowy —
[`CONTEXT.md`](CONTEXT.md), decyzje — [`docs/adr/`](docs/adr), specyfikacja —
[`docs/specs/0001-modul-rezerwacji-osi.md`](docs/specs/0001-modul-rezerwacji-osi.md).

## Wymagania

| Narzędzie | Wersja | Po co |
| --- | --- | --- |
| Node.js | ≥ 20 (CI używa 22) | uruchomienie aplikacji i testów |
| pnpm | 10.15 | monorepo (`corepack enable pnpm`) |
| Docker | dowolna aktualna | lokalny Supabase |
| Supabase CLI | ≥ 2.0 | migracje, seed, generowanie typów |

## Środowisko od zera

```bash
git clone https://github.com/krisadam/strzelnica_rezerwacja.git
cd strzelnica_rezerwacja
corepack enable pnpm
pnpm install
pnpm db:start        # lokalny Supabase w Dockerze
pnpm db:env          # zapisuje adres oraz klucze lokalnego Supabase do .env
pnpm dev             # Widget na :5173, Panel na :5174
```

Widget potrzebuje wskazania Strzelnicy — bierze je z adresu ramki, który
składa skrypt osadzający. Otwarty wprost działa tak samo:
<http://localhost:5173/?strzelnica=strzelnica-demo>.

Playwright potrzebuje jednorazowo przeglądarki:

```bash
pnpm --filter @strzelnica/e2e exec playwright install chromium
```

### Windows: Rancher Desktop

Rancher Desktop 1.24.0 ma błąd, przez który `docker` przestaje odpowiadać 1–3
minuty po każdym starcie, z komunikatem `timed out dialing Hyper-V socket`.
Przyczyną jest healthcheck usługi docker wołający `curl --url http://./_ping`,
odrzucany przez curl 8.21.0 — szczegóły w
[`tools/windows/fix-docker-healthcheck.start`](tools/windows/fix-docker-healthcheck.start).
`pnpm db:start` bez tego nie ma szans dojść do końca.

Skrypt trzeba skopiować tam, skąd Rancher wykonuje go przy każdym starcie:

```powershell
Copy-Item tools\windows\fix-docker-healthcheck.start "$env:LOCALAPPDATA\rancher-desktop\provisioning\" -Force
```

Potem pełny restart Rancher Desktop — wyjście przez ikonę w zasobniku, nie samo
zamknięcie okna. Sprawdzenie, czy poprawka weszła:

```bash
wsl -d rancher-desktop grep _ping /etc/init.d/docker
```

Ma pokazać `http://localhost/_ping`. Wersja z `http://./_ping` znaczy, że skrypt
nie zadziałał — najczęściej dlatego, że `rdctl reset --factory` usunął katalog
`provisioning`.

## Osadzenie na obcej stronie

Strzelnica wkleja u siebie jeden znacznik; ramkę z Widgetem tworzy skrypt
`embed.js` serwowany z naszej domeny (ADR 0002):

```html
<script src="https://widget.example.pl/embed.js" data-strzelnica="strzelnica-demo"></script>
```

Ramka dopasowuje wysokość do treści i przewija stronę gospodarza do swojej
góry przy zmianie widoku — Widget podaje jedno i drugie przez `postMessage`.

Osadzać wolno wyłącznie na domenach z listy `facilities.allowed_origins`. Z niej
budowany jest nagłówek `Content-Security-Policy: frame-ancestors …` podawany
razem z dokumentem Widgetu; osadzenie gdzie indziej blokuje przeglądarka. Pusta
lista znaczy „nigdzie". Nagłówek liczy `frameAncestors` z `packages/shared`,
a podaje go wtyczka [`apps/widget/naglowek-osadzenia.ts`](apps/widget/naglowek-osadzenia.ts)
— w pracy lokalnej, w `vite preview` i w testach przeglądarkowych. Na produkcji
ten sam nagłówek musi wystawić hosting: statyczna lista nagłówków Cloudflare
Pages nie różnicuje po parametrze adresu, więc potrzebna jest funkcja brzegowa
czytająca `?strzelnica=` i licząca wartość tą samą `frameAncestors`. Wdrożenia
w repozytorium jeszcze nie ma.

Strona demonstracyjna gospodarza mieszka w `apps/widget/demo`. Sięga po
`embed.js` z `dist`, więc serwer deweloperski jej nie obsłuży — potrzebny jest
build i `preview`, w dwóch terminalach:

```bash
pnpm build && pnpm --filter @strzelnica/widget preview --port 5173 --strictPort
```

```bash
pnpm demo
```

Strona staje na <http://localhost:5175> — porcie, który seed wpisuje
demonstracyjnej Strzelnicy jako dozwolony. Ta sama strona podana spod innego
portu pokazuje, jak wygląda blokada osadzenia.

## Struktura

| Katalog | Zawartość |
| --- | --- |
| `apps/widget` | Widget — React + Vite, aplikacja ładowana w ramce, i skrypt osadzający |
| `apps/panel` | Panel — React + Vite, logowanie przez Supabase Auth |
| `packages/shared` | typy ze schematu bazy, logika dostępności, wyliczanie Kwoty, walidacja |
| `supabase/` | migracje, polityki RLS, seed, Edge Functions |
| `e2e/` | testy przeglądarkowe (Playwright) |

Logika dostępności i wyliczanie Kwoty istnieją w **jednej kopii**
w `packages/shared` i są używane przez Widget, Panel oraz Edge Functions.
Edge Functions importują je wprost ze źródeł — dlatego wewnętrzne importy
`packages/shared` mają rozszerzenie `.ts`, a nie `.js`: Deno rozwiązuje
ścieżki lokalne dosłownie i sam nie podmieni jednego na drugie. Supabase CLI
podmontowuje do środowiska brzegowego dokładnie te pliki, które funkcja
importuje, a graf importów liczy raz — przy `supabase start`. **Nowy** plik
wciągnięty do tego grafu — w `packages/shared` przez `index.ts` albo
w `supabase/functions/_shared` przez którąkolwiek funkcję — wymaga więc pełnego
restartu lokalnego Supabase; sam `pnpm db:reset` go nie podmontuje, a każda
funkcja odpowie wtedy `worker boot error … Module not found`.

## Polecenia

| Polecenie | Działanie |
| --- | --- |
| `pnpm dev` | Widget i Panel równolegle |
| `pnpm dev:widget` / `pnpm dev:panel` | jedna aplikacja |
| `pnpm build` | produkcyjne buildy obu aplikacji wraz ze skryptem `embed.js` |
| `pnpm demo` | strona demonstracyjna gospodarza z osadzonym Widgetem (:5175) |
| `pnpm lint` | ESLint na całym repozytorium |
| `pnpm typecheck` | `tsc` w każdym pakiecie |
| `pnpm test` | testy jednostkowe `packages/shared` (Vitest) |
| `pnpm test:e2e` | testy przeglądarkowe (Playwright, sam startuje `vite preview`) |
| `pnpm db:start` / `pnpm db:stop` | lokalny Supabase |
| `pnpm db:env` | zapisanie adresu i kluczy lokalnego Supabase do `.env` |
| `pnpm db:reset` | odtworzenie bazy z migracji i wykonanie seeda |
| `pnpm db:types` | regeneracja `packages/shared/src/database.types.ts` ze schematu |

## Testy

Większość testów mieszka w `packages/shared` jako testy czystych funkcji: reguły
domeny przyjmują zwykłe dane, a „teraz" jest parametrem, nie odczytem zegara.
Reguła, której nie da się wyrazić jako czysta funkcja, jest sygnałem do jej
wyciągnięcia — nie do dopisania testu wyżej.

`e2e/` to wąska warstwa weryfikacyjna dla tego, czego czysta funkcja nie widzi:
wyścig o ten sam Blok, przejście całej ścieżki, izolacja Strzelnic, osadzenie
w ramce, potwierdzenie adresu, anulowanie przez link, logowanie do Panelu,
odwołanie Rezerwacji przez Strzelnicę, Blokada Osi zdejmująca terminy
z Widgetu, ręczna Rezerwacja telefoniczna z przekroczonym limitem, przejście
z pozycji Zestawienia dnia do Rezerwacji, Oś dodana w Panelu wchodząca do oferty
razem ze swoim rozkładem, wyjątek kalendarzowy zamykający dzień klientowi
i tydzień godzin otwarcia układany w Panelu.
Wymagają wstającego Supabase (`pnpm db:start`)
i zbudowanych aplikacji (`pnpm build`). Nie dubluje reguł pokrytych na szwie
podstawowym.

Testy potwierdzenia i anulowania sięgają do bazy rolą serwisową — po
przechwyconą pocztę i po przesunięcie terminów: czekania trzydziestu minut do
wygaśnięcia ani doby do domknięcia Okna anulowania nie da się w teście odbyć,
a zegara nie zamrażamy (zamrożenie w przeglądarce nie zamraża zegara bazy). Klucz bierze się z `SUPABASE_SERVICE_ROLE_KEY`
w `.env`, zapisywanego przez `pnpm db:env`. Osi są dwie, a testów rezerwujących
więcej, więc każdy z nich celuje w inny fragment horyzontu: wyścigi biorą
terminy najbliższe, bo obie ich strony muszą trafić na ten sam Blok.

## Rezerwacje

Rezerwację z Widgetu zapisuje wyłącznie Edge Function `zloz-rezerwacje`,
[przyjętą przez telefon](#ręczna-rezerwacja-telefoniczna) — `wpisz-rezerwacje`,
potwierdza `potwierdz-rezerwacje`, anuluje `anuluj-rezerwacje`, a odwołuje
`odwolaj-rezerwacje` (ADR 0003). Tą samą drogą
idzie jej **odczyt** spod linku klienta (`pokaz-rezerwacje`), choć niczego nie
zmienia: `bookings` niesie dane osobowe, a Osoba rezerwująca nie ma konta,
którym dałoby się jej pokazać własny wiersz i tylko własny.
Klucz anonimowy nie ma do tabeli `bookings` żadnej polityki RLS: nie zapisze
do niej niczego i nie odczyta z niej niczego. Kalendarz czyta zajętość
z widoku `lane_occupancy` — Oś i zakres czasu, bez danych osobowych, i tak samo
dla Rezerwacji jak dla [Blokad](#blokady-osi).

Wyłączności Osi pilnuje ograniczenie `exclude` w schemacie, a nie sprawdzenie
w kodzie: dwa równoczesne zgłoszenia na ten sam Blok przechodzą walidację oba,
a rozstrzyga dopiero zapis. Sprawdzenie przed zapisem jest po to, żeby
powiedzieć klientowi, co jest nie tak.

Sam zapis wykonuje funkcja bazodanowa `place_booking`: Rezerwacja wraz
z Wypożyczeniami i Zapotrzebowaniem na amunicję powstaje w jednej transakcji,
a Pula sztuk Typu broni sprawdza się pod blokadą doradczą na Strzelnicę.
Wypożyczenia widoczne publicznie są w widoku `weapon_occupancy` — Typ, liczba
sztuk i zakres czasu, bez danych osobowych.

Kwotę do zapłaty liczy `packages/shared` i przelicza ją Edge Function po swojej
stronie — zgłoszenie nie ma pola na Kwotę, bo liczba przysłana przez klienta
byłaby ceną, którą sam sobie ustala. Rezerwacja zapisuje Kwotę razem ze
stawkami i cenami pozycji, z których się policzyła, więc zmiana cennika nie
dotyczy Rezerwacji złożonych wcześniej. Kwota wraca w odpowiedzi funkcji i to
ją — a nie rachunek policzony w przeglądarce po raz drugi — Widget pokazuje na
potwierdzeniu.

Zapotrzebowania na amunicję takiego widoku **nie mają i mieć nie będą**. Rodzaj
amunicji nie ma puli (ADR 0004), więc nie ma czego odliczać od cudzych
zamówień: amunicja nigdy nie odbiera nikomu terminu, a widok wystawiałby cudze
zamówienia bez pożytku dla dostępności.

Funkcja weryfikuje nagłówek `Origin` względem `facilities.allowed_origins`
powiększonych o domenę samego Widgetu. Ta ostatnia jest jednakowa dla
wszystkich Strzelnic, więc jest konfiguracją platformy: lokalnie stoi
w `supabase/config.toml` jako `[edge_runtime.secrets] WIDGET_ORIGIN`, a na
produkcji ustawia się ją przez `supabase secrets set WIDGET_ORIGIN=…`.

## Potwierdzenie adresu i wygasanie

Rezerwacja powstaje **oczekująca** i trzyma termin na wyłączność tak samo jak
potwierdzona — ale tylko przez czas na potwierdzenie (`HOLD_MINUTES`
w `packages/shared`, 30 minut). Zaraz po zapisie Edge Function wysyła
e-mail z linkiem; wejście w link przenosi Rezerwację w stan **potwierdzona**.
Link prowadzi do Widgetu podanego wprost — `?strzelnica=…&potwierdzenie=token`
— bo e-mail otwiera się poza witryną Strzelnicy.

Adres niepotwierdzony w tym czasie znaczy Rezerwację wygasłą i termin z powrotem
w puli. Nie ma tu żadnego zadania cyklicznego (ADR 0006): dla odczytu wygaśnięcie
liczy się zegarem w chwili patrzenia — widoki `lane_occupancy` i `weapon_occupancy`
filtrują przez `booking_holds_term` — a wiersz zmienia stan przy pierwszym
zapisie, który o ten termin zahacza (`expire_stale_bookings` pod blokadą
doradczą na Strzelnicę). Zestawienie liczone wprost z `bookings` musi używać
`booking_holds_term`, a nie własnej listy stanów.

Jednorazowość linku bierze się ze stanu, nie z kasowania tokenu: drugie wejście
trafia na Rezerwację już potwierdzoną, niczego nie zmienia i mówi o tym wprost —
a skoro niczego nie zmienia, nie wysyła też drugiego kompletu powiadomień.
Rezerwacja, której e-maila nie udało się wysłać, jest zdejmowana od razu —
inaczej termin stałby zajęty pół godziny za list, którego nie ma.

## Powiadomienia o Rezerwacji

Po potwierdzeniu adresu — i **wyłącznie** wtedy — wychodzą dwa listy:
podsumowanie do Osoby rezerwującej i powiadomienie do Strzelnicy. Wysyła je
`potwierdz-rezerwacje`, a nie zapis: Rezerwacja oczekująca bywa zmyślona, więc
podsumowanie wysłane od razu obiecywałoby termin wracający za pół godziny do
puli, a Strzelnica przygotowywałaby sprzęt dla gościa, którego nie ma.

Oba listy niosą ten sam opis Rezerwacji — Oś, termin, Uczestników, zamówiony
sprzęt, Instruktora i Kwotę — bo obsługa przygotowuje stanowisko z tego samego
opisu, który klient dostaje na piśmie. Różnią się tym, co która strona ma prawo
wiedzieć: Strzelnica dostaje dane kontaktowe, klient — link do zarządzania
Rezerwacją.

Link do zarządzania ma własny token (`bookings.management_token`, losowany
wartością domyślną kolumny) i własny parametr adresu `?rezerwacja=`. Nie jest
tokenem potwierdzającym: tamten działa raz, ten żyje tak długo jak Rezerwacja,
więc jeden token dla obu spraw znaczyłby, że adres zużyty przy potwierdzeniu
nadal daje pełen dostęp.

Adres powiadomień Strzelnicy stoi w `facilities.notification_email` — jest jej
polem konfiguracyjnym, jak Horyzont rezerwacji. Pusty znaczy Strzelnicę, która
powiadomień nie chce; list do klienta od tej kolumny nie zależy. Każdy list ma
własne niepowodzenie i żadne nie unieważnia potwierdzenia: Rezerwacja już stoi,
a „nie potwierdziliśmy" byłoby zdaniem nieprawdziwym — zostaje wpis
w dzienniku.

Skrzynka obsługi jest daną kontaktową pracownika, więc nie wychodzi publicznie.
Polityka RLS o kolumnach nie mówi nic, a uprawnienie na całą tabelę przesłania
każde zawężenie, więc `facilities` ma odebrane `select` na tabelę i nadane
kolumnami — dokładnie tymi, które czyta Widget (`FacilityRow`). Kolumna
dołożona do tej tabeli jest odtąd domyślnie prywatna: wystawienie jej wymaga
dopisania do `grant select (…)` w nowej migracji.

## Zarządzanie Rezerwacją przez link

Pod adresem z podsumowania Osoba rezerwująca widzi całą swoją Rezerwację wraz
z Kwotą i może ją anulować, dopóki nie minęło Okno anulowania. Identyfikator
Rezerwacji nie występuje tu ani w żądaniu, ani w odpowiedzi: upoważnieniem jest
token, więc podstawienie cudzego numeru w adresie nie ma czego otworzyć
(ADR 0007).

Okno anulowania jest regułą domeny — `cancellationState` w `packages/shared`,
pokryta testami wraz z samą granicą — a zegarem jest baza. Dlatego
`anuluj-rezerwacje` podaje funkcji `cancel_booking` **chwilę domknięcia okna**,
a nie gotową odpowiedź „wolno" albo „nie wolno": policzona w środowisku
brzegowym byłaby odpowiedzią z innego zegara niż zapis, a granica ma być jedna.
Ten sam podział, co przy `HOLD_MINUTES` i wygasaniu.

Anulowanie zwalnia termin, miejsce w Puli instruktorów i sztuki broni bez
żadnego osobnego kroku: ograniczenie wyłączności Osi obejmuje wyłącznie
Rezerwacje oczekujące i potwierdzone, a widoki zajętości filtrują przez
`booking_holds_term`. Blokady doradczej na Strzelnicę tu nie ma — bierze ją
zapis i potwierdzenie, bo one termin zajmują; anulowanie wyłącznie zwalnia,
a to jest przejście jednego wiersza pod warunkiem na jego stan.

Po upływie okna klient widzi powód i **Kontakt Strzelnicy**
(`facilities.contact_email`, `facilities.contact_phone`). Są to kolumny
prywatne — bez `grant select` — bo czyta je Edge Function rolą serwisową
i podaje dalej razem z Rezerwacją, której dotyczą: kontakt bez Rezerwacji nie
jest niczyją odpowiedzią, a lista telefonów wszystkich Strzelnic tym mniej.
Odrębne od Adresu powiadomień: tamten jest skrzynką obsługi.

Widok jedzie do przeglądarki jako `ManagementViewWire` — momenty tekstem, bo
`Date` nie przeżywa JSON-a. Zamiana w obie strony (`writeManagementView`,
`readManagementView`) mieszka w `packages/shared` i jest tam pokryta jako
tożsamość: rozjazd między nadawcą a odbiorcą znaczyłby ekran z terminem innym
niż w bazie i nikt by tego nie zauważył.

## Odwołanie Rezerwacji przez Strzelnicę

Odwrotność anulowania: termin zwalnia obsługa, a dowiedzieć się ma klient —
zanim wsiądzie do samochodu. Odwołanie **wymaga powodu** i jest to reguła
schematu, nie formalność formularza: `bookings.revocation_reason` ma `check`
mówiący, że powód jest wtedy i tylko wtedy, gdy jest odwołanie. Bez powodu
klient dostałby zdanie „odwołana" i telefon do Strzelnicy, po który i tak
sięgnie — a wtedy odwołanie w Panelu byłoby zadaniem tej rozmowy, nie jej
uniknięciem.

Okna anulowania ta droga nie zna i znać nie ma: ono jest granicą dla klienta,
a Strzelnica odwołuje właśnie wtedy, gdy klient sam już nie może — na godzinę
przed terminem, bo pękła szyba. Odwołać da się natomiast wyłącznie Rezerwację
**potwierdzoną** (`revocable` w `packages/shared`): oczekująca zniknie sama po
Czasie na potwierdzenie, a listu z powodem nie ma gdzie wysłać, bo adres nie
został potwierdzony i bywa zmyślony.

Zwolnienia terminu, miejsca w Puli instruktorów i sztuk broni nie ma tu ani
jednego zdania — tak samo jak przy anulowaniu, i z tego samego powodu: termin
wraca do puli przez samą zmianę stanu.

Zapis idzie Edge Function `odwolaj-rezerwacje` i idzie nią rolą serwisową, tak
samo jak trzy pozostałe drogi zmiany stanu: prawo wykonania `revoke_booking`
mają wyłącznie Edge Functions, bo prawo nadane kontu Panelu otwierałoby drogę
z przeglądarki wprost do bazy — a tamtędy Rezerwacja dałaby się odwołać bez
listu do klienta (ADR 0010).

Granica Strzelnicy zostaje przy tym w bazie: numer konta, w imieniu którego
prosi funkcja, jedzie do niej parametrem, a warunek pyta o jego Strzelnicę
`panel_facility_of` — tę samą odpowiedź, z której liczy się `panel_facility()`
dla zalogowanego. Tożsamość konta potwierdza wcześniej GoTrue (`auth.getUser`
na tokenie z nagłówka), więc Edge Function pyta wyłącznie „kto", nigdy „czyje".

Klient dostaje **e-mail z powodem i Kontaktem Strzelnicy**, i to jest jedyny
list, który mówi o czymś, o co nie prosił. Nie ma w nim ani Kwoty, ani linku do
zarządzania Rezerwacją: rozliczać nie ma czego, a link prowadziłby na ekran
z przyciskiem „Anuluj", którego nie ma czego anulować. Ten sam powód stoi pod
linkiem klienta i w Panelu — list bywa skasowany, a Rezerwacja odwołana zostaje
w Panelu ze swoim stanem, bo dzwoni się właśnie w jej sprawie.

## Blokady Osi

Wyłączenie Osi ze sprzedaży na czas serwisu albo zawodów. Osobna tabela
`lane_closures`, a nie Rezerwacja bez klienta (ADR 0011): tamta wymaga
kontaktu, Uczestników, Kwoty i stawek, a Blokada nie ma z tego ani jednej
rzeczy — i nie ma stanu, bo jest albo jej nie ma.

Zakres czasu jest **dowolny**: Blokada nie wybiera się z opublikowanych Bloków,
bo obsługa zamyka Oś na czas serwisu, a nie na wielokrotność Slotu — i wolno jej
wyjść za horyzont rezerwacji, bo zawody bywają zaplanowane wcześniej, niż
Strzelnica przyjmuje Rezerwacje. Blok, który zahacza o nią choćby minutą,
przestaje być do wzięcia — sprzedać połowy Bloku nie ma jak — ale **zostaje na
grafiku** jako niedostępny, z powodem „termin już zajęty". Zniknięcie zostaje
dniowi zamkniętemu; Blok znikający wyłącznie od Blokady wystawiałby Osobie
rezerwującej różnicę między „ktoś tam jest" a „Strzelnica coś naprawia"
(ADR 0011).

Powód jest wymagany i czyta go wyłącznie obsługa — ticket #16 o niego nie
prosił, więc jest to świadome rozszerzenie zakresu, opisane w ADR 0011. Klient
widzi sam zajęty termin, tak samo jak przy cudzej Rezerwacji.

Dla dostępności Blokada i Rezerwacja są **nierozróżnialne** i jest to wykonane
dosłownie, a nie tylko obiecane: widok `lane_occupancy` wystawia `union all`
obu tabel, obie wchodzą w jeden kształt `Occupancy` z `packages/shared`,
a kolizję orzeka o nich jedna funkcja `occupied`. Terminy Osi wyłączonej znikają
z Widgetu w tej samej chwili, w której Blokada trafia do tabeli — bez czekania
na cokolwiek. Miejsca w Puli instruktorów Blokada przy tym nie zajmuje: nie ma
przy niej nikogo do nadzorowania.

Wyłączności między dwiema tabelami nie da się wyrazić ograniczeniem
wykluczającym — obejmuje ono jedną tabelę — więc stoją tu **dwa wyzwalacze**,
po jednym z każdej strony, i odmawiają wspólnym SQLSTATE `LC001`. Rezerwacja nie
wejdzie na czas Blokady, a Blokada na czas Rezerwacji trzymającej termin: tę
trzeba wcześniej [odwołać](#odwołanie-rezerwacji-przez-strzelnicę), bo klient ma
dostać powód na piśmie, a nie zastać zamknięte. Wyścig dwóch równoczesnych
zapisów rozstrzyga blokada doradcza na Strzelnicę, którą biorą obie funkcje
zapisujące — wyzwalacz cudzego wiersza sprzed zatwierdzenia nie widzi. Blokada
nie wchodzi też na Blokadę, i tego pilnuje już zwykłe ograniczenie wykluczające
na jej tabeli.

Zapis idzie Edge Function `zablokuj-os` i idzie nią rolą serwisową, tak samo jak
odwołanie: konto Panelu prawa do `place_closure` nie ma wcale (ADR 0003).
Granica Strzelnicy zostaje w bazie — numer konta jedzie parametrem, a o jego
Strzelnicę pyta `panel_facility_of` (ADR 0010), więc identyfikator obcej Osi
w żądaniu nie otwiera niczego. Listu nie ma tu żadnego: Blokada nie ma Osoby
rezerwującej, więc nie ma komu go wysłać.

Blokady czyta Panel wprost z tabeli, polityką na przynależność do Strzelnicy —
nie widokiem jak Rezerwacje, bo nie ma w niej ani jednej kolumny, której obsługa
nie ma prawa zobaczyć. Klucz anonimowy nie dostaje do niej ani polityki, ani
prawa: powód wyłączenia jest sprawą wewnętrzną Strzelnicy, a skutek Blokady
wychodzi do Widgetu widokiem zajętości.

Zdjęcia Blokady ten ticket nie ma. Wprowadzona pomyłkowo znika dopiero razem
z ekranem, który będzie umiał ją skasować — osobna tabela czyni to zwykłym
`delete` na własnym wierszu.

## Ręczna Rezerwacja telefoniczna

Zgłoszenie przyjęte przez telefon, wpisywane w Panelu w trakcie rozmowy — z tym
samym kompletem danych, co w Widgecie, razem ze sprzętem i Kwotą. Powstaje od
razu **potwierdzona**: adresu nie wpisał klient, tylko obsługa ze słuchu, więc
nie ma czego potwierdzać ani na co czekać, i nie ma przy niej ani tokenu, ani
Czasu na potwierdzenie.

Każda Rezerwacja niesie odtąd swoje **Źródło** (`bookings.source`): Widget albo
Panel. Kolumna nie ma wartości domyślnej i jest to jej treść — Rezerwacja
zapisana bez podanego Źródła podawałaby się za zgłoszenie klienta, a właśnie o to
jedno ta kolumna ma nie milczeć.

Użytkownik panelu wie o sytuacji więcej niż system, więc wolno mu przekroczyć
trzy limity Strzelnicy: **pojemność Osi**, **godziny otwarcia** i **Pulę
instruktorów**. Wolno wyłącznie po jawnym potwierdzeniu — formularz wymienia
przekraczane limity z nazwy i pyta, zanim cokolwiek wyśle — a każde odstępstwo
zostaje przy Rezerwacji na trwałe (`bookings.limit_overrides`) i stoi w jej
szczegółach zaraz pod Źródłem. Bez tego wiersza Rezerwacja na sześć osób na Osi
czteroosobowej wygląda na pomyłkę systemu, a nie na decyzję, którą ktoś podjął
świadomie.

Listę odnotowanych naruszeń liczy **serwer**, a nie przeglądarka: żądanie niesie
wyłącznie potwierdzenie, a do bazy trafia osąd Edge Function policzony z tych
samych danych, z których policzyła się dostępność. Ten sam podział, co przy
Kwocie — lista przysłana z przeglądarki byłaby naruszeniem, które sam naruszający
sobie wystawia. Ubocznie rozstrzyga to wyścig: gdy między pytaniem o pewność
a zapisem klient zabierze Instruktora z Puli, serwer widzi limit, o którym nikogo
nie zapytano, i odmawia.

Czego przekroczyć **nie** wolno: wyłączności Osi. Termin zajęty przez cudzą
Rezerwację albo Blokadę jest odmową, a nie odstępstwem — dwie grupy na jednej Osi
to nie złamanie reguły Strzelnicy, tylko dwie grupy na jednej Osi. Pilnuje tego
ograniczenie wykluczające w schemacie i wyzwalacze Blokad, więc ręczny wpis
odbija się od bazy, a nie od sprawdzenia w kodzie. Nie do przekroczenia są też
Pula sztuk Typu broni, termin, który minął, minimalne wyprzedzenie i dzień
zamknięty — każde z innego powodu, wypisanego w ADR 0012.

Formularz pokazuje przy tym **wszystkie** Bloki dnia, nie tylko wolne, i przy
każdym powód, przez który wolny nie jest: termin niedostępny dla klienta bywa
dostępny dla obsługi. Powodów bywa więcej niż jeden i wszystkie są tu potrzebne —
`Block.refusals` jest odtąd listą, a Widget pokazuje jej pierwszy wyraz. Powód
pierwszy z brzegu znaczyłby wpis przyjęty na termin, który już minął, bo minięcie
stanęłoby za godzinami otwarcia, przekroczonymi tą samą decyzją.

Listu nie ma tu żadnego — ani do klienta, ani do Strzelnicy. Klient jest na linii
i słyszy termin oraz Kwotę od obsługi, a powiadomienie o nowej Rezerwacji
poszłoby do Strzelnicy, która właśnie tę Rezerwację wpisuje.

Zapis idzie Edge Function `wpisz-rezerwacje` i idzie nią rolą serwisową, tak samo
jak odwołanie i Blokada (ADR 0003). Strzelnicy nie ma przy tym w żądaniu i nie ma
jej czym podstawić: funkcja pyta o nią bazę po numerze potwierdzonego konta
(`panel_facility_of`, ADR 0010), a wszystko dalej — Osie, cennik, zajętość —
liczy się z tej jednej odpowiedzi.

Obie drogi zapisu dzielą przy tym dwie rzeczy, i to nie przypadkiem. Odczyt
grafiku dnia razem z katalogami — wszystko, czego potrzeba, żeby orzec o terminie
i wycenić Rezerwację — stoi w jednej kopii w `supabase/functions/_shared/grafik.ts`,
bo obie zadają bazie dokładnie to samo pytanie, a odpowiadają na nie inaczej:
klientowi odmową, obsłudze pytaniem o pewność. Sam zapis wykonuje `place_booking`,
ta sama funkcja bazodanowa: ręczny wpis ma przejść przez tę samą blokadę doradczą,
to samo zamiatanie wygasłych i to samo sprawdzenie Puli sztuk broni.

## Dzienne zestawienie sprzętu

Obsługa, która przychodzi rano przygotować obiekt, ma jedno pytanie: co dzisiaj
wyjąć. Kalendarz odpowiada na nie po Rezerwacji naraz — dziesięć Rezerwacji to
dziesięć razy „a ile tu broni", liczone w pamięci i mylone przy trzeciej.
Zestawienie liczy to raz: sztuki każdego Typu broni, sztuki amunicji każdego
Rodzaju i liczbę Rezerwacji, na których ma stanąć Instruktor.

Wchodzą wyłącznie Rezerwacje **potwierdzone**, i jest to inna granica niż
`holds_term`, którym rządzi się kalendarz. Oczekująca termin trzyma — Oś jest
zajęta i nikt inny jej nie kupi — ale broni pod niepotwierdzony adres nikt
z magazynu nie wykłada, bo do upływu Czasu na potwierdzenie nie wiadomo nawet,
czy ten ktoś istnieje. Anulowana, odwołana i wygasła odpadają tym samym
warunkiem i z tego samego powodu: po żadnej z nich nikt nie przyjedzie.

Instruktor liczy się w **Rezerwacjach**, a nie w sztukach — jest człowiekiem do
postawienia na Osi, więc miarą jest to, ile razy ma gdzieś stanąć. Liczy się
przy tym tak samo ten wymagany brakiem Pozwolenia, jak i zamówiony dobrowolnie:
grafik zmiany wychodzi z jednego i z drugiego jednakowo — to ta sama miara,
którą Rezerwacja zajmuje miejsce w Puli instruktorów.

Każda pozycja prowadzi do Rezerwacji, z których wynikła — z godziną, Osią
i nazwiskiem, bo to są trzy pytania padające zaraz po „ile": kiedy wyłożyć,
gdzie i komu. Bez nich „trzy Glocki" jest liczbą, której nie da się z niczym
skonfrontować, a właśnie po konfrontację obsługa sięga, gdy w magazynie leżą
dwa.

Sumuje się po **nazwie** z katalogu, a nie po jego identyfikatorze, i wolno tak:
schemat trzyma nazwy Typów broni i Rodzajów amunicji unikalne w obrębie
Strzelnicy (`unique (facility_id, name)`), a Panel widzi dokładnie jedną
Strzelnicę. Nazwa jest zarazem tym, co stoi na ekranie — „Glock 17" wykłada się
z magazynu, nie UUID.

Dzień Zestawienie bierze z kalendarza nad sobą i nie ma własnego pola daty: to
jest jeden dzień oglądany dwa razy — raz po Osiach, raz po tym, co z magazynu na
niego zejdzie — a dwa pola daty na jednym ekranie każą czytającemu zgadywać,
którym z nich przesuwa się to, na co właśnie patrzy.

Żadnego nowego odczytu z bazy przy tym nie ma i być nie musi: Zestawienie liczy
się z tych samych Rezerwacji okna, które Panel już wczytał, czystą funkcją
`dayTally` z `packages/shared`. Tam też mieszkają wszystkie jego reguły — co się
wlicza, co nie i w jakim porządku — i tam mają pokrycie. Testowi
przeglądarkowemu zostaje jedna rzecz, której czysta funkcja nie widzi: czy
pozycja naprawdę otwiera Rezerwację, z której się wzięła.

## Osie i rozkład Bloków

Pierwsza rzecz, którą Strzelnica ustawia sobie sama, zamiast dostawać ją
z seeda: czym dysponuje, ile osób wolno na tym postawić i o których godzinach
sprzedaje. Bloki wypisuje się ręcznie i nie generuje ich nic (ADR 0005), więc
ekran rozkładu jest jedynym miejscem, w którym powstają.

Osi się przy tym **nie kasuje** — wyłącza się ją (ADR 0013). Rezerwacja
wskazuje Oś kluczem obcym z kaskadą, więc skasowanie Osi zabrałoby ze sobą cudze
Rezerwacje, i to bez śladu: klient dowiedziałby się o tym na parkingu.
Rezerwacja znika jedną drogą — [odwołaniem](#odwołanie-rezerwacji-przez-strzelnicę)
z powodem na piśmie — a ekran konfiguracji nie jest drugą. Oś wyłączona znika
z Widgetu w całości, razem ze wszystkimi swoimi terminami, a w Panelu zostaje ze
znacznikiem przy nazwie: jej Rezerwacje stoją w kalendarzu dalej i dalej zajmują
ją na wyłączność, bo ktoś na nie przyjedzie.

O tym, że Osi wyłączonej nie ma w ofercie, mówi **polityka RLS** dla klucza
anonimowego (`using (active)`), a nie warunek w zapytaniu Widgetu — zawężenie
stojące w kodzie ekranu znika razem z pominięciem jednego `.eq(…)` przy
następnej poprawce. Obie funkcje zapisujące Rezerwację pytają o Oś czynną
osobno, bo czytają bazę rolą serwisową, czyli z pominięciem polityk. Wyłączona
Oś nie jest przy tym limitem do przekroczenia ręcznym wpisem (ADR 0012): trzy
limity z tamtej listy są regułami, o których obsługa wie więcej niż system,
a wyłączona Oś jest Osią, której Strzelnica sama nie sprzedaje.

Rozkład zapisuje się **tygodniami jednej Osi**, jednym żądaniem i w jednej
transakcji (ADR 0013). Dopisanie Bloku, skasowanie Bloku, przepisanie dnia na
sześć innych i przepisanie rozkładu jednej Osi na drugą są wtedy tym samym
zapisem — a kopiowanie, o które ticket prosi wprost, nie ma własnej drogi, którą
dałoby się osobno zepsuć. Zmiany żyją najpierw na ekranie i idą do bazy dopiero
przyciskiem; niezapisane ekran nazywa wprost, bo inaczej ktoś wyszedłby z Panelu
przekonany, że zapisał.

Zachodzenie Bloków liczy się na osi **całego tygodnia**, zamkniętej w koło: Blok
wolno przeciągnąć przez północ (sobotni 23:00–01:00 stoi w seedzie), więc po
niedzieli wraca poniedziałek tej samej Osi. Sprawdzenie oglądające jeden dzień
nie zobaczyłoby kolizji wystającej poza jego granicę. Reguły — siatka Slotów,
długość, zachodzenie, kopiowanie — mieszkają w `packages/shared/src/schedule.ts`
i są jedną kopią dla Panelu i dla Edge Function, tak samo jak przy Blokadzie.

Rezerwacji zmiana rozkładu nie rusza i nie ma czym: Rezerwacja niesie własny
termin i o rozkład nie pyta nikogo po tym, jak powstała. Blok zdjęty z rozkładu
znika ze sprzedaży, a nie z kalendarza — Rezerwacja na 10:00 zostaje na 10:00
także wtedy, gdy Strzelnica nie sprzedaje już tej godziny nikomu.

Widget widzi zmianę od razu przy otwarciu, a otwarty — z najbliższym
odświeżeniem, czyli w ciągu minuty: rozkład czyta się tą samą drogą i w tym
samym rytmie, co zajętość Osi, bo oba odpowiadają na to samo pytanie, co jest
do wzięcia **teraz**. Pamięci podręcznej do unieważnienia nie ma tu żadnej —
ramka otwarta od godziny przestaje przez to oferować terminy, których
Strzelnica właśnie przestała sprzedawać, zamiast dowiadywać się o tym odmową
przy zapisie.

Zapis idzie Edge Functions `zapisz-os` i `ustaw-rozklad`, rolą serwisową, tak
samo jak odwołanie, Blokada i ręczny wpis (ADR 0003). Strzelnicy nie ma
w żądaniu: funkcje pytają o nią bazę po numerze potwierdzonego konta
(`panel_facility_of`, ADR 0010), więc identyfikator obcej Osi nie otwiera
niczego. Jedna funkcja zapisuje Oś nową i poprawioną — zakładanie i poprawianie
różnią się wyłącznie tym, czy Oś już jest, a wyłączenie jest poprawką jednego
pola.

Czego ten ekran **nie** ustawia: stawki za Blok. Należy do Cennika (ticket #22),
więc Oś dodana tutaj wchodzi ze stawką zerową — formularz mówi to wprost, bo Oś
z rozkładem i bez ceny sprzedawałaby terminy za darmo. Godziny, w których Bloki
tej Osi w ogóle się sprzedają, ustawia [ekran obok](#godziny-otwarcia-i-wyjątki-kalendarzowe).

## Godziny otwarcia i wyjątki kalendarzowe

Kiedy Strzelnica jest czynna — wspólnie dla wszystkich Osi, inaczej niż rozkład
Bloków. Dwie rzeczy odpowiadają tu na jedno pytanie z dwóch stron: **tydzień**
mówi o rytmie („w poniedziałki 10:00–22:00"), a **wyjątek** o jednej dacie
(„w Wigilię do południa", „w Boże Narodzenie wcale") — i to wyjątek wygrywa.
Dzień ma więc jedną odpowiedź, liczoną w jednym miejscu (`hoursForDay`), a nie
dwa sprawdzenia do rozjechania się przy pierwszym święcie.

Wyjątek **zastępuje** tydzień w całości, a nie poprawia go, i wolno mu też dzień
**otworzyć** — sobota zamknięta w rytmie tygodnia bywa dniem zawodów. Godziny
puste znaczą przy tym dzień zamknięty, tak samo w wyjątku, jak w tygodniu, gdzie
dzień zamknięty jest po prostu dniem bez wiersza. Dzień zamknięty nie ma ani
jednego Bloku — kalendarz Widgetu mówi o tym wprost, zamiast pokazywać pustkę
do zinterpretowania. Dzień **skrócony** to co innego: Bloki na nim stoją, ale te,
które nie mieszczą się w godzinach, są widoczne i niedostępne.

Tydzień zapisuje się w całości, tak samo jak rozkład Bloków (ADR 0013): dzień
dopisany, poprawiony i zamknięty są jednym żądaniem, a zamknięcie polega właśnie
na **pominięciu** dnia na liście. Wyjątki idą pojedynczo i jest to różnica, a nie
niekonsekwencja: przybywa ich przez cały rok, więc zapis w całości kasowałby
święta wpisane poprzednią zmianą. Jedno żądanie obsługuje dopisanie, poprawkę
i zdjęcie wyjątku — różnią się wyłącznie tym, co na dacie ma zostać.

Rezerwacji ani jedna z tych zmian **nie rusza** i nie ma czym: Rezerwacja niesie
własny termin i o godziny nie pyta nikogo po tym, jak powstała. Te, które po
zmianie stoją poza godzinami — w dniu zamkniętym albo wystając poza skrócony —
Panel **wypisuje z nazwiskiem, Osią i godziną**, zanim cokolwiek pójdzie do bazy,
i prowadzi z każdej do jej szczegółów. Rozstrzyga je człowiek: odwołaniem
z powodem albo pozostawieniem, bo klient i tak przyjedzie. Sprawdzenie sięga
okna kalendarza Panelu — tydzień wstecz i po horyzont — i ekran mówi to wprost,
bo milczenie o Rezerwacjach dalszych wyglądałoby jak „nie ma kolizji".

Zapis idzie Edge Functions `ustaw-godziny` i `ustaw-wyjatek`, rolą serwisową,
tak samo jak Blokada, ręczny wpis i rozkład (ADR 0003). Strzelnicy w żądaniu nie
ma i nie ma jej czym podstawić: godziny są jej własnością, a o tym, czyje są,
rozstrzyga baza po numerze potwierdzonego konta (`panel_facility_of`, ADR 0010).
Cała droga przejęcia cudzych godzin wiodłaby więc przez funkcję bazodanową
wołaną wprost — a prawa jej wykonania nie ma ani klucz anonimowy, ani konto
Panelu.

Kolumna `calendar_exceptions.closed_on` nazywa się odtąd `on_date`: wyjątek
przestał znaczyć wyłącznie „zamknięte", a kolumna nazwana po skutku, którego już
nie gwarantuje, kłamałaby przy pierwszym skróconym dniu.

**Powód** wyjątku do Widgetu nie wychodzi — czyta go wyłącznie obsługa, tak samo
jak powód Blokady. Blokada załatwia to odebraniem kluczowi anonimowemu prawa do
całej tabeli; tu tak nie można, bo dzień zamknięty musi dojść do kalendarza
klienta. Prawa schodzą więc **kolumnami**, jak przy `facilities`: klucz
anonimowy dostaje datę i godziny, a Widget wypisuje te kolumny w zapytaniu
zamiast prosić gwiazdką o wszystko. Konto Panelu czyta wiersz w całości.

## Panel

Wejście do Panelu daje konto Supabase Auth powiązane z jedną Strzelnicą przez
tabelę `panel_users`. Ról nie ma: wszyscy Użytkownicy panelu danej Strzelnicy
mają identyczne uprawnienia, więc powiązanie ze Strzelnicą jest całą treścią tej
tabeli. Rejestracji też nie ma — `enable_signup = false` zamyka ją w GoTrue,
a konta zakłada operator platformy razem ze Strzelnicą.

Rezerwacje Panel czyta widokiem `panel_bookings`, a nie polityką na `bookings`
(ADR 0008): tabela niesie tokeny Osoby rezerwującej, a polityka RLS o kolumnach
nie mówi nic. Widok wystawia dokładnie te kolumny, których Panel potrzebuje,
i dokłada `holds_term` — czy Rezerwacja trzyma jeszcze termin — liczone tą samą
funkcją `booking_holds_term`, co widoki zajętości Widgetu. Kalendarz Panelu
pokazuje wyłącznie Rezerwacje trzymające termin, lista — wszystkie, ze stanem
w kolumnie, a [Zestawienie dnia](#dzienne-zestawienie-sprzętu) — wyłącznie
potwierdzone.

W kalendarzu stoją obok nich [Blokady](#blokady-osi), w jednym szeregu i w tym
samym porządku godzin: obie zajmują Oś, więc dzień Osi czyta się z jednego
miejsca. Odróżnia je znacznik „Blokada" w miejscu, w którym przy Rezerwacji stoi
nazwisko, obwódka w innym kolorze i brak przycisku — Blokada nie prowadzi na
żaden ekran, bo cała jej treść stoi w kolumnie. Blokada dłuższa od doby wypisuje
się pełnymi chwilami zamiast zakresem godzin: „18:00–12:00" kłamałoby o jej
długości, i to w stronę, w którą kłamać nie wolno. Na liście Blokad nie ma —
jej kolumny to Osoba rezerwująca, Uczestnicy i Kwota, a Blokada nie ma ani
jednej z tych rzeczy.

Zmienia Panel siedem rzeczy: odwołuje Rezerwację (zobacz [Odwołanie Rezerwacji
przez Strzelnicę](#odwołanie-rezerwacji-przez-strzelnicę)), wprowadza Blokadę
Osi (zobacz [Blokady Osi](#blokady-osi)), wpisuje Rezerwację przyjętą przez
telefon (zobacz [Ręczna Rezerwacja
telefoniczna](#ręczna-rezerwacja-telefoniczna)), zapisuje Oś i jej rozkład
Bloków (zobacz [Osie i rozkład Bloków](#osie-i-rozkład-bloków)) oraz ustawia
godziny otwarcia i wyjątki kalendarzowe (zobacz [Godziny otwarcia i wyjątki
kalendarzowe](#godziny-otwarcia-i-wyjątki-kalendarzowe)). Wszystkie siedem
idzie Edge Function, bo tabele mają zamknięte obie publiczne role — a ekran
odczytuje po tym dane od nowa, zamiast przepisywać sobie stan z odpowiedzi
„udało się": między wczytaniem Panelu a kliknięciem klient bywa szybszy.

Konfiguracja stoi na dole ekranu, pod wszystkim, co mówi o dniu dzisiejszym:
obsługa przychodzi tu po Rezerwacje, a Osie, ich rozkład i godziny układa raz
i wraca do nich rzadko. Godziny idą przy tym na sam koniec, bo są wspólne dla
wszystkich Osi — tam kończy się wszystko, co dotyczy jednej. Formularze układające **przyszłość** — ręczny wpis i Blokada —
znają przy tym wyłącznie Osie czynne, a kalendarz i lista wszystkie: pierwsze
mówią o tym, co dopiero stanie na Osi, drugie o tym, co już na niej stoi.

Formularz ręcznego wpisu potrzebuje przy tym więcej niż same Rezerwacje: liczy
dostępność terminu i Kwotę tymi samymi czystymi funkcjami, co Widget, więc Panel
czyta też rozkład Bloków, godziny otwarcia, wyjątki kalendarzowe i oba katalogi
w całości — z pulami sztuk i cenami. Zajętość składa mu się z tego, co ma pod
ręką (`panelOccupancy`, `panelWeaponOccupancy`), a nie z widoków zajętości
Widgetu: te wystawiają zajętość **wszystkich** Strzelnic i konto Panelu nie ma do
nich prawa (ADR 0009).

Formularz Blokady oknem odczytu **nie** jest przy tym ograniczony, inaczej niż
pola filtrów: tam okno jest granicą pytania, a tu byłoby granicą zapisu —
a Blokada obejmuje dowolny zakres czasu, także dalszy niż horyzont. Zapisana
poza oknem po prostu nie stoi jeszcze w kalendarzu i formularz mówi to wprost.

Ani jedno zapytanie Panelu nie mówi o Strzelnicy: zalogowanemu kontu baza oddaje
wyłącznie jej wiersze (zobacz [Izolacja Strzelnic](#izolacja-strzelnic)). Warunek
na `facility_id` dopisany w kodzie ekranu byłby drugą granicą — tą, o której się
zapomina.

Zawęża je natomiast **po czasie**: Panel czyta okno liczone od dzisiaj —
tydzień wstecz i po horyzont Strzelnicy włącznie (`panelWindow`). Odczyt bez
granicy urwałby się kiedyś na `max_rows` PostgREST-a bez słowa, a przy porządku
rosnącym urwałby przyszłość, czyli dokładnie to, po co obsługa tu zagląda. Tym
samym oknem ograniczone są pola wyboru daty na obu ekranach: filtr, którym da
się wskazać dzień spoza okna, odpowiadałby „brak Rezerwacji" na dzień, o który
nikt nie zapytał bazy. Pozycje Rezerwacji zawężają się tym samym oknem, sięgając
przez `panel_bookings` do terminu swojej Rezerwacji — własne kolumny nie mówią
o nim nic.

Widoki są **oknami wyłącznie do odczytu**, i wymaga to osobnego zdania w SQL-u:
prosty widok nad jedną tabelą jest w Postgresie zapisywalny sam z siebie,
a Supabase nadaje domyślnie komplet praw każdej nowej relacji w `public`. Bez
`revoke all` klucz anonimowy kasowałby Rezerwacje przez `lane_occupancy`,
a Panel pisałby do `bookings` przez `panel_bookings` z pominięciem Edge
Functions. Pilnuje tego test przeglądarkowy — uprawnienia nie są regułą, którą
zobaczy czysta funkcja.

Widoków zajętości Panel nie czyta wcale i nie ma do nich prawa: czytają
`bookings` prawami właściciela, więc wystawiają zajętość **wszystkich**
Strzelnic. Dla klucza anonimowego jest to w porządku i po to powstały, dla
konta Panelu byłoby wyłomem obok wszystkich jego polityk.

Ekran odświeża się co minutę. Rezerwacje przychodzą z Widgetu przez cały dzień,
a obsługa trzyma Panel otwarty od rana; tą samą drogą gasną Rezerwacje
oczekujące, bo `holds_term` liczy zegar bazy w chwili odczytu.

Seed zakłada dwa konta, po jednym na Strzelnicę, oba z hasłem `panel-demo-123`:

| Konto | Strzelnica |
| --- | --- |
| `obsluga@strzelnica-demo.example.pl` | Strzelnica Demo |
| `obsluga@strzelnica-druga.example.pl` | Strzelnica Druga |

## Izolacja Strzelnic

Użytkownik panelu jednej Strzelnicy nie odczyta i nie zmieni niczego, co należy
do innej — nawet znając identyfikatory. Rozstrzyga o tym **rola**, a nie tabela
(ADR 0009): te same tabele mają być otwarte dla Widgetu i zamknięte dla obcego
konta, więc granica nie może przebiegać po nich.

| Rola | Skąd się bierze | Co widzi |
| --- | --- | --- |
| `anon` | klucz w kodzie Widgetu, bez tożsamości | oferta wszystkich Strzelnic i nic poza nią |
| `authenticated` | konto Panelu, `panel_facility()` mówi czyje | jedna Strzelnica, w komplecie — i wyłącznie do odczytu |
| `service_role` | Edge Functions | każdą tabelę; tędy idzie **każdy** zapis, także odwołanie Rezerwacji i Blokada Osi w imieniu konta Panelu (ADR 0003, ADR 0010) |

Rola serwisowa widzi każdą **tabelę**, ale nie widoku `panel_bookings`: jego
warunek pyta o zalogowane konto, a rola serwisowa żadnym nie jest. Rezerwacje
czyta więc z `bookings`, tak jak robią to Edge Functions.

Klucz anonimowy czyta ofertę wszystkich, bo nie ma czym powiedzieć, której
Strzelnicy jest — osadzają go różne strony różnych Strzelnic, wszystkie tym
samym skryptem. Oferta to Osie, rozkład Bloków, godziny, wyjątki kalendarzowe,
oba katalogi i publiczne kolumny `facilities`; ani jednej danej osobowej.
Konto Panelu ma tożsamość, więc widzi dokładnie jedną Strzelnicę — a konto bez
powiązania żadnej, bo puste `panel_facility()` czyni każdy taki warunek fałszem.

Politykę na przynależność do Strzelnicy mają wszystkie tabele domenowe poza
trzema, i przy każdej z tych trzech jest to decyzja:

| Tabela | Gdzie stoi jej granica |
| --- | --- |
| `bookings` | w widoku `panel_bookings` (ADR 0008) — tabela niesie tokeny Osoby rezerwującej, a polityka o kolumnach nie mówi nic; obie publiczne role tracą do niej prawo odczytu |
| `mail_outbox` | nigdzie i nie jest potrzebna — czyta ją wyłącznie rola serwisowa, obie publiczne role tracą prawo odczytu |
| `panel_users` | w warunku o konto (`user_id = auth.uid()`), bo ta tabela jest **źródłem** odpowiedzi na „czyja to Strzelnica"; konto widzi z niej jeden wiersz, własny |

Osobno stoi `lane_closures`: politykę na przynależność do Strzelnicy ma, ale
tylko dla konta Panelu — klucz anonimowy nie dostaje ani jej, ani prawa odczytu.
Nie jest to bowiem oferta: powód wyłączenia Osi czyta wyłącznie obsługa,
a klientowi wychodzi sam skutek, widokiem `lane_occupancy` (zobacz
[Blokady Osi](#blokady-osi)).

Uprawnienia są przy tym drugim zamkiem, nie ozdobą przy RLS, bo dwie rzeczy
wymykają się politykom z definicji: `truncate` nie podlega RLS wcale (a Supabase
nadaje to prawo każdej nowej relacji), a `update` i `delete` bez polityki nie są
odmawiane, tylko trafiają w zero wierszy — PostgREST kwituje je kodem 204, jakby
się udały. Prawa zapisu schodzą więc obu publicznym rolom ze wszystkich relacji
naraz, a z odczytu wypadają trzy grupy: Rezerwacje i poczta (nikomu publicznemu),
pozycje Rezerwacji i konta Panelu (kluczowi anonimowemu) oraz widoki zajętości
(kontu Panelu). Domyślne prawa dla przyszłych relacji schodzą w całości, więc
tabela dołożona kolejną migracją jest niedostępna, dopóki ktoś jej świadomie nie
wystawi — a migracja dokładająca tabelę domenową ma odtąd trzy zdania do
napisania: `enable row level security`, polityki dla obu ról i `grant select`.
Dotyczy to relacji tworzonych przez migracje (rola `postgres`); tabela założona
z pulpitu Supabase powstaje jako `supabase_admin` i idzie jego domyślnymi
prawami, których ta migracja nie dosięga.

Seed zakłada drugą Strzelnicę z wierszem w **każdej** tabeli domenowej — dwiema
Osiami, własnym rozkładem i godzinami, wyjątkiem kalendarzowym, oboma
katalogami, dwiema Rezerwacjami z pozycjami, Blokadą i listem w skrzynce. Nie jest to
rozmach: asercja „nie widzę tego wiersza" bez obcego wiersza mierzy pustkę,
a nie granicę. Pierwsza Rezerwacja celuje w to samo okno czasu, co Rezerwacja
demo — gdyby Panel dzielił dane po dacie zamiast po Strzelnicy, byłoby to widać.

Sprawdza to `e2e/tests/izolacja-strzelnic.spec.ts`, i sprawdza obok interfejsu:
pyta PostgREST-a wprost o obce wiersze, identyfikatorami wypisanymi w teście.
Panel filtrujący w przeglądarce wygląda dokładnie tak samo jak Panel odcięty
przez bazę, więc pytanie zadane przez ekran nie odróżnia jednego od drugiego.
Każdy odczyt idzie dwa razy — raz rolą serwisową, po dowód, że wiersz jest, raz
obcym kontem, po dowód, że go nie widać.

## Poczta

Szablony wiadomości mieszkają w `packages/shared/src/mail.ts` jako czyste
funkcje — treść jest częścią modułu tak samo jak teksty Widgetu. Wszystkie
zdania stoją tam w jednym słowniku `TEKSTY`, a szablon jest już tylko listą
odcinków; wersja tekstowa i HTML powstają z tej samej listy, więc nie ma jak
obiecać jednego w podglądzie, a drugiego po włączeniu HTML-a. Wysyłką zajmuje
się `supabase/functions/_shared/poczta.ts` i wybiera drogę obecnością klucza
dostawcy:

| Środowisko | Co się dzieje |
| --- | --- |
| `RESEND_API_KEY` ustawiony | wiadomość idzie do Resend, nadawca z `MAIL_FROM` |
| bez klucza (lokalnie, CI) | wiadomość ląduje w tabeli `mail_outbox` |

Ta druga droga jest przechwytywaniem wysyłki, którego wymaga spec dla
środowiska testowego — i jedynym miejscem, w którym test przeglądarkowy widzi
link. Nie ma osobnego przełącznika „tryb testowy": jest brak dostawcy.

Na produkcji klucz ustawia się przez `supabase secrets set RESEND_API_KEY=…`,
tak samo jak `WIDGET_ORIGIN`; lokalnie `MAIL_FROM` stoi w `supabase/config.toml`.
Tabela `mail_outbox` niesie dane osobowe, więc — jak `bookings` — ma włączone
RLS i zero polityk: klucz anonimowy nie czyta z niej nic.

## Baza danych

Zmiana schematu = nowa migracja w `supabase/migrations/`, potem `pnpm db:reset`
i `pnpm db:types`. Wygenerowanego `database.types.ts` nie edytuje się ręcznie —
CI regeneruje go przy każdym przebiegu i przerywa, gdy zawartość w repozytorium
odbiega od schematu.

Czas przechowywany jako `timestamptz` w UTC; strefa Strzelnicy jest jej polem
konfiguracyjnym. Kwoty w groszach jako liczby całkowite.
