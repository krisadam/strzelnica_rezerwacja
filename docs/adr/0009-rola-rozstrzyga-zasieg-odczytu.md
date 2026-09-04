# Rola rozstrzyga zasięg odczytu, a uprawnienia są listą tego, co wolno

Spec mówi dwie rzeczy naraz i wyglądają one na sprzeczne. Historia 59:
Użytkownik panelu nie widzi i nie może zmienić danych innej Strzelnicy.
Decyzja implementacyjna: „Odczyt danych publicznych (Osie, rozkład Bloków,
katalogi, zajętość terminów, konfiguracja Strzelnicy) — bezpośrednio z klienta
przez PostgREST pod kontrolą RLS". Te same tabele mają być więc dla jednego
pytającego otwarte, a dla drugiego zamknięte.

Rozstrzyga **rola**, nie tabela:

- `anon` — klucz stojący w kodzie Widgetu, bez tożsamości. Nie ma czym
  powiedzieć, której Strzelnicy jest, bo osadzają go różne strony różnych
  Strzelnic i wszystkie tym samym skryptem. Czyta ofertę wszystkich Strzelnic
  i wyłącznie ofertę — to, co i tak wisi na stronie każdej z nich.
- `authenticated` — konto Panelu, zawsze czyjeś. `panel_facility()` mówi,
  czyje, więc widzi jedną Strzelnicę. Konto bez powiązania nie widzi żadnej:
  puste `panel_facility()` czyni każdy taki warunek fałszem, a więc brak
  konfiguracji jest tu odmową, nie otwarciem.

Alternatywa — zawężenie po stronie klienta, `.eq('facility_id', …)`
w zapytaniach Panelu — działała do tego ticketu i jest tym rodzajem
zabezpieczenia, które wygląda identycznie jak prawdziwe: ekran pokazuje to
samo, dopóki ktoś nie pominie jednego warunku przy siódmym zapytaniu. Granica
w kodzie ekranu odpowiada na pytanie „czego Panel nie pokazuje", a spec pyta
o coś innego: czego konto **nie może dostać**. Odpowiada na to wyłącznie baza.

## Uprawnienia to lista tego, co wolno

RLS filtruje wiersze i robi to dobrze, ale nie jest całą ochroną — dwie rzeczy
wymykają się jej z definicji:

- `truncate` **nie podlega** politykom RLS. Sprawdza samo uprawnienie, a
  Supabase nadaje je każdej nowej relacji w `public` razem z każdym innym
  prawem — więc klucz anonimowy miał prawo opróżnić każdą tabelę domenową do
  zera. PostgREST takiego żądania nie umie złożyć i to jedyne, co dotąd stało
  na drodze; jest to własność narzędzia przed bazą, a nie własność bazy.
- `update` i `delete` bez polityki nie są odmawiane, tylko trafiają w zero
  wierszy — PostgREST kwituje je kodem 204, jakby się udały. Odmowa jest
  odpowiedzią uczciwszą i jedyną, która nie zamieni się w zapis, gdy ktoś
  kiedyś doda politykę szerszą, niż zamierzał.

Dlatego prawa zapisu schodzą obu publicznym rolom ze wszystkich relacji naraz,
a z odczytu wypadają trzy grupy, każda z własnym powodem: Rezerwacje i poczta
(dane osobowe — nie czyta ich nikt publiczny), pozycje Rezerwacji i konta
Panelu (nie są ofertą — nie czyta ich klucz anonimowy) oraz widoki zajętości
(omijają RLS — nie czyta ich konto Panelu). Rola serwisowa zostaje nietknięta —
zapis idzie przez nią i tylko przez nią (ADR 0003).

