-- Strzelnica: korzeń wielodostępności. Każda tabela domenowa dodana później
-- niesie facility_id wskazujący tutaj. Zobacz ADR 0001.

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- Strefa Strzelnicy jest jej polem konfiguracyjnym, nie stałą w kodzie.
  timezone text not null default 'Europe/Warsaw',
  created_at timestamptz not null default now()
);

comment on table public.facilities is
  'Strzelnica — pojedynczy obiekt strzelecki z własną konfiguracją.';

alter table public.facilities enable row level security;
