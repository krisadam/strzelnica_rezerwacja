-- Katalogi Strzelnicy — Typy broni i Rodzaje amunicji — jako przedmiot
-- konfiguracji Panelu, zamiast wierszy wstawianych seedem.
--
-- Jedna zmiana jest tu trwała, a reszta to droga zapisu: pozycja katalogu
-- zyskuje `active`, bo katalogu **nie kasuje się** — wycofuje się z niego
-- pozycje. Powód jest ten sam, co przy Osi (ADR 0013), i jest tu nawet
-- mocniejszy: klucze obce pozycji Rezerwacji do katalogów stoją na `on delete
-- restrict`, więc skasowanie Typu wskazanego przez czyjeś Wypożyczenie i tak
-- nie przeszłoby — odbiłoby się od bazy błędem, którego obsługa nie ma jak
-- przeczytać. Wycofanie robi to, po co sięga się po kasowanie: zdejmuje pozycję
-- ze sprzedaży, zostawiając jej przeszłość.
--
-- Czego tu nie ma: sprawdzania Puli przy zapisie. Pula zmniejszona poniżej
-- tego, co obiecano w Rezerwacjach, jest decyzją Strzelnicy — sztuka bywa
-- zepsuta, sprzedana albo zabrana do serwisu — a Rezerwacja niesie swoje sztuki
-- i o Pulę nie pyta nikogo po tym, jak powstała. Przekroczenia **wypisuje**
-- Panel, zanim cokolwiek pójdzie do bazy, i rozstrzyga je człowiek; tak samo
-- jak przy godzinach otwarcia zdejmujących termin Rezerwacji.

alter table public.weapon_types
  add column active boolean not null default true;

comment on column public.weapon_types.active is
  'Czy Typ jest w ofercie. Wycofany znika z Widgetu; Rezerwacje z nim zostają.';

alter table public.ammunition_kinds
  add column active boolean not null default true;

comment on column public.ammunition_kinds.active is
  'Czy Rodzaj jest w ofercie. Wycofany znika z Widgetu; Rezerwacje zostają.';

-- Pozycja wycofana przestaje być ofertą i jest to powiedziane tam, gdzie oferta
-- jest zdefiniowana — w polityce dla klucza anonimowego, a nie w zapytaniu
-- Widgetu (ADR 0009, ADR 0013). Zawężenie stojące w kodzie ekranu znika razem
-- z pominięciem jednego `.eq(…)` przy następnej poprawce.
--
-- Konto Panelu czyta katalogi własną polityką, na przynależność do Strzelnicy,
-- i widzi pozycje wycofane tak samo jak czynne — musi je widzieć: opisują
-- sprzęt zamówiony w Rezerwacjach, które wciąż stoją w kalendarzu, a samo
-- wycofanie da się cofnąć tylko z ekranu, na którym pozycja jest widoczna.
alter policy "Katalog Typów broni jest publiczny do odczytu"
  on public.weapon_types using (active);
alter policy "Katalog Typów broni jest publiczny do odczytu"
  on public.weapon_types rename to "Czynne Typy broni są publiczne do odczytu";

alter policy "Katalog Rodzajów amunicji jest publiczny do odczytu"
  on public.ammunition_kinds using (active);
alter policy "Katalog Rodzajów amunicji jest publiczny do odczytu"
  on public.ammunition_kinds rename to "Czynne Rodzaje amunicji są publiczne do odczytu";

-- Zapis Typu broni — nowego albo poprawionego. Jedna funkcja na oba przypadki
-- i na wycofanie, tak samo jak przy Osi (`save_lane`): zakładanie i poprawianie
-- różnią się wyłącznie tym, czy pozycja już jest, a wycofanie jest poprawką
-- jednego pola.
--
-- Pusto znaczy pozycję, której baza tej Strzelnicy nie przypisuje: obcą,
-- nieistniejącą albo należącą do konta bez powiązania. Jedna odpowiedź na
-- wszystkie trzy — rozróżnienie mówiłoby pytającemu o katalogach, których nie
-- ma prawa widzieć.
--
-- Czego tu nie ma: sprawdzenia nazwy. Jej jedyności pilnuje `unique
-- (facility_id, name)` w schemacie, bo między odczytem Panelu a kliknięciem
-- mieści się pozycja dodana przez kogoś innego — ta sama reguła, co przy Osi
-- i przy wyłączności Osi (ADR 0003).
create function public.save_weapon_type(
  p_weapon_type_id uuid,
  p_name text,
  p_pool smallint,
  p_unit_price_gr integer,
  p_active boolean,
  p_user_id uuid
) returns uuid
-- Ścieżka wyszukiwania przypięta wprost: funkcja woła się rolą serwisową.
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_facility_id uuid;
  v_weapon_type_id uuid;
begin
  v_facility_id := public.panel_facility_of(p_user_id);
  if v_facility_id is null then
    return null;
  end if;

  if p_weapon_type_id is null then
    insert into public.weapon_types (facility_id, name, pool, unit_price_gr, active)
    values (v_facility_id, btrim(p_name), p_pool, p_unit_price_gr, p_active)
    returning id into v_weapon_type_id;
  else
    update public.weapon_types
       set name = btrim(p_name),
           pool = p_pool,
           unit_price_gr = p_unit_price_gr,
           active = p_active
     where id = p_weapon_type_id
       and facility_id = v_facility_id
    returning id into v_weapon_type_id;
  end if;

  return v_weapon_type_id;
end;
$$;

comment on function public.save_weapon_type is
  'Zapis Typu broni w imieniu konta Panelu; puste znaczy Typ nie tej Strzelnicy.';

revoke execute on function public.save_weapon_type from public, anon, authenticated;

-- Zapis Rodzaju amunicji. Siostrzana wobec `save_weapon_type` i celowo uboższa
-- o jeden parametr: Rodzaj amunicji nie ma puli i mieć nie będzie (ADR 0004),
-- więc kolumny, której tu nie ma, nie da się przez tę funkcję ustawić.
create function public.save_ammunition_kind(
  p_ammunition_kind_id uuid,
  p_name text,
  p_unit_price_gr integer,
  p_active boolean,
  p_user_id uuid
) returns uuid
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_facility_id uuid;
  v_ammunition_kind_id uuid;
begin
  v_facility_id := public.panel_facility_of(p_user_id);
  if v_facility_id is null then
    return null;
  end if;

  if p_ammunition_kind_id is null then
    insert into public.ammunition_kinds (facility_id, name, unit_price_gr, active)
    values (v_facility_id, btrim(p_name), p_unit_price_gr, p_active)
    returning id into v_ammunition_kind_id;
  else
    update public.ammunition_kinds
       set name = btrim(p_name),
           unit_price_gr = p_unit_price_gr,
           active = p_active
     where id = p_ammunition_kind_id
       and facility_id = v_facility_id
    returning id into v_ammunition_kind_id;
  end if;

  return v_ammunition_kind_id;
end;
$$;

comment on function public.save_ammunition_kind is
  'Zapis Rodzaju amunicji w imieniu konta Panelu; puste znaczy Rodzaj nie tej Strzelnicy.';

revoke execute on function public.save_ammunition_kind from public, anon, authenticated;