Odbierania wszystkiego i nadawania z powrotem świadomie nie robimy: `revoke
all` zabrałby też kolumnowy `grant select` na `facilities`, a przepisanie tam
listy jedenastu kolumn dałoby dwie listy, które muszą pozostać zgodne. Dwie
listy o tym samym rozjeżdżają się przy pierwszej poprawce, a rozjazd w tym
miejscu znaczy publiczną kolumnę, której nikt nie chciał wystawić.

Domyślne prawa dla przyszłych relacji schodzą natomiast w całości, razem
z odczytem. Bez tego cała ta praca dotyczyłaby wyłącznie dnia dzisiejszego:
tabela dołożona przyszłą migracją wstałaby z kompletem praw dla `anon`.
Skutkiem jest reguła warta samej zmiany — nowa relacja jest domyślnie
niedostępna, więc jej wystawienie wymaga świadomego zdania w SQL-u. Ta sama
reguła, co przy `grant select (…)` na `facilities`, tylko o szczebel wyżej:
tam kolumna, tu cała relacja.

Zasięg tego jednego zdania jest węższy, niż się czyta: domyślne prawa są
własnością roli tworzącej obiekt, a migracje jadą jako `postgres`. Tabela
założona z pulpitu Supabase powstaje jako `supabase_admin`, idzie jego
domyślnymi prawami i wstaje z kompletem — i nie da się tego zmienić migracją,
która nie jest tą rolą. Zakładanie tabel domenowych z pulpitu jest więc drogą
poza tę gwarancję; schemat zmienia się migracją (README, „Baza danych").

## Trzy tabele bez polityki na przynależność

Reguła nie obejmuje wszystkiego i nie udajemy, że obejmuje. Trzy tabele
domenowe zostają bez warunku z `panel_facility()`:

- `bookings` — Panel czyta ją widokiem `panel_bookings` (ADR 0008), bo polityka
  mówi o wierszach, a tabela niesie dwa tokeny Osoby rezerwującej. Warunek na
  Strzelnicę stoi tam, w widoku.
- `mail_outbox` — nie czyta jej nikt poza rolą serwisową, więc polityka byłaby
  drzwiami w ścianie bez przejścia.
- `panel_users` — jej polityka pyta o konto, nie o Strzelnicę, bo ta tabela
  jest źródłem odpowiedzi na „czyja to Strzelnica". Warunek z `panel_facility()`
  pytałby sam siebie.

Dwie pierwsze tracą prawo odczytu dla obu publicznych ról, więc ich granica jest
mocniejsza od polityki: nie ma czym ich zapytać. Trzeciej zostaje jeden
wiersz — własny.

## Konsekwencje

Panel nie ma ani jednego zapytania mówiącego o Strzelnicy i nie powinien go
dostać. Warunek dopisany w `apps/panel/src/dane.ts` byłby drugą granicą, a
druga granica to ta, o której się zapomina — i o której zapomnienia nikt nie
zauważy, bo pierwsza wciąż trzyma.

Widoki zajętości (`lane_occupancy`, `weapon_occupancy`) czytają `bookings`
prawami właściciela, więc wystawiają zajętość wszystkich Strzelnic — bez danych
osobowych. Dla klucza anonimowego jest to w porządku i po to powstały: kalendarz
Widgetu liczy z nich wolne Bloki. Dla konta Panelu nie jest, bo zajętość obcej
Osi jest daną obcej Strzelnicy, a widok podałby ją obok wszystkich polityk.
Panel jej nie czyta — Rezerwacje bierze z `panel_bookings` — więc prawo do niej
traci. Ekran Panelu, który kiedyś będzie liczył dostępność (ręczne wpisanie
Rezerwacji, historie 43–45), dostanie widok zawężony do swojej Strzelnicy, a nie
prawo do tych dwóch.

Migracja dokładająca tabelę domenową ma odtąd trzy zdania do napisania, nie
jedno: `enable row level security`, polityki dla obu ról i `grant select`.
Zapomnienie któregokolwiek daje odmowę, nie przeciek — i to jest cała różnica
między tym układem a poprzednim.
