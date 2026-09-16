-- Cennik, Pula instruktorów i reguły czasowe ustawiane przez Panel — ostatnia
-- rzecz, którą Strzelnica dostawała wyłącznie z seeda i z wartości domyślnych
-- migracji.
--
-- Ani jednej kolumny tu nie przybywa i nie jest to przeoczenie: wszystkie
-- sześć wartości Strzelnicy (`instructor_pool`, `participation_rate_gr`,
-- `instructor_rate_gr`, `booking_horizon_days`, `min_lead_minutes`,
-- `cancellation_window_hours`) oraz stawka za Blok na Osi (`block_rate_gr`)
-- stoją w schemacie od tickets #3, #6 i #9 — razem ze swoimi ograniczeniami
-- `>= 0`. Ten ticket dokłada do nich **drogę zapisu**, a nie miejsce na dane:
-- dotąd zmieniało je wyłącznie `supabase db reset`.
--
-- Zapis idzie tą samą drogą, co Oś, rozkład, godziny i katalogi: funkcja
-- bazodanowa z warunkiem `panel_facility_of(p_user_id)`, prawo wykonania
-- wyłącznie dla roli serwisowej i Edge Function jako jedyne przejście
-- z przeglądarki (ADR 0003, ADR 0010).
--
-- Czego tu nie ma: rozstrzygania o Rezerwacjach złożonych wcześniej. Żadna
-- z tych zmian ich nie rusza i nie ma czym — Rezerwacja niesie własną Kwotę
-- wraz ze stawkami, z których się policzyła (migracja `…_pricing`), własny
-- termin i własną obecność Instruktora. Zmniejszona Pula instruktorów zostawia
-- nadzór obiecany wcześniej, a skrócony horyzont nie odbiera nikomu soboty:
-- mówi, na kiedy Strzelnica **przyjmuje**. Przekroczenia Puli **wypisuje**
-- Panel (`instructorOverruns`), zanim cokolwiek pójdzie do bazy, i rozstrzyga
-- je człowiek — tak samo jak przy puli sztuk broni i przy godzinach otwarcia.

-- Stawka za Blok dochodzi do zapisu Osi, zamiast jechać osobną drogą: jest
-- własnością Osi (spec), a Oś opisuje się jednym formularzem. Podpis funkcji
-- zmienia się przez to o jeden parametr, więc stara znika w całości —
-- `create or replace` zostawiłby obok niej przeciążenie, które zapisywałoby Oś
-- po cichu bez ceny.
drop function public.save_lane(uuid, text, smallint, boolean, uuid);

create function public.save_lane(
  p_lane_id uuid,
  p_name text,
  p_capacity smallint,
  p_block_rate_gr integer,
  p_active boolean,
  p_user_id uuid
) returns uuid
-- Ścieżka wyszukiwania przypięta wprost: funkcja woła się rolą serwisową.
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_facility_id uuid;
  v_lane_id uuid;
begin
  v_facility_id := public.panel_facility_of(p_user_id);
  if v_facility_id is null then
    return null;
  end if;

  if p_lane_id is null then
    insert into public.lanes (facility_id, name, capacity, block_rate_gr, active)
    values (v_facility_id, btrim(p_name), p_capacity, p_block_rate_gr, p_active)
    returning id into v_lane_id;
  else
    update public.lanes
       set name = btrim(p_name),
           capacity = p_capacity,
           block_rate_gr = p_block_rate_gr,
           active = p_active
     where id = p_lane_id
       and facility_id = v_facility_id
    returning id into v_lane_id;
  end if;

  return v_lane_id;
end;
$$;

comment on function public.save_lane is
  'Zapis Osi wraz ze stawką za Blok w imieniu konta Panelu; puste znaczy Oś nie tej Strzelnicy.';

revoke execute on function public.save_lane from public, anon, authenticated;

-- Konfiguracja Strzelnicy: stawki wspólne, Pula instruktorów i trzy reguły
-- czasowe. Sześć kolumn jednym zapisem, tak samo jak tydzień godzin otwarcia
-- idzie w całości — i z tego samego powodu: to jeden formularz i jeden
-- przycisk, więc nie ma chwili, w której Strzelnica ma nową Pulę i stary
-- horyzont. Sześć osobnych funkcji byłoby sześcioma drogami do jednego wiersza,
-- każda do zapomnienia przy kolejnym polu.
--
-- Bez `p_facility_id` i bez `insert`: wiersz Strzelnicy istnieje przed tym
-- żądaniem, a o tym, który to wiersz, rozstrzyga numer potwierdzonego konta
-- (ADR 0010) — w żądaniu nie ma więc czego podstawić z palca. Ta sama decyzja,
-- co przy `set_opening_hours`.
--
-- Zakresów wartości ta funkcja nie sprawdza i sprawdzać nie ma: pilnują ich
-- ograniczenia `check (… >= 0)` stojące przy kolumnach od tickets #3, #6 i #9,
-- a czytelne zdanie o liczbie do poprawienia mówi `facilityConfigProblems` —
-- po obu stronach sieci, zanim cokolwiek tu dojdzie.
create function public.set_facility_configuration(
  p_instructor_pool smallint,
  p_participation_rate_gr integer,
  p_instructor_rate_gr integer,
  p_booking_horizon_days smallint,
  p_min_lead_minutes smallint,
  p_cancellation_window_hours smallint,
  p_user_id uuid
) returns boolean
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_facility_id uuid;
begin
  v_facility_id := public.panel_facility_of(p_user_id);
  if v_facility_id is null then
    return null;
  end if;

  update public.facilities
     set instructor_pool = p_instructor_pool,
         participation_rate_gr = p_participation_rate_gr,
         instructor_rate_gr = p_instructor_rate_gr,
         booking_horizon_days = p_booking_horizon_days,
         min_lead_minutes = p_min_lead_minutes,
         cancellation_window_hours = p_cancellation_window_hours
   where id = v_facility_id;

  return true;
end;
$$;

comment on function public.set_facility_configuration is
  'Zapis cennika, Puli instruktorów i reguł czasowych; puste znaczy konto bez Strzelnicy.';

revoke execute on function public.set_facility_configuration from public, anon, authenticated;
