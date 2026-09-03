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
importuje.

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
w ramce, potwierdzenie adresu, anulowanie przez link. Wymagają wstającego Supabase (`pnpm db:start`)
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

Rezerwację zapisuje wyłącznie Edge Function `zloz-rezerwacje`, potwierdza
`potwierdz-rezerwacje`, a anuluje `anuluj-rezerwacje` (ADR 0003). Tą samą drogą
idzie jej **odczyt** spod linku klienta (`pokaz-rezerwacje`), choć niczego nie
zmienia: `bookings` niesie dane osobowe, a Osoba rezerwująca nie ma konta,
którym dałoby się jej pokazać własny wiersz i tylko własny.
Klucz anonimowy nie ma do tabeli `bookings` żadnej polityki RLS: nie zapisze
do niej niczego i nie odczyta z niej niczego. Kalendarz czyta zajętość
z widoku `lane_occupancy` — Oś i zakres czasu, bez danych osobowych.

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
