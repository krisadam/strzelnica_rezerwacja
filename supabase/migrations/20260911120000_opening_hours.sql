-- Godziny otwarcia i Wyjątki kalendarzowe ustawiane przez Panel — druga rzecz,
-- którą Strzelnica przestaje dostawać z seeda, a zaczyna ustawiać sobie sama.
--
-- Jedna zmiana schematu jest tu trwała, a reszta to droga zapisu:
--
--   * Wyjątek przestaje znaczyć wyłącznie „zamknięte". Dotąd niósł samą datę
--     i tyle mógł powiedzieć; odtąd wolno mu dać dacie **własne godziny** —
--     Wigilia otwarta do południa jest wyjątkiem tak samo jak Boże Narodzenie
--     zamknięte w całości. Godziny puste znaczą dzień zamknięty i to jest ta
--     sama konwencja, co w tygodniu, w którym dnia zamkniętego po prostu nie ma.
--
-- Stąd `closed_on` zmienia nazwę na `on_date`: data, na której wyjątek stoi,
-- przestała mówić o zamknięciu, a kolumna nazwana po skutku, którego już nie
-- gwarantuje, kłamałaby przy pierwszym skróconym dniu.
--
-- Zapis idzie tą samą drogą, co przy Osi, rozkładzie i Blokadzie: funkcja
-- bazodanowa z warunkiem `panel_facility_of(p_user_id)`, prawo wykonania
-- wyłącznie dla roli serwisowej i Edge Function jako jedyne przejście
-- z przeglądarki (ADR 0003, ADR 0010).
--
-- Czego tu nie ma: rozstrzygania o Rezerwacjach, które po zmianie stoją poza
-- godzinami. Godziny mówią, czego Strzelnica nie sprzedaje, a nie komu odbiera
-- termin — Rezerwacja niesie własny termin i znika wyłącznie Odwołaniem,
-- z powodem wysłanym klientowi. Kolizję **wskazuje** Panel (`hoursConflicts`),
-- a rozstrzyga ją człowiek.

alter table public.calendar_exceptions
  rename column closed_on to on_date;

alter table public.calendar_exceptions
  rename constraint calendar_exceptions_facility_id_closed_on_key
  to calendar_exceptions_facility_id_on_date_key;

alter table public.calendar_exceptions
  add column opens_minute smallint
    check (opens_minute >= 0 and opens_minute < 1440),
  -- Domknięcie po północy zapisuje się jako wartość powyżej 1440, tak samo jak
  -- w godzinach tygodniowych: bez tego skrócona sobota nie zmieściłaby Bloku
  -- przecinającego granicę doby.
  add column closes_minute smallint
    check (closes_minute <= 2880),
  -- Para, a nie dwie osobne kolumny: dzień otwarty „od 10:00" i bez godziny
  -- zamknięcia nie jest ani dniem otwartym, ani zamkniętym — a `hoursForDay`
  -- musi mieć z wiersza jedną odpowiedź.
  add constraint calendar_exceptions_hours_check check (
    (opens_minute is null) = (closes_minute is null)
    and (closes_minute is null or closes_minute > opens_minute)
  );

comment on table public.calendar_exceptions is
  'Wyjątek kalendarzowy — data poza rytmem tygodnia; bez godzin = zamknięte.';

comment on column public.calendar_exceptions.on_date is
  'Data, której wyjątek dotyczy. Nie „zamknięte": wyjątek bywa skróconym dniem.';

