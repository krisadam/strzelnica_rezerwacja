-- Jedna Strzelnica do pracy lokalnej: dwie Osie, tygodniowy rozkład Bloków,
-- godziny otwarcia i jeden wyjątek kalendarzowy. Rozkład jest tygodniowy,
-- więc pokrywa 30 dni w przód i każde kolejne — bez przepisywania seeda.
-- Katalogi broni, cennik i Rezerwacje dochodzą w kolejnych ticketach.

insert into public.facilities (id, slug, name)
values (
  '00000000-0000-0000-0000-000000000001',
  'strzelnica-demo',
  'Strzelnica Demo'
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
