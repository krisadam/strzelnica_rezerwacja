-- Konfiguracja Osi i jej rozkładu Bloków przez Panel — pierwsza rzecz, którą
-- Strzelnica ustawia sobie sama, zamiast dostawać ją z seeda.
--
-- Dwie zmiany są tu trwałe, a reszta to droga zapisu:
--
--   * Oś zyskuje `active`, bo Osi **nie kasuje się** (ADR 0013). Skasowana
--     zabrałaby ze sobą Rezerwacje, które na niej stoją — klucze obce kasują je
--     kaskadą — a Rezerwacja ma znikać wyłącznie przez odwołanie, z powodem
--     wysłanym klientowi. Oś wyłączona przestaje być ofertą i nic poza tym.
--   * Rozkład zapisuje się **tygodniami jednej Osi**, a nie pojedynczymi
--     wierszami (ADR 0013): dopisanie Bloku, skasowanie Bloku, skopiowanie dnia
--     na sześć innych i skopiowanie Osi na drugą są wtedy jednym zapisem,
--     wykonanym w jednej transakcji.
--
-- Droga zapisu jest ta sama, co przy Blokadzie i odwołaniu: funkcja bazodanowa
-- z warunkiem `panel_facility_of(p_user_id)`, prawo wykonania wyłącznie dla roli
-- serwisowej i Edge Function jako jedyne przejście z przeglądarki (ADR 0003,
-- ADR 0010).

alter table public.lanes
  add column active boolean not null default true;

comment on column public.lanes.active is
  'Czy Oś jest w ofercie. Wyłączona znika z Widgetu; jej Rezerwacje zostają.';

-- Oś wyłączona przestaje być ofertą i jest to powiedziane tam, gdzie oferta
-- jest zdefiniowana — w polityce dla klucza anonimowego, a nie w zapytaniu
-- Widgetu. Zawężenie stojące w kodzie ekranu znika razem z pominięciem jednego
-- `.eq(…)` przy następnej poprawce, a tu nie chodzi o to, czego Widget nie
-- pokazuje, tylko o to, czego wyłączona Oś nie ma prawa dać (ADR 0009).
--
-- Terminów wyłączona Oś nie ma skąd wziąć nawet przy tej polityce zdjętej:
-- Widget składa Blok z rozkładu **i** z Osi, a Rezerwację na niej odrzuca
-- `zloz-rezerwacje`. To jest pierwsza z trzech granic i jedyna, przez którą nie
-- przechodzi się przypadkiem.
alter policy "Osie są publiczne do odczytu" on public.lanes using (active);
alter policy "Osie są publiczne do odczytu" on public.lanes
  rename to "Czynne Osie są publiczne do odczytu";

-- Konto Panelu widzi Osie wyłączone tak samo jak czynne i musi je widzieć:
-- ich Rezerwacje stoją dalej w kalendarzu, a samo wyłączenie da się cofnąć
-- tylko z ekranu, na którym Oś jest widoczna. Jego polityka mówi o Strzelnicy
-- i o niczym więcej, więc nie zmienia się tu wcale.

