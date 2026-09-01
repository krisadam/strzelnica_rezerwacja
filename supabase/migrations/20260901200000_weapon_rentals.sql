-- Wypożyczenie broni. Spec, historie 15, 16, 17 i 19: Osoba rezerwująca wybiera
-- z katalogu Typy broni i liczbę sztuk każdego, wolno jej wziąć kilka różnych
-- Typów naraz i wolno jej nie brać nic.
--
-- Pula Typu broni liczy się po całej Strzelnicy i po sztukach — inaczej niż
-- wyłączność Osi, która rozstrzyga się przez „zajęte / wolne". Dwie Rezerwacje
-- nakładające się w czasie dzielą jeden katalog, więc suma sztuk jednego Typu
-- w nich obu nie może przekroczyć Puli.

create table public.weapon_types (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Pula: ile sztuk tego Typu Strzelnica ma do wypożyczenia. Zero znaczy Typ
  -- w katalogu, którego nie ma czym obsłużyć — a nie Typ usunięty. Cena za
  -- sztukę dojdzie wraz z Kwotą do zapłaty (ticket #9).
  pool smallint not null check (pool >= 0),
  created_at timestamptz not null default now(),
  unique (facility_id, name),
  -- Cel złożonego klucza obcego z `weapon_rentals`; sam identyfikator Typu nie
  -- niesie Strzelnicy, do której należy.
  unique (id, facility_id)
);

comment on table public.weapon_types is
  'Typ broni — pozycja katalogu Strzelnicy wraz z pulą sztuk do wypożyczenia.';

alter table public.weapon_types enable row level security;

-- Katalog jest ofertą, więc czyta go każdy. Sama Pula nie mówi, ile sztuk
-- zostało w konkretnym terminie — to wylicza się dopiero z zajętości niżej.
create policy "Katalog Typów broni jest publiczny do odczytu"
  on public.weapon_types for select
  to anon, authenticated
  using (true);

-- Cel złożonego klucza obcego z `weapon_rentals`: pozycja Rezerwacji ma
-- wskazywać Typ broni tej samej Strzelnicy, co Rezerwacja.
alter table public.bookings add constraint bookings_id_facility_key unique (id, facility_id);

create table public.weapon_rentals (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  booking_id uuid not null,
  weapon_type_id uuid not null,
  -- Liczba sztuk tego Typu w tej Rezerwacji. Pozycja na zero sztuk nie jest
  -- Wypożyczeniem — Osoba rezerwująca, która nic nie bierze, nie ma pozycji.
  quantity smallint not null check (quantity > 0),
  created_at timestamptz not null default now(),
  -- Jeden Typ to jedna pozycja: dwa wiersze tego samego Typu w jednej
  -- Rezerwacji byłyby dwiema odpowiedziami na pytanie „ile sztuk".
  unique (booking_id, weapon_type_id),
  constraint weapon_rentals_booking_fkey
    foreign key (booking_id, facility_id)
    references public.bookings (id, facility_id)
    on delete cascade,
  constraint weapon_rentals_weapon_type_fkey
    foreign key (weapon_type_id, facility_id)
    references public.weapon_types (id, facility_id)
    on delete restrict
);

comment on table public.weapon_rentals is
  'Wypożyczenie — pozycja Rezerwacji: Typ broni razy liczba sztuk.';

create index weapon_rentals_type_idx on public.weapon_rentals (weapon_type_id);

-- Zapis idzie wyłącznie przez Edge Function (ADR 0003), tak samo jak sama
-- Rezerwacja — więc i tutaj nie ma żadnej polityki. Publicznym oknem jest widok.
alter table public.weapon_rentals enable row level security;

-- Zajętość sztuk w postaci pozbawionej danych osobowych, siostrzana wobec
-- `lane_occupancy`: mówi, ile sztuk którego Typu jest czyichś i kiedy, nigdy
-- czyich. Bez niej kalendarz musiałby liczyć Pulę z `weapon_rentals` — czyli
-- z danych, których klucz anonimowy nie czyta.
create view public.weapon_occupancy as
  select
    b.facility_id,
    r.weapon_type_id,
    r.quantity,
    b.starts_at,
    b.ends_at
  from public.weapon_rentals r
  join public.bookings b on b.id = r.booking_id
  where b.status in ('oczekujaca', 'potwierdzona');

comment on view public.weapon_occupancy is
  'Zajętość sztuk broni bez danych osobowych — publiczne okno na Wypożyczenia.';

grant select on public.weapon_occupancy to anon, authenticated;