-- Powód wyjątku czyta wyłącznie Strzelnica — tak samo jak powód Blokady. Dotąd
-- ginął na brzegu (`closedDateFromRow` oddawało samą datę), ale odkąd wyjątek
-- jest pojęciem z powodem i godzinami, wiersz jedzie do Widgetu w całości —
-- a „Pogrzeb właściciela" w źródle strony klienta jest dokładnie tym, przed
-- czym stawia spec („publiczny klucz w kodzie Widgetu nie pozwalał na odczyt
-- danych osobowych").
--
-- Blokada rozwiązuje to odebraniem klucza anonimowego prawa do całej tabeli,
-- bo tam publiczna jest wyłącznie sama zajętość. Tu nie da się tak samo: dzień
-- zamknięty **musi** dojść do kalendarza klienta, inaczej Widget sprzedawałby
-- termin w święto. Prawa schodzą więc kolumnami, jak przy `facilities`:
-- uprawnienie na tabelę przesłania każde zawężenie kolumnowe, więc najpierw
-- schodzi ono, a potem wraca wypisane. Konto Panelu zostaje z całym wierszem —
-- powód jest pisany przez obsługę i dla obsługi.
revoke select on public.calendar_exceptions from anon;

grant select (id, facility_id, on_date, opens_minute, closes_minute)
  on public.calendar_exceptions to anon;

-- Zapis godzin: cały tydzień naraz, tak samo jak rozkład Bloków (ADR 0013).
-- Dzień dopisany, zamknięty i poprawiony są wtedy jednym zapisem, a wiersze
-- dnia, którego żądanie nie wymienia, znikają — i to jest treść tego zapisu,
-- a nie jego skutek uboczny: dzień bez wiersza jest dniem zamkniętym, więc
-- kasowanie jest tu jedynym sposobem, żeby Strzelnicę w poniedziałek zamknąć.
--
-- Kasowanie i wstawianie stoją w jednej transakcji, więc nie ma chwili, w której
-- tydzień jest w połowie stary. Zgłoszenie składane w tej samej chwili widzi
-- godziny sprzed zmiany albo po niej, nigdy w połowie — tyle daje zwykła
-- izolacja transakcji i tyle tu potrzeba.
--
-- Tydzień przychodzi listą obiektów o **nazwach kolumn tabeli**, a nie pól
-- `OpeningHours` z `packages/shared`: `jsonb_to_recordset` zestawia klucze
-- z nazwami kolumn dosłownie, więc przełożenie jednego na drugie należy do
-- funkcji brzegowej.
create function public.set_opening_hours(
  p_week jsonb,
  p_user_id uuid
) returns boolean
-- Ścieżka wyszukiwania przypięta wprost: funkcja woła się rolą serwisową.
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

  delete from public.opening_hours
   where facility_id = v_facility_id;

  insert into public.opening_hours (facility_id, weekday, opens_minute, closes_minute)
  select
    v_facility_id,
    dzien.weekday,
    dzien.opens_minute,
    dzien.closes_minute
  from jsonb_to_recordset(p_week)
    as dzien(weekday smallint, opens_minute smallint, closes_minute smallint);

  return true;
end;
$$;

comment on function public.set_opening_hours is
  'Zapis całego tygodnia godzin otwarcia; puste znaczy konto bez Strzelnicy.';

revoke execute on function public.set_opening_hours from public, anon, authenticated;

-- Zapis wyjątku — nowego albo poprawionego. Jedna funkcja na oba przypadki,
-- tak samo jak `save_lane`: różnią się wyłącznie tym, czy data ma już wyjątek,
-- a dwie rozjechałyby się przy pierwszej kolumnie dołożonej do formularza.
--
-- Powód pusty schodzi do `null`: „opis, którego nie ma" ma w tej kolumnie jeden
-- zapis, a nie dwa do rozróżniania w każdym miejscu, które ją czyta.
create function public.save_calendar_exception(
  p_on_date date,
  p_reason text,
  p_opens_minute smallint,
  p_closes_minute smallint,
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

  insert into public.calendar_exceptions
    (facility_id, on_date, reason, opens_minute, closes_minute)
  values
    (v_facility_id, p_on_date, nullif(btrim(p_reason), ''), p_opens_minute, p_closes_minute)
  on conflict (facility_id, on_date) do update
    set reason = excluded.reason,
        opens_minute = excluded.opens_minute,
        closes_minute = excluded.closes_minute;

  return true;
end;
$$;

comment on function public.save_calendar_exception is
  'Zapis Wyjątku kalendarzowego; puste znaczy konto bez Strzelnicy.';

revoke execute on function public.save_calendar_exception from public, anon, authenticated;

-- Zdjęcie wyjątku: data wraca do rytmu tygodnia. Data, która wyjątku nie miała,
-- jest tu odpowiedzią „udało się", a nie pomyłką — o to właśnie proszono, a ta
-- funkcja odpowiada o stanie po sobie, nie o liczbie ruszonych wierszy.
create function public.delete_calendar_exception(
  p_on_date date,
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

  delete from public.calendar_exceptions
   where facility_id = v_facility_id
     and on_date = p_on_date;

  return true;
end;
$$;

comment on function public.delete_calendar_exception is
  'Zdjęcie Wyjątku kalendarzowego; puste znaczy konto bez Strzelnicy.';

revoke execute on function public.delete_calendar_exception from public, anon, authenticated;
