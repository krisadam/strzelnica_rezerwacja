-- Panel: kto ma do niego dostęp i co spod niego widać.
--
-- Do tej pory cała baza znała dwie role: klucz anonimowy Widgetu, który czyta
-- ofertę i zajętość bez danych osobowych, oraz rolę serwisową Edge Functions.
-- Panel jest trzecim czytelnikiem i pierwszym, który **ma** widzieć Rezerwacje
-- z nazwiskiem i telefonem — ale wyłącznie swojej Strzelnicy.
--
-- Ról w Panelu nie ma i nie będzie w tej fazie (spec, „Out of Scope": „Podział
-- uprawnień w Panelu na role"). Wszyscy Użytkownicy panelu danej Strzelnicy
-- mają identyczne uprawnienia, więc powiązanie konta ze Strzelnicą jest całą
-- treścią tej tabeli — kolumna z rolą byłaby polem, którego nikt nie czyta.

create table public.panel_users (
  -- Konto Supabase Auth jest tożsamością Użytkownika panelu, a nie jej kopią:
  -- klucz główny wskazuje `auth.users` wprost. Skasowane konto zabiera ze sobą
  -- powiązanie, bo powiązanie bez konta nie jest niczyim dostępem.
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Jedna Strzelnica na konto. Obsługa dwóch obiektów zakłada dwa konta —
  -- przełącznik Strzelnicy w Panelu byłby ekranem, którego spec nie ma,
  -- a kolumna wielowartościowa obietnicą, której RLS niżej by nie dotrzymała.
  facility_id uuid not null references public.facilities (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.panel_users is
  'Użytkownik panelu — powiązanie konta Supabase Auth z jedną Strzelnicą.';

create index panel_users_facility_idx on public.panel_users (facility_id);

alter table public.panel_users enable row level security;

-- Własny wiersz i tylko własny: stąd Panel dowiaduje się, czyj jest. Lista
-- kont obcej Strzelnicy nie jest odpowiedzią na żadne pytanie, które Panel
-- zadaje, a jest listą adresów e-mail jej pracowników.
create policy "Użytkownik panelu widzi własne powiązanie"
  on public.panel_users for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Strzelnica zalogowanego Użytkownika panelu — jedna kopia pytania „czyj jest
-- ten wiersz", zadawanego dalej przez każdy widok i każdą politykę Panelu.
-- Wypisane trzy razy rozjechałyby się przy pierwszej poprawce, a rozjazd tutaj
-- znaczyłby dane jednej Strzelnicy na ekranie drugiej.
--
-- `security definer`, bo pytana jest tabela, którą RLS zasłania samą sobie:
-- polityka wyżej czyta `panel_users`, więc gdyby ta funkcja szła prawami
-- wołającego, sprawdzenie polityki wołałoby politykę.
--
-- `stable`, nie `immutable`: odpowiedź zależy od tego, kto pyta. Puste znaczy
-- „nikt zalogowany" albo „konto bez Strzelnicy" — i w obu razach każdy warunek
-- z jej udziałem jest fałszem, więc Osoba niezalogowana nie widzi niczego.
create function public.panel_facility()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.facility_id
    from public.panel_users u
   where u.user_id = auth.uid();
$$;

comment on function public.panel_facility is
  'Strzelnica zalogowanego Użytkownika panelu; puste znaczy brak dostępu do Panelu.';

revoke execute on function public.panel_facility from public, anon;
grant execute on function public.panel_facility to authenticated;

-- Rezerwacje Strzelnicy w kształcie, w jakim czyta je Panel.
--
-- Widok, a nie polityka na `bookings` — z tego samego powodu, dla którego
-- widokiem jest `lane_occupancy`: polityka RLS mówi o wierszach i o kolumnach
-- nie mówi nic, a `bookings` niesie dwa tokeny. Token potwierdzający
-- i token linku do zarządzania są **upoważnieniem Osoby rezerwującej**, nie
-- daną o Rezerwacji: obsługa, która je widzi, może wejść w cudzy link
-- i anulować Rezerwację cudzą ręką. Polityka wpuszczająca Panel do tabeli
-- wystawiłaby oba, a każda przyszła kolumna z tokenem wystawiłaby się sama.
--
-- Tędy jest odwrotnie: kolumna dołożona do `bookings` nie pojawia się tutaj,
-- dopóki ktoś jej świadomie nie dopisze — tak samo jak przy `grant select (…)`
-- na `facilities`.
create view public.panel_bookings as
  select
    b.id,
    b.facility_id,
    b.lane_id,
    b.starts_at,
    b.ends_at,
    b.status,
    -- Czy Rezerwacja trzyma jeszcze termin. Liczone tą samą funkcją, co
    -- w widokach zajętości, a nie własną listą stanów: Rezerwacja oczekująca
    -- po swoim czasie zwolniła Oś co do sekundy i kalendarz Panelu ma pokazywać
    -- to samo, co kalendarz Widgetu. Zobacz ADR 0006.
    public.booking_holds_term(b.status, b.expires_at) as holds_term,
    b.participants,
    b.has_permit,
    b.with_instructor,
    b.contact_name,
    b.contact_email,
    b.contact_phone,
    -- Kwota zamrożona w chwili złożenia. Bez stawek, z których się policzyła:
    -- Panel pokazuje, ile klient zapłaci, a nie rozbicie rachunku — a kolumna,
    -- której żaden ekran nie czyta, jest tu wyłomem w regule, dla której ten
    -- widok w ogóle powstał. Dojdą razem z ekranem, który je pokaże.
    b.amount_gr
  from public.bookings b
  where b.facility_id = public.panel_facility();

comment on view public.panel_bookings is
  'Rezerwacje Strzelnicy zalogowanego Użytkownika panelu, bez tokenów Osoby rezerwującej.';

-- Widok czyta `bookings` z uprawnieniami właściciela, więc świadomie omija jej
-- RLS — na tym polega jego istnienie, tak samo jak przy `lane_occupancy`.
-- Wielodostępności pilnuje wtedy jego własny warunek: bez zalogowanego
-- Użytkownika panelu `panel_facility()` jest puste, a warunek fałszywy dla
-- każdego wiersza. Prawa odczytu nadaje mu ostatnie zdanie tej migracji, razem
-- z odebraniem tych, które Supabase nadaje każdej nowej relacji sam.

-- Pozycje Rezerwacji idą polityką, a nie widokiem: nie niosą ani jednej
-- kolumny, której obsługa nie ma prawa zobaczyć, więc zasłanianie ich kolumnami
-- byłoby ceremonią bez treści. Warunek ten sam — Strzelnica Użytkownika panelu.
create policy "Użytkownik panelu widzi Wypożyczenia swojej Strzelnicy"
  on public.weapon_rentals for select
  to authenticated
  using (facility_id = public.panel_facility());

create policy "Użytkownik panelu widzi Zapotrzebowanie swojej Strzelnicy"
  on public.ammunition_demands for select
  to authenticated
  using (facility_id = public.panel_facility());


-- Widok jest oknem, a okno się nie otwiera. Prosty widok nad jedną tabelą jest
-- w Postgresie **zapisywalny sam z siebie**, a Supabase nadaje domyślnie
-- komplet praw na każdą nową relację w `public` — więc `grant select` wyżej
-- niczego nie zawęża, dopóki nie zejdzie to, co przyszło samo. Bez tego zdania
-- Użytkownik panelu pisze przez `panel_bookings` wprost do `bookings`,
-- omijając Edge Functions (ADR 0003) razem z całą walidacją i wyłącznością Osi.
--
-- To samo dotyczy widoków zajętości, i tam jest gorzej: prawa ma **klucz
-- anonimowy**, ten z kodu Widgetu w każdej przeglądarce świata, a `delete`
-- przez `lane_occupancy` kasuje wiersz `bookings`. Odczyt wraca niżej wypisany
-- wprost — dla anonimowego wyłącznie na zajętość, nigdy na Rezerwacje Panelu.
revoke all on public.lane_occupancy from anon, authenticated;
revoke all on public.weapon_occupancy from anon, authenticated;
revoke all on public.panel_bookings from anon, authenticated;

grant select on public.lane_occupancy to anon, authenticated;
grant select on public.weapon_occupancy to anon, authenticated;
grant select on public.panel_bookings to authenticated;
