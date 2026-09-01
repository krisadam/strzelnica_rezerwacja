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
pnpm db:env          # zapisuje adres i klucz anonimowy do .env
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
| `pnpm db:env` | zapisanie adresu i klucza lokalnego Supabase do `.env` |
| `pnpm db:reset` | odtworzenie bazy z migracji i wykonanie seeda |
| `pnpm db:types` | regeneracja `packages/shared/src/database.types.ts` ze schematu |

## Testy

Większość testów mieszka w `packages/shared` jako testy czystych funkcji: reguły
domeny przyjmują zwykłe dane, a „teraz" jest parametrem, nie odczytem zegara.
Reguła, której nie da się wyrazić jako czysta funkcja, jest sygnałem do jej
wyciągnięcia — nie do dopisania testu wyżej.

`e2e/` to wąska warstwa weryfikacyjna dla tego, czego czysta funkcja nie widzi:
wyścig o ten sam Blok, przejście całej ścieżki, izolacja Strzelnic, osadzenie
w ramce, potwierdzenie adresu. Wymagają wstającego Supabase (`pnpm db:start`)
i zbudowanych aplikacji (`pnpm build`). Nie dubluje reguł pokrytych na szwie
podstawowym.

## Rezerwacje

Rezerwację zapisuje wyłącznie Edge Function `zloz-rezerwacje` (ADR 0003).
Klucz anonimowy nie ma do tabeli `bookings` żadnej polityki RLS: nie zapisze
do niej niczego i nie odczyta z niej niczego. Kalendarz czyta zajętość
z widoku `lane_occupancy` — Oś i zakres czasu, bez danych osobowych.

Wyłączności Osi pilnuje ograniczenie `exclude` w schemacie, a nie sprawdzenie
w kodzie: dwa równoczesne zgłoszenia na ten sam Blok przechodzą walidację oba,
a rozstrzyga dopiero zapis. Sprawdzenie przed zapisem jest po to, żeby
powiedzieć klientowi, co jest nie tak.

Sam zapis wykonuje funkcja bazodanowa `place_booking`: Rezerwacja i jej
Wypożyczenia powstają w jednej transakcji, a Pula sztuk Typu broni sprawdza się
pod blokadą doradczą na Strzelnicę. Wypożyczenia widoczne publicznie są
w widoku `weapon_occupancy` — Typ, liczba sztuk i zakres czasu, bez danych
osobowych.

Funkcja weryfikuje nagłówek `Origin` względem `facilities.allowed_origins`
powiększonych o domenę samego Widgetu. Ta ostatnia jest jednakowa dla
wszystkich Strzelnic, więc jest konfiguracją platformy: lokalnie stoi
w `supabase/config.toml` jako `[edge_runtime.secrets] WIDGET_ORIGIN`, a na
produkcji ustawia się ją przez `supabase secrets set WIDGET_ORIGIN=…`.

## Baza danych

Zmiana schematu = nowa migracja w `supabase/migrations/`, potem `pnpm db:reset`
i `pnpm db:types`. Wygenerowanego `database.types.ts` nie edytuje się ręcznie —
CI regeneruje go przy każdym przebiegu i przerywa, gdy zawartość w repozytorium
odbiega od schematu.

Czas przechowywany jako `timestamptz` w UTC; strefa Strzelnicy jest jej polem
konfiguracyjnym. Kwoty w groszach jako liczby całkowite.
