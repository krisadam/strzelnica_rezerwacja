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

Widget potrzebuje wskazania Strzelnicy — bierze je z adresu, dopóki nie robi
tego skrypt osadzający: <http://localhost:5173/?strzelnica=strzelnica-demo>.

Playwright potrzebuje jednorazowo przeglądarki:

```bash
pnpm --filter @strzelnica/e2e exec playwright install chromium
```

## Struktura

| Katalog | Zawartość |
| --- | --- |
| `apps/widget` | Widget — React + Vite, aplikacja ładowana w ramce |
| `apps/panel` | Panel — React + Vite, logowanie przez Supabase Auth |
| `packages/shared` | typy ze schematu bazy, logika dostępności, wyliczanie Kwoty, walidacja |
| `supabase/` | migracje, polityki RLS, seed, Edge Functions |
| `e2e/` | testy przeglądarkowe (Playwright) |

Logika dostępności i wyliczanie Kwoty istnieją w **jednej kopii**
w `packages/shared` i są używane przez Widget, Panel oraz Edge Functions.

## Polecenia

| Polecenie | Działanie |
| --- | --- |
| `pnpm dev` | Widget i Panel równolegle |
| `pnpm dev:widget` / `pnpm dev:panel` | jedna aplikacja |
| `pnpm build` | produkcyjne buildy obu aplikacji |
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
w ramce, potwierdzenie adresu. Nie dubluje reguł pokrytych na szwie
podstawowym.

## Baza danych

Zmiana schematu = nowa migracja w `supabase/migrations/`, potem `pnpm db:reset`
i `pnpm db:types`. Wygenerowanego `database.types.ts` nie edytuje się ręcznie —
CI regeneruje go przy każdym przebiegu i przerywa, gdy zawartość w repozytorium
odbiega od schematu.

Czas przechowywany jako `timestamptz` w UTC; strefa Strzelnicy jest jej polem
konfiguracyjnym. Kwoty w groszach jako liczby całkowite.
