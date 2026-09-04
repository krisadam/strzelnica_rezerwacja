-- Izolacja Strzelnic: rola pytającego rozstrzyga zasięg odpowiedzi.
--
-- Do tej pory wielodostępność bazy trzymała się na tym, co niesie dane osobowe:
-- Rezerwacje odcinał widok `panel_bookings`, a ich pozycje polityki
-- z `panel_facility()`. Wszystko pozostałe — Strzelnica, jej Osie, rozkład
-- Bloków, godziny, wyjątki kalendarzowe i oba katalogi — stało pod polityką
-- `using (true)` dla obu ról naraz, bo to oferta i czyta ją anonimowo każdy
-- Widget. Skutek: zalogowana obsługa jednej Strzelnicy czytała Osie, Cennik
-- i rozkład drugiej, a zawężenie do własnej robił dopiero Panel w przeglądarce.
--
-- Interfejs nie jest granicą. Zawężenie stojące w kodzie ekranu znika razem
-- z pominięciem jednego `.eq(…)` przy następnym zapytaniu — a tu nie chodzi
-- o to, czego Panel nie pokazuje, tylko o to, czego konto nie może dostać
-- (spec, historia 59). Granica wraca więc do bazy, w kształcie, którego oferta
-- nie psuje: **rola** rozstrzyga zasięg.
--
--   * `anon` — klucz z kodu Widgetu, bez tożsamości: nie ma czym powiedzieć,
--     której Strzelnicy jest, bo osadzają go różne strony różnych Strzelnic.
--     Czyta więc ofertę wszystkich i wyłącznie ofertę — to, co i tak wisi na
--     stronie każdej z nich.
--   * `authenticated` — konto Panelu, zawsze czyjeś: `panel_facility()` mówi,
--     czyje. Widzi jedną Strzelnicę. Konto bez powiązania nie widzi żadnej,
--     bo puste `panel_facility()` czyni każdy taki warunek fałszem.
--
-- Po tej migracji polityki na przynależność do Strzelnicy mają wszystkie tabele
-- domenowe poza trzema, i przy każdej z tych trzech jest to decyzja, nie luka:
--
--   * `bookings` — Panel czyta ją widokiem `panel_bookings`, bo polityka mówi
--     o wierszach, a o kolumnach nie mówi nic, i tabela niesie dwa tokeny
--     Osoby rezerwującej (ADR 0008). Warunek na Strzelnicę stoi tam, w widoku.
--   * `mail_outbox` — nie czyta jej nikt poza rolą serwisową, ani Widget, ani
--     Panel, więc polityka byłaby drzwiami w ścianie bez przejścia.
--   * `panel_users` — jej polityka pyta o konto (`user_id = auth.uid()`), nie
--     o Strzelnicę, bo ta tabela jest **źródłem** odpowiedzi na „czyja to
--     Strzelnica"; warunek z `panel_facility()` pytałby sam siebie.
--
-- Dwie pierwsze tracą niżej prawo odczytu dla obu publicznych ról, więc ich
-- granica jest mocniejsza od polityki: nie ma czym ich zapytać. Trzeciej
-- zostaje jeden wiersz — własny.
--
-- Zobacz ADR 0009.

-- Polityki oferty przestają dotyczyć zalogowanych. `alter policy` zamiast
-- przepisania: zmienia się adresat, a nie treść — warunek `using (true)`
-- pozostaje tym, czym był, i dla klucza anonimowego znaczy dokładnie to samo.
alter policy "Dane Strzelnicy są publiczne do odczytu" on public.facilities to anon;
alter policy "Osie są publiczne do odczytu" on public.lanes to anon;
alter policy "Rozkład Bloków jest publiczny do odczytu" on public.block_schedules to anon;
alter policy "Godziny otwarcia są publiczne do odczytu" on public.opening_hours to anon;
alter policy "Wyjątki kalendarzowe są publiczne do odczytu" on public.calendar_exceptions to anon;
alter policy "Katalog Typów broni jest publiczny do odczytu" on public.weapon_types to anon;
alter policy "Katalog Rodzajów amunicji jest publiczny do odczytu"
  on public.ammunition_kinds to anon;

