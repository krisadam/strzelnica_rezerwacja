-- Rezerwacja: zajęcie jednej Osi na określony czas przez jedną grupę.
-- Zobacz ADR 0003 — zapis idzie wyłącznie przez Edge Function, więc ta tabela
-- nie dostaje żadnej polityki RLS. Klucz anonimowy nie zapisze do niej niczego
-- i nie odczyta z niej niczego; do publicznego odczytu jest widok niżej.
--
-- Czas Rezerwacji trzymany jest jako moment w UTC, a nie jako minuta rozkładu:
-- rozkład mówi, co Strzelnica wystawia w tygodniowym rytmie, a Rezerwacja —
-- co komu sprzedano w konkretnej dobie. Przeliczenie minuty na moment należy
-- do `packages/shared`, gdzie zna się strefę Strzelnicy i reguły czasu letniego.

-- Pełny cykl życia Rezerwacji ze specyfikacji. Ten ticket tworzy wyłącznie
-- Rezerwacje potwierdzone; „oczekująca" i „wygasła" zaczną powstawać wraz
-- z potwierdzeniem adresu (ticket #10), a dwa rodzaje odwołania wraz
-- z anulowaniem (tickety #12 i #15). Wartości są tutaj od początku, bo od
-- kompletu zależy to, które Rezerwacje trzymają Oś — a tego nie chcemy
-- przepisywać przy każdym z tych ticketów.
create type public.booking_status as enum (
  'oczekujaca',
  'potwierdzona',
  'anulowana-przez-klienta',
  'odwolana-przez-strzelnice',
  'wygasla'
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  lane_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null,
  -- Uczestnicy znani wyłącznie z liczby; system nie zna ich tożsamości.
  participants smallint not null check (participants > 0),
  -- Osoba rezerwująca nie ma konta — identyfikuje ją adres e-mail.
  contact_name text not null check (length(btrim(contact_name)) > 0),
  contact_email text not null check (length(btrim(contact_email)) > 0),
  contact_phone text not null check (length(btrim(contact_phone)) > 0),
  -- Moment akceptacji regulaminu i polityki prywatności Strzelnicy. Wartość
  -- logiczna nic by nie wnosiła: Rezerwacja bez akceptacji nie powstaje.
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Oś i Strzelnica muszą się zgadzać, tak samo jak w rozkładzie Bloków.
  constraint bookings_lane_fkey
    foreign key (lane_id, facility_id)
    references public.lanes (id, facility_id)
    on delete cascade
);

comment on table public.bookings is
  'Rezerwacja — zajęcie jednej Osi na określony czas przez jedną grupę.';

-- Wyłączność Osi jako własność schematu, nie uprzejmość kodu. Dwa zgłoszenia
-- na ten sam Blok w tej samej chwili przechodzą przez tę samą walidację i oba
-- widzą Blok wolny; rozstrzyga dopiero ten zapis — jeden wchodzi, drugi dostaje
-- naruszenie ograniczenia. To jest owa „blokada w jednej transakcji": obietnicy
-- wyłączności nie da się utrzymać sprawdzeniem wykonanym przed zapisem.
--
-- `btree_gist` daje operator `=` dla uuid w indeksie GiST; bez niego nie da się
-- zestawić równości Osi z zachodzeniem zakresów w jednym ograniczeniu.
create extension if not exists btree_gist with schema extensions;

alter table public.bookings
  -- Zakres domknięty od początku, otwarty od końca — tak samo jak `overlaps`
  -- w `packages/shared`. Rezerwacja kończąca się o 12:00 nie koliduje z Blokiem
  -- zaczynającym się o 12:00.
  add constraint bookings_lane_is_exclusive
  exclude using gist (
    lane_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  -- Oś trzymają wyłącznie Rezerwacje żywe. Odwołana zwalnia termin natychmiast.
  where (status in ('oczekujaca', 'potwierdzona'));

create index bookings_facility_starts_idx
  on public.bookings (facility_id, starts_at);

alter table public.bookings enable row level security;

-- Zajętość w postaci pozbawionej danych osobowych: kto i jak licznie, zostaje
-- w tabeli. Widok czyta ją z uprawnieniami właściciela, więc świadomie omija
-- RLS `bookings` — na tym polega jego istnienie. Wystawia dokładnie te cztery
-- kolumny, których potrzebuje kalendarz, i ani jednej więcej.
create view public.lane_occupancy as
  select
    facility_id,
    lane_id,
    starts_at,
    ends_at
  from public.bookings
  where status in ('oczekujaca', 'potwierdzona');

comment on view public.lane_occupancy is
  'Zajętość Osi bez danych osobowych — jedyny publiczny widok Rezerwacji.';

grant select on public.lane_occupancy to anon, authenticated;