-- Zapis Osi — nowej albo poprawionej. Jedna funkcja na oba przypadki, bo
-- zakładanie i poprawianie różnią się wyłącznie tym, czy Oś już jest; dwie
-- rozjechałyby się przy pierwszej kolumnie dołożonej do formularza.
--
-- Pusto znaczy Oś, której baza tej Strzelnicy nie przypisuje: obcą,
-- nieistniejącą albo należącą do konta bez powiązania. Jedna odpowiedź na
-- wszystkie trzy, tak samo jak przy Blokadzie — rozróżnienie mówiłoby
-- pytającemu o Osiach, których nie ma prawa widzieć.
--
-- Czego tu nie ma: sprawdzenia nazwy. Jej jedyności pilnuje `unique
-- (facility_id, name)` w schemacie, bo między odczytem Panelu a kliknięciem
-- mieści się Oś dodana przez kogoś innego — ta sama reguła, co przy
-- wyłączności Osi (ADR 0003).
create function public.save_lane(
  p_lane_id uuid,
  p_name text,
  p_capacity smallint,
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
    -- Stawka za Blok zostaje domyślna, czyli zerowa: należy do Cennika
    -- (ticket #22), a nie do tego formularza. Oś bez rozkładu nie ma przy tym
    -- ani jednego terminu do sprzedania, więc zerowa stawka nie wychodzi
    -- z Panelu nigdzie dalej, dopóki ktoś nie wypisze jej Bloków.
    insert into public.lanes (facility_id, name, capacity, active)
    values (v_facility_id, btrim(p_name), p_capacity, p_active)
    returning id into v_lane_id;
  else
    update public.lanes
       set name = btrim(p_name),
           capacity = p_capacity,
           active = p_active
     where id = p_lane_id
       and facility_id = v_facility_id
    returning id into v_lane_id;
  end if;

  return v_lane_id;
end;
$$;

comment on function public.save_lane is
  'Zapis Osi w imieniu konta Panelu; puste znaczy Oś nie tej Strzelnicy.';

revoke execute on function public.save_lane from public, anon, authenticated;

-- Zapis rozkładu: cały tydzień jednej Osi naraz. Wiersze dnia, którego żądanie
-- nie wymienia, znikają — i to jest treść tego zapisu, a nie jego skutek
-- uboczny: rozkład jest jedną rzeczą, a nie zbiorem wierszy do łatania
-- (ADR 0013). Kasowanie i wstawianie stoją w jednej transakcji, więc nie ma
-- chwili, w której tydzień jest w połowie stary.
--
-- Rezerwacji ta zmiana nie dotyczy w ogóle: Rezerwacja niesie własny termin
-- i o rozkład nie pyta nikogo po tym, jak powstała. Bloku zdjętego z rozkładu
-- nikt jej nie odbierze — stoi na Osi dalej, choć Strzelnica nie sprzedaje już
-- tej godziny nikomu nowemu.
--
-- Zgłoszenie składane w tej samej chwili widzi rozkład sprzed zmiany albo po
-- niej, nigdy w połowie — tyle daje zwykła izolacja transakcji i tyle tu
-- potrzeba. Blokady doradczej na Strzelnicę ta funkcja więc nie bierze: nie ma
-- tu nic, co trzeba by policzyć po zapisie.
-- Tydzień przychodzi listą obiektów o **nazwach kolumn tabeli**, a nie pól
-- `ScheduleBlock` z `packages/shared`: `jsonb_to_recordset` zestawia klucze
-- z nazwami kolumn dosłownie, więc przełożenie jednego na drugie należy do
-- funkcji brzegowej — tam, gdzie w tym module mieszka każde inne przełożenie
-- wiersza na pojęcie domeny.
create function public.set_lane_schedule(
  p_lane_id uuid,
  p_week jsonb,
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

  -- Oś tej Strzelnicy — albo pusto. Klucz obcy złożony zatrzymałby obcą Oś
  -- i tak, ale jako błąd serwera, a nie odpowiedź o żądaniu.
  perform 1
     from public.lanes l
    where l.id = p_lane_id
      and l.facility_id = v_facility_id;
  if not found then
    return null;
  end if;

  delete from public.block_schedules
   where lane_id = p_lane_id;

  insert into public.block_schedules
    (facility_id, lane_id, weekday, start_minute, duration_minutes)
  select
    v_facility_id,
    p_lane_id,
    blok.weekday,
    blok.start_minute,
    blok.duration_minutes
  from jsonb_to_recordset(p_week)
    as blok(weekday smallint, start_minute smallint, duration_minutes smallint);

  return true;
end;
$$;

comment on function public.set_lane_schedule is
  'Zapis całego tygodnia rozkładu jednej Osi; puste znaczy Oś nie tej Strzelnicy.';

revoke execute on function public.set_lane_schedule from public, anon, authenticated;
