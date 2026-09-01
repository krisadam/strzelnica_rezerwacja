-- Zapotrzebowanie na amunicję. Spec, historie 18 i 19: Osoba rezerwująca
-- podaje rodzaj i liczbę sztuk, żeby Strzelnica przygotowała amunicję przed
-- jej przyjazdem — albo nie podaje nic i przyjeżdża z własną.
--
-- Siostrzane wobec Wypożyczenia kształtem — katalog Strzelnicy i pozycja
-- Rezerwacji „coś × liczba sztuk" — i celowo różne wszystkim pozostałym.
-- Rodzaj amunicji nie ma puli, bo amunicja nie wraca do Strzelnicy: schodzi
-- głównie ze sprzedaży na miejscu, poza tym systemem, więc utrzymywany tutaj
-- stan magazynowy byłby trwale nieprawdziwy (ADR 0004). Bez puli nie ma czego
-- egzekwować: Zapotrzebowanie nigdy nie odbiera nikomu terminu.

create table public.ammunition_kinds (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (facility_id, name),
  -- Cel złożonego klucza obcego z `ammunition_demands`; sam identyfikator
  -- Rodzaju nie niesie Strzelnicy, do której należy.
  unique (id, facility_id)
);

-- Brak kolumny z pulą jest tu treścią, a nie przeoczeniem: gdyby kiedyś
-- doszła, przestałaby obowiązywać ADR 0004 — i to ona jest do zmiany
-- najpierw. Cena za sztukę dojdzie wraz z Kwotą do zapłaty (ticket #9).
comment on table public.ammunition_kinds is
  'Rodzaj amunicji — pozycja katalogu Strzelnicy. Bez puli: ADR 0004.';

alter table public.ammunition_kinds enable row level security;

-- Katalog jest ofertą, więc czyta go każdy. Inaczej niż przy Typach broni,
-- odczyt niczego tu nie przemilcza: nie ma liczby sztuk, którą trzeba by
-- dopiero pomniejszyć o cudze Rezerwacje.
create policy "Katalog Rodzajów amunicji jest publiczny do odczytu"
  on public.ammunition_kinds for select
  to anon, authenticated
  using (true);

create table public.ammunition_demands (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  booking_id uuid not null,
  ammunition_kind_id uuid not null,
  -- Liczba sztuk tego Rodzaju w tej Rezerwacji. Bez górnego ograniczenia:
  -- system nie zna stanu magazynowego, więc nie ma czym uzasadnić żadnej
  -- granicy poza tą, którą narzuca sam typ kolumny.
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  -- Jeden Rodzaj to jedna pozycja: dwa wiersze tego samego Rodzaju w jednej
  -- Rezerwacji byłyby dwiema odpowiedziami na pytanie „ile sztuk".
  unique (booking_id, ammunition_kind_id),
  constraint ammunition_demands_booking_fkey
    foreign key (booking_id, facility_id)
    references public.bookings (id, facility_id)
    on delete cascade,
  constraint ammunition_demands_kind_fkey
    foreign key (ammunition_kind_id, facility_id)
    references public.ammunition_kinds (id, facility_id)
    on delete restrict
);

comment on table public.ammunition_demands is
  'Zapotrzebowanie — pozycja Rezerwacji: Rodzaj amunicji razy liczba sztuk.';

create index ammunition_demands_kind_idx on public.ammunition_demands (ammunition_kind_id);

-- Zapis idzie wyłącznie przez Edge Function (ADR 0003), tak samo jak sama
-- Rezerwacja — więc i tutaj nie ma żadnej polityki.
--
-- I na tym koniec: nie ma widoku `ammunition_occupancy` siostrzanego wobec
-- `weapon_occupancy`. Tamten istnieje po to, żeby kalendarz policzył, ile
-- sztuk zostało — a tutaj nie zostaje nic do policzenia. Widok wystawiałby
-- cudze zamówienia bez żadnego pożytku dla dostępności.
alter table public.ammunition_demands enable row level security;
