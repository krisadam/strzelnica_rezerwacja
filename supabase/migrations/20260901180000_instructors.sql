-- Pozwolenie na broń i Pula instruktorów. Spec, historie 8, 12, 13, 14 i 54:
-- Osoba rezerwująca deklaruje Pozwolenie, jego brak wymusza Instruktora,
-- a Instruktorów jest tylu, ilu Strzelnica jest w stanie zapewnić naraz.

-- Pula liczona po całej Strzelnicy, nie po Osi: Instruktor nadzoruje ludzi,
-- a nie stanowisko, więc Rezerwacje z różnych Osi konkurują o tę samą Pulę.
-- Zero nie jest błędem konfiguracji, tylko Strzelnicą, która nie zapewnia
-- nadzoru — u niej rezerwuje wyłącznie ktoś z Pozwoleniem.
alter table public.facilities
  add column instructor_pool smallint not null default 1
    check (instructor_pool >= 0);

comment on column public.facilities.instructor_pool is
  'Pula instruktorów: ilu Instruktorów Strzelnica zapewnia w tym samym czasie.';

-- Deklaracja Pozwolenia i obecność Instruktora to dwie różne rzeczy, więc są
-- dwiema kolumnami. Z jednej nie da się odczytać drugiej: Osoba rezerwująca
-- z Pozwoleniem bywa z Instruktorem i bez, a Kwota do zapłaty (ticket #7)
-- pyta o obecność, nie o powód.
--
-- Wartości domyślne opisują Rezerwację, która nie zajmuje Puli, i są tu po to,
-- żeby kolumny dało się dołożyć do istniejących wierszy. Zaraz po tym znikają:
-- Edge Function podaje obie wartości wprost, a wpis, który by o nich zapomniał,
-- ma się zatrzymać na braku wartości, a nie po cichu przyjąć „bez Instruktora".
alter table public.bookings
  add column has_permit boolean not null default true,
  add column with_instructor boolean not null default false,
  -- Brak Pozwolenia wymusza obecność Instruktora. To reguła domeny, a nie
  -- limit Strzelnicy, więc obowiązuje także Rezerwację wpisaną ręcznie
  -- w Panelu (ticket #17) — tam wolno naruszyć pojemność, godziny i Pulę,
  -- ale nie wolno zostawić nikogo bez nadzoru wbrew własnej deklaracji.
  add constraint bookings_instructor_supervises_the_unlicensed
    check (has_permit or with_instructor);

alter table public.bookings
  alter column has_permit drop default,
  alter column with_instructor drop default;

comment on column public.bookings.has_permit is
  'Deklaracja Pozwolenia na broń; weryfikowana fizycznie na miejscu.';

comment on column public.bookings.with_instructor is
  'Czy Instruktor jest przy Rezerwacji — wymagany czy zamówiony dobrowolnie.';

-- Zajętość musi powiedzieć nie tylko „Oś jest czyjaś", ale i „Instruktor jest
-- czyjś". Bez tej kolumny kalendarz nie odróżniłby Rezerwacji zajmującej
-- miejsce w Puli od takiej, która go nie zajmuje, i musiałby liczyć Pulę
-- z tabeli `bookings` — czyli z danych, których klucz anonimowy nie czyta.
-- Sama wartość logiczna nie mówi o nikim z nazwiska.
create or replace view public.lane_occupancy as
  select
    facility_id,
    lane_id,
    starts_at,
    ends_at,
    with_instructor
  from public.bookings
  where status in ('oczekujaca', 'potwierdzona');
