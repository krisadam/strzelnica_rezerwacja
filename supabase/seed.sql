-- Jedna Strzelnica do pracy lokalnej: dwie Osie, tygodniowy rozkład Bloków,
-- godziny otwarcia i jeden wyjątek kalendarzowy. Rozkład jest tygodniowy,
-- więc pokrywa 30 dni w przód i każde kolejne — bez przepisywania seeda.
-- Katalogi broni, cennik i Rezerwacje dochodzą w kolejnych ticketach.

-- Reguły czasowe wypisane wprost, choć równe wartościom domyślnym: grafik
-- demo ma pokazywać, co robi horyzont i wyprzedzenie, więc muszą być widoczne
-- w danych, a nie tylko w schemacie.
-- Dozwolona domena osadzenia wskazuje stronę demonstracyjną z `apps/widget/demo`,
-- podawaną lokalnie na porcie 5175. Testy przeglądarkowe podają tę samą stronę
-- także spod portu 5176 — spoza listy — żeby sprawdzić, że przeglądarka blokuje
-- osadzenie na obcej domenie.
--
-- Pula instruktorów wynosi jeden, żeby grafik demo pokazywał także jej
-- wyczerpanie: Rezerwacja niżej zabiera jedynego Instruktora, więc ten sam
-- czas na drugiej Osi zostaje wolny dla Osoby rezerwującej z Pozwoleniem
-- i niedostępny dla tej bez.
insert into public.facilities (
  id, slug, name, booking_horizon_days, min_lead_minutes, cancellation_window_hours,
  allowed_origins, instructor_pool
)
values (
  '00000000-0000-0000-0000-000000000001',
  'strzelnica-demo',
  'Strzelnica Demo',
  30,
  120,
  24,
  '{http://localhost:5175}',
  1
)
on conflict (id) do nothing;

insert into public.lanes (id, facility_id, name, capacity)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000001',
    'Oś pistoletowa nr 1',
    4
  ),
  (
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-000000000001',
    'Oś karabinowa nr 2',
    2
  )
on conflict (id) do nothing;

-- Sobota kończy się o 01:00 następnego dnia (1500 minut), żeby zmieścić Blok
-- przecinający granicę doby. Poniedziałek–piątek 10:00–22:00, niedziela
-- 09:00–20:00.
insert into public.opening_hours (facility_id, weekday, opens_minute, closes_minute)
values
  ('00000000-0000-0000-0000-000000000001', 1, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 2, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 3, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 4, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 5, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 6, 540, 1500),
  ('00000000-0000-0000-0000-000000000001', 7, 540, 1200)
on conflict (facility_id, weekday) do nothing;

-- Oś pistoletowa: Bloki dwugodzinne co 150 minut (30 minut przerwy między
-- Rezerwacjami wynika z odstępu w rozkładzie, nie z osobnej reguły).
insert into public.block_schedules (facility_id, lane_id, weekday, start_minute, duration_minutes)
select
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  weekday,
  start_minute,
  120
from generate_series(1, 5) as weekday
cross join unnest(array[600, 750, 900, 1050, 1200]) as start_minute
on conflict (lane_id, weekday, start_minute) do nothing;

insert into public.block_schedules (facility_id, lane_id, weekday, start_minute, duration_minutes)
values
  -- Sobota, w tym Blok 23:00–01:00 przechodzący na niedzielę.
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 540, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 690, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 840, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 990, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 1140, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 1380, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 7, 540, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 7, 690, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 7, 840, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 7, 990, 120)
on conflict (lane_id, weekday, start_minute) do nothing;

-- Oś karabinowa ma własny rytm dnia i w niedzielę nie pracuje wcale — dowód,
-- że rozkład jest własnością Osi, nie Strzelnicy.
insert into public.block_schedules (facility_id, lane_id, weekday, start_minute, duration_minutes)
select
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a2',
  weekday,
  start_minute,
  150
from generate_series(1, 5) as weekday
cross join unnest(array[600, 780, 960, 1140]) as start_minute
on conflict (lane_id, weekday, start_minute) do nothing;

insert into public.block_schedules (facility_id, lane_id, weekday, start_minute, duration_minutes)
select
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a2',
  6,
  start_minute,
  150
from unnest(array[540, 720, 900, 1080]) as start_minute
on conflict (lane_id, weekday, start_minute) do nothing;

-- Dzień zamknięty w zasięgu kalendarza Widgetu, liczony od dnia seeda.
insert into public.calendar_exceptions (facility_id, closed_on, reason)
values (
  '00000000-0000-0000-0000-000000000001',
  current_date + 10,
  'Zawody klubowe'
)
on conflict (facility_id, closed_on) do nothing;

-- Jedna Rezerwacja, żeby kalendarz demo pokazywał także termin zajęty, a nie
-- wyłącznie wolne. Celuje w pierwszy Blok Osi pistoletowej (10:00, dwie
-- godziny) najbliższego poniedziałku oddalonego o co najmniej 14 dni: dzień
-- roboczy ma ten Blok w rozkładzie, a odległość trzyma go z dala od terminów,
-- w które celują testy przeglądarkowe. Moment liczony jest w strefie
-- Strzelnicy, bo rozkład mówi o jej zegarze, a kolumna trzyma UTC.
-- Rezerwujący nie ma Pozwolenia, więc bierze Instruktora — i tym samym
-- jedyne miejsce w Puli.
insert into public.bookings (
  id, facility_id, lane_id, starts_at, ends_at, status, participants,
  contact_name, contact_email, contact_phone, has_permit, with_instructor
)
select
  '00000000-0000-0000-0000-0000000000b1',
  f.id,
  '00000000-0000-0000-0000-0000000000a1',
  poczatek,
  poczatek + interval '120 minutes',
  'potwierdzona',
  2,
  'Jan Przykładowy',
  'jan@example.pl',
  '600100200',
  false,
  true
from public.facilities f
cross join lateral (
  select (
    (current_date + 14 + ((8 - extract(isodow from current_date + 14)::int) % 7))::timestamp
      + interval '600 minutes'
  ) at time zone f.timezone as poczatek
) t
where f.id = '00000000-0000-0000-0000-000000000001'
on conflict (id) do nothing;
