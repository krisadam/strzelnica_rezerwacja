-- Oś, Rozkład Bloków, godziny otwarcia i wyjątki kalendarzowe — wszystko,
-- z czego wynika grafik, zanim istnieją Rezerwacje. Zobacz ADR 0005: Blok
-- jest jedyną jednostką Rezerwacji i jest wypisywany ręcznie, nie generowany.
--
-- Czas rozkładu to lokalny czas Strzelnicy zapisany jako liczba minut od
-- północy jej dnia. Nie `time`, bo Blok wolno przeciągnąć przez granicę doby
-- (23:00 + 120 minut) — a `time` takiego zakresu nie wyrazi. Przeliczenie
-- minut na moment w UTC należy do `packages/shared`, gdzie zna się strefę
-- Strzelnicy i reguły czasu letniego.
--
-- Dzień tygodnia w konwencji ISO-8601: 1 = poniedziałek, 7 = niedziela.

-- Dane publiczne Strzelnicy czyta Widget anonimowo (spec: „Odczyt danych
-- publicznych — bezpośrednio z klienta przez PostgREST pod kontrolą RLS").
-- Zapis nie ma polityki nigdzie w tej migracji, więc jest niemożliwy dla
-- klucza anonimowego i dla zalogowanego Użytkownika panelu.
create policy "Dane Strzelnicy są publiczne do odczytu"
  on public.facilities for select
  to anon, authenticated
  using (true);

create table public.lanes (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name text not null,
  -- Pojemność: maksymalna liczba Uczestników na Osi jednocześnie. Limit
  -- walidacyjny Rezerwacji, nie zasób sprzedawany osobno.
  capacity smallint not null check (capacity > 0),
  created_at timestamptz not null default now(),
  unique (facility_id, name),
  -- Cel złożonego klucza obcego z `block_schedules`; sam identyfikator Osi nie
  -- niesie Strzelnicy, do której należy.
  unique (id, facility_id)
);

comment on table public.lanes is
  'Oś — wyłączna jednostka rezerwacji wewnątrz Strzelnicy.';

alter table public.lanes enable row level security;

create policy "Osie są publiczne do odczytu"
  on public.lanes for select
  to anon, authenticated
  using (true);

create table public.block_schedules (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  lane_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  -- Początek Bloku w minutach od północy dnia Strzelnicy, na siatce Slotów.
  start_minute smallint not null check (
    start_minute >= 0 and start_minute < 1440 and start_minute % 30 = 0
  ),
  -- Długość Bloku: wielokrotność Slotu. Suma z początkiem może przekroczyć
  -- 1440 — wtedy Blok kończy się po północy.
  duration_minutes smallint not null check (
    duration_minutes > 0 and duration_minutes % 30 = 0
  ),
  created_at timestamptz not null default now(),
  unique (lane_id, weekday, start_minute),
  -- Oś i Strzelnica muszą się zgadzać. Dwa osobne klucze obce przepuściłyby
  -- pozycję rozkładu wskazującą Oś obcej Strzelnicy — dokładnie ten przeciek,
  -- przed którym stawia ADR 0001.
  constraint block_schedules_lane_fkey
    foreign key (lane_id, facility_id)
    references public.lanes (id, facility_id)
    on delete cascade
);

comment on table public.block_schedules is
  'Rozkład Bloków — Oś razy dzień tygodnia razy początek na siatce Slotów.';

alter table public.block_schedules enable row level security;

create policy "Rozkład Bloków jest publiczny do odczytu"
  on public.block_schedules for select
  to anon, authenticated
  using (true);

create index block_schedules_lane_weekday_idx
  on public.block_schedules (lane_id, weekday);

create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens_minute smallint not null check (opens_minute >= 0 and opens_minute < 1440),
  -- Domknięcie po północy zapisuje się jako wartość powyżej 1440, żeby Blok
  -- przecinający granicę doby dało się w ogóle zmieścić w godzinach otwarcia.
  closes_minute smallint not null check (closes_minute <= 2880),
  created_at timestamptz not null default now(),
  check (closes_minute > opens_minute),
  -- Brak wiersza na dany dzień tygodnia znaczy: Strzelnica jest zamknięta.
  unique (facility_id, weekday)
);

comment on table public.opening_hours is
  'Godziny otwarcia Strzelnicy w tygodniowym rytmie; brak wiersza = zamknięte.';

alter table public.opening_hours enable row level security;

create policy "Godziny otwarcia są publiczne do odczytu"
  on public.opening_hours for select
  to anon, authenticated
  using (true);

create table public.calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  -- Data w kalendarzu Strzelnicy, nie moment w czasie.
  closed_on date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (facility_id, closed_on)
);

comment on table public.calendar_exceptions is
  'Wyjątek kalendarzowy — konkretna data, w której Strzelnica jest zamknięta.';

alter table public.calendar_exceptions enable row level security;

create policy "Wyjątki kalendarzowe są publiczne do odczytu"
  on public.calendar_exceptions for select
  to anon, authenticated
  using (true);
