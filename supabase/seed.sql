-- Jedna Strzelnica do pracy lokalnej. Osie, rozkład Bloków i katalogi
-- dochodzą w kolejnych ticketach.

insert into public.facilities (id, slug, name)
values (
  '00000000-0000-0000-0000-000000000001',
  'strzelnica-demo',
  'Strzelnica Demo'
)
on conflict (id) do nothing;
