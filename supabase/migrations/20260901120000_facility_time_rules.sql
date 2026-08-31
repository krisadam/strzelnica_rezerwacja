-- Reguły czasowe Strzelnicy: jak daleko w przód wolno rezerwować, jak blisko
-- terminu jeszcze wolno i do kiedy Osoba rezerwująca może anulować sama.
-- Spec, historia 55: „ustawić horyzont rezerwacji, minimalne wyprzedzenie
-- i okno anulowania, żeby dopasować reguły do swojej praktyki".
--
-- Wartości domyślne opisują typową Strzelnicę, żeby nowo założona (ticket #24)
-- była od razu spójna. Jednostki są różne, bo różna jest skala każdej reguły:
-- horyzont mierzy się w dniach kalendarza, wyprzedzenie w minutach — tych
-- samych, w których zapisany jest rozkład Bloków — a okno anulowania
-- w godzinach, bo tak mówi o nim regulamin.

alter table public.facilities
  add column booking_horizon_days smallint not null default 30
    check (booking_horizon_days >= 0),
  add column min_lead_minutes smallint not null default 120
    check (min_lead_minutes >= 0),
  add column cancellation_window_hours smallint not null default 24
    check (cancellation_window_hours >= 0);

-- Odmierzane od dzisiaj: 0 znaczy „wyłącznie dzisiaj", 30 sięga trzydziestego
-- dnia po dzisiejszym. Zero nie jest błędem konfiguracji, tylko Strzelnicą
-- przyjmującą z dnia na dzień.
comment on column public.facilities.booking_horizon_days is
  'Horyzont rezerwacji: ile dni po dzisiejszym dniu Strzelnicy sięga rezerwacja.';

comment on column public.facilities.min_lead_minutes is
  'Minimalne wyprzedzenie w minutach między złożeniem Rezerwacji a początkiem Bloku.';

comment on column public.facilities.cancellation_window_hours is
  'Okno anulowania w godzinach przed terminem, w którym klient anuluje sam.';