-- Ta sama oferta dla konta Panelu, zawężona do jego Strzelnicy. Warunek jest
-- jeden i ten sam co przy Wypożyczeniach, Zapotrzebowaniu i w widoku
-- `panel_bookings` — jedna funkcja odpowiada na pytanie „czyj jest ten
-- wiersz", więc poprawka trafia w jedno miejsce, a nie w każdą politykę
-- osobno. Rozjazd między nimi znaczyłby dane jednej Strzelnicy na ekranie
-- drugiej.
--
-- `(select public.panel_facility())` zamiast wywołania wprost: tak zapisane
-- staje się podplanem liczonym raz na zapytanie, a nie raz na wiersz. Ta sama
-- sztuczka, co przy `(select auth.uid())` w politykach `panel_users`.
create policy "Użytkownik panelu widzi własną Strzelnicę"
  on public.facilities for select
  to authenticated
  using (id = (select public.panel_facility()));

-- Nazwy w formie „widzi swoje X", a nie „widzi X swojej Strzelnicy" jak dwie
-- polityki z migracji Panelu: identyfikator w Postgresie ma 63 bajty, polski
-- ogonek zajmuje dwa, a przy dłuższych nazwach domenowych ta druga forma się
-- nie mieści i Postgres ucina ją w połowie słowa. Tam nazwy są krótkie
-- (Wypożyczenia, Zapotrzebowanie) i forma się zmieściła. Jeden schemat dla
-- wszystkich siedmiu czyta się lepiej niż dwa dobierane po długości słowa.
create policy "Użytkownik panelu widzi swoje Osie"
  on public.lanes for select
  to authenticated
  using (facility_id = (select public.panel_facility()));

create policy "Użytkownik panelu widzi swój rozkład Bloków"
  on public.block_schedules for select
  to authenticated
  using (facility_id = (select public.panel_facility()));

create policy "Użytkownik panelu widzi swoje godziny otwarcia"
  on public.opening_hours for select
  to authenticated
  using (facility_id = (select public.panel_facility()));

create policy "Użytkownik panelu widzi swoje wyjątki kalendarzowe"
  on public.calendar_exceptions for select
  to authenticated
  using (facility_id = (select public.panel_facility()));

create policy "Użytkownik panelu widzi swój katalog Typów broni"
  on public.weapon_types for select
  to authenticated
  using (facility_id = (select public.panel_facility()));

create policy "Użytkownik panelu widzi swój katalog Rodzajów amunicji"
  on public.ammunition_kinds for select
  to authenticated
  using (facility_id = (select public.panel_facility()));


-- Uprawnienia: zapisu nie ma nigdzie, a z odczytu wypadają trzy grupy relacji.
--
-- RLS filtruje wiersze i robi to dobrze, ale nie jest całą ochroną — i dwie
-- rzeczy wymykają się jej z definicji:
--
--   * `truncate` **nie podlega** politykom RLS. Sprawdza samo uprawnienie,
--     a Supabase nadaje je każdej nowej relacji w `public` razem z każdym
--     innym prawem, więc klucz anonimowy — ten z kodu Widgetu w każdej
--     przeglądarce świata — miał do tej pory prawo opróżnić każdą tabelę
--     domenową do zera. PostgREST takiego żądania nie umie złożyć, ale to
--     jest własność narzędzia stojącego przed bazą, a nie własność bazy,
--     i nie jest tym, na czym stoi zdanie „wyciek klucza nie jest
--     incydentem" (historia 61).
--   * `update` i `delete` bez polityki nie są odmawiane, tylko trafiają w zero
--     wierszy: PostgREST kwituje je kodem 204, jakby się udały. Odmowa jest tu
--     odpowiedzią uczciwszą — i jedyną, która nie zamienia się w zapis, gdy
--     ktoś kiedyś doda politykę zapisu szerszą, niż zamierzał.
--
-- Prawa zapisu schodzą więc obu publicznym rolom ze wszystkich relacji naraz,
-- a nie tabela po tabeli: wypisana lista tabel rozjechałaby się ze schematem
-- przy pierwszej dołożonej. Rola serwisowa (Edge Functions) i `postgres`
-- zostają nietknięte — zapis idzie przez nie, zgodnie z ADR 0003.
revoke insert, update, delete, truncate, references, trigger, maintain
  on all tables in schema public from anon, authenticated;

-- Domyślne prawa dla relacji, których jeszcze nie ma — i tu schodzą wszystkie,
-- razem z odczytem. Bez tego zdania każda przyszła tabela wstaje z kompletem
-- praw dla obu publicznych ról i cała praca powyżej dotyczy wyłącznie dnia
-- dzisiejszego. Relacje istniejące zostają przy odczytach rozważonych jedna po
-- drugiej niżej; nowa startuje zamknięta, więc jej wystawienie wymaga
-- świadomego zdania w SQL-u — ta sama reguła, co przy `grant select (…)` na
-- `facilities` w migracji powiadomień, tylko o szczebel wyżej.
--
-- Domyślne prawa są własnością roli tworzącej obiekt, a migracje jadą jako
-- `postgres` — więc to jego domyślne prawa tu zmieniamy i tylko jego. Relacja
-- założona z pulpitu Supabase powstaje jako `supabase_admin` i idzie jego
-- domyślnymi prawami, których ta migracja nie dosięga.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

-- Odczyt, wyjątek pierwszy: Rezerwacje i poczta. Obie tabele niosą dane
-- osobowe, a poczta dodatkowo treść linków — nie ma w nich ani jednej kolumny,
-- którą wolno pokazać komukolwiek poza rolą serwisową. RLS bez polityk oddaje
-- z nich zero wierszy i tak, ale prawo odczytu, którego nikt nie używa, jest
-- prawem, które kiedyś ktoś odziedziczy razem z pierwszą polityką. Panel czyta
-- Rezerwacje widokiem `panel_bookings` (ADR 0008), a poczty nie czyta wcale.
revoke select on public.bookings, public.mail_outbox from anon, authenticated;

-- Wyjątek drugi: pozycje Rezerwacji i konta Panelu. Nie są ofertą, więc klucz
-- anonimowy nie ma po co ich czytać — a że mają polityki wyłącznie dla
-- zalogowanych, to prawo i tak nie otwierało mu ani jednego wiersza.
revoke select on
  public.weapon_rentals,
  public.ammunition_demands,
  public.panel_users
from anon;

-- Wyjątek trzeci: widoki zajętości. Czytają `bookings` prawami właściciela,
-- więc nie dotyczy ich ani RLS tamtej tabeli, ani jedna polityka z tej
-- migracji: wystawiają zajętość **wszystkich** Strzelnic, bez danych osobowych.
-- Dla klucza anonimowego jest to w porządku i po to powstały — kalendarz
-- Widgetu liczy z nich wolne Bloki. Dla konta Panelu nie jest: zajętość obcej
-- Osi jest daną obcej Strzelnicy, a widok podałby ją obok wszystkich polityk
-- wyżej. Panel jej nie czyta, więc prawo znika.
--
-- I tu jest cała różnica między tym widokiem a tabelą oferty, która prawo
-- zachowuje: tabela pod RLS oddaje zalogowanemu **jedną** Strzelnicę — czyli
-- dokładnie to, o co prosi ta migracja — a widok oddałby wszystkie. Prawo do
-- godzin otwarcia czy rozkładu Bloków zostaje więc konta Panelu, choć żaden
-- dzisiejszy ekran ich nie czyta: przyjdą po nie ekrany konfiguracji, a do tego
-- czasu prawo nie otwiera niczego obcego.
revoke select on public.lane_occupancy, public.weapon_occupancy from authenticated;


-- Dwie polityki z migracji Panelu wołają `panel_facility()` wprost — powstały,
-- zanim reguła wyżej postawiła nawias. Idą tą samą drogą, i to one najbardziej:
-- `weapon_rentals` i `ammunition_demands` są najliczniejszymi tabelami
-- potomnymi, więc różnica między „raz na zapytanie" i „raz na wiersz" jest tam
-- różnicą, którą widać. Warunek bez zmian; zmienia się tylko sposób wyliczenia.
alter policy "Użytkownik panelu widzi Wypożyczenia swojej Strzelnicy"
  on public.weapon_rentals
  using (facility_id = (select public.panel_facility()));

alter policy "Użytkownik panelu widzi Zapotrzebowanie swojej Strzelnicy"
  on public.ammunition_demands
  using (facility_id = (select public.panel_facility()));
