-- Ręczna Rezerwacja telefoniczna: skąd Rezerwacja się wzięła i które limity
-- Strzelnicy świadomie przy niej złamano.
--
-- Do tej pory każda Rezerwacja przychodziła z Widgetu i przechodziła te same
-- reguły, co kalendarz klienta. Użytkownik panelu wie o sytuacji więcej niż
-- system — że na Osi zmieści się szósty strzelec, że obsługa zostanie po
-- godzinach, że drugi Instruktor przyjdzie na zmianę — więc wolno mu te reguły
-- złamać. Ale nie po cichu: naruszenie zostaje przy Rezerwacji na trwałe, bo
-- to ono tłumaczy dane przeczące regułom systemu.
--
-- Czego ta migracja **nie** rusza: wyłączności Osi. Ograniczenie wykluczające
-- i oba wyzwalacze Blokad obowiązują ręczny wpis dokładnie tak samo, jak
-- zgłoszenie z Widgetu — Oś jest wyłączna i nie ma tu czego nadpisywać
-- (ADR 0012). Pula sztuk Typu broni też zostaje: ona mówi, ile sztuk
-- Strzelnica ma, a nie ile zwykle wydaje.

create type public.booking_source as enum ('widget', 'panel');

comment on type public.booking_source is
  'Źródło Rezerwacji: Widget klienta albo ręczny wpis w Panelu.';

-- Limity, których ręczny wpis wolno przekroczyć — i wyłącznie one. Zbiór jest
-- zamknięty i jest to jego treść: wartość dopisana tutaj znaczy nowy limit
-- oddany obsłudze do złamania, więc dopisuje się ją świadomie, migracją.
create type public.limit_override as enum (
  'poza-godzinami-otwarcia',
  'brak-instruktora',
  'ponad-pojemnosc-osi'
);

comment on type public.limit_override is
  'Limit Strzelnicy przekroczony przez ręczny wpis Rezerwacji w Panelu.';

alter table public.bookings
  -- Wartość domyślna jest tu wyłącznie po to, żeby wypełnić Rezerwacje już
  -- zapisane: do tej migracji Widget był jedyną drogą, którą Rezerwacja
  -- powstawała, więc „widget" jest o nich zdaniem prawdziwym. Schodzi zaraz
  -- niżej — Rezerwacja zapisana bez podanego Źródła podawałaby się za
  -- zgłoszenie klienta, a to jest dokładnie to jedno, o czym ta kolumna ma nie
  -- milczeć.
  add column source public.booking_source not null default 'widget',
  -- Naruszenia jako tablica, a nie osobna tabela: naruszenie nie ma ani jednej
  -- własnej danej poza swoją nazwą — nie ma powodu, autora ani chwili innej niż
  -- chwila zapisu Rezerwacji, przy której stoi. Tabela dodałaby im klucz obcy
  -- i odczyt, a odpowiadałaby na to samo pytanie (ADR 0012).
  --
  -- Pusta tablica zostaje z wartością domyślną, bo pusto ma **każda**
  -- Rezerwacja, przy której nic nie złamano — i większość wpisów z Panelu też.
  add column limit_overrides public.limit_override[] not null default '{}',
  -- Naruszenie wolno mieć wyłącznie wpisowi z Panelu. Widget nie ma czym
  -- przekroczyć limitu — ta sama czysta funkcja orzeka u niego o dostępności
  -- i przy zapisie — więc naruszenie przy Rezerwacji z Widgetu znaczyłoby
  -- pomyłkę w kodzie, a nie decyzję obsługi. Reguła schematu, a nie uprzejmość
  -- Edge Function: dróg zapisu bywa więcej, niż się pamięta.
  add constraint bookings_overrides_come_from_panel
    check (source = 'panel' or limit_overrides = '{}');

alter table public.bookings alter column source drop default;

comment on column public.bookings.source is
  'Źródło Rezerwacji — Widget klienta albo ręczny wpis w Panelu.';
comment on column public.bookings.limit_overrides is
  'Limity Strzelnicy przekroczone przy ręcznym wpisie. Pusto znaczy Rezerwację w regułach.';

-- Oba pola dochodzą do widoku Panelu: Źródło, bo obsługa czyta z niego, czy
-- ktoś dzwonił, czy klikał sam, a naruszenia, bo bez nich Rezerwacja na sześć
-- osób na Osi czteroosobowej wygląda na pomyłkę systemu. Kolumny dopisane
-- wprost, na końcu: widok wystawia dokładnie to, co ktoś świadomie do niego
-- wpisał (ADR 0008), więc `create or replace` powtarza tu całą jego definicję.
--
-- Uprawnień widok przy tym nie traci: `create or replace view` zachowuje
-- `revoke all` i `grant select` z migracji Panelu.
create or replace view public.panel_bookings as
  select
    b.id,
    b.facility_id,
    b.lane_id,
    b.starts_at,
    b.ends_at,
    b.status,
    public.booking_holds_term(b.status, b.expires_at) as holds_term,
    b.participants,
    b.has_permit,
    b.with_instructor,
    b.contact_name,
    b.contact_email,
    b.contact_phone,
    b.amount_gr,
    b.revocation_reason,
    b.source,
    b.limit_overrides
  from public.bookings b
  where b.facility_id = public.panel_facility();

comment on view public.panel_bookings is
  'Rezerwacje Strzelnicy zalogowanego Użytkownika panelu, bez tokenów Osoby rezerwującej.';

-- Zapis Rezerwacji przyjmuje odtąd Źródło i listę naruszeń. Droga zostaje
-- jedna dla obu Źródeł i jest to sedno: ręczny wpis ma przejść przez tę samą
-- blokadę doradczą, to samo zamiatanie wygasłych, to samo ograniczenie
-- wyłączności Osi i to samo sprawdzenie Puli sztuk broni, co zgłoszenie
-- z Widgetu. Druga funkcja zapisująca byłaby drugim miejscem, w którym te
-- cztery rzeczy trzeba pamiętać.
--
-- Funkcja znów zmienia listę parametrów, więc znów `drop` wprost, a nie
-- `create or replace`: dwie funkcje `place_booking` znaczyłyby dwie drogi
-- zapisu Rezerwacji.
drop function public.place_booking(
  uuid, uuid, timestamptz, timestamptz, public.booking_status, smallint,
  text, text, text, boolean, boolean, jsonb, jsonb, bigint, integer, integer,
  integer, text, integer
);

create function public.place_booking(
  p_facility_id uuid,
  p_lane_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status public.booking_status,
  p_participants smallint,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_has_permit boolean,
  p_with_instructor boolean,
  -- Wypożyczenia w kształcie, w jakim policzyła je Kwota:
  -- [{"weaponTypeId": "...", "quantity": 2, "unitPriceGr": 5000}]. Pusta
  -- tablica znaczy Rezerwację Osoby rezerwującej z własną bronią.
  p_rentals jsonb,
  -- Zapotrzebowanie w tym samym kształcie:
  -- [{"ammunitionKindId": "...", "quantity": 100, "unitPriceGr": 150}].
  p_ammunition jsonb,
  -- Kwota i stawki, z których się policzyła. Zapisane, a nie odczytywane
  -- z cennika przy każdym pokazaniu: zmiana cennika nie może zmieniać Kwot
  -- już złożonych Rezerwacji.
  -- `bigint`, tak jak kolumna: Kwota bywa iloczynem liczby sztuk i ceny,
  -- a liczba sztuk amunicji nie ma górnej granicy poza typem (ADR 0004).
  p_amount_gr bigint,
  p_block_rate_gr integer,
  p_participation_rate_gr integer,
  p_instructor_rate_gr integer,
  -- Skąd ta Rezerwacja się wzięła. Bez wartości domyślnej: wołający ma to
  -- powiedzieć, a nie odziedziczyć po tym, co było wcześniej.
  p_source public.booking_source,
  -- Limity Strzelnicy przekroczone tym zapisem. Liczy je Edge Function tą samą
  -- czystą funkcją, którą Panel pokazał obsłudze pytanie o pewność — a nie
  -- przepisuje z żądania: lista przysłana z przeglądarki byłaby naruszeniem,
  -- które sam naruszający sobie wystawia. Pusta tablica przy zgłoszeniu
  -- z Widgetu, bo Widget nie ma czym niczego przekroczyć.
  p_limit_overrides public.limit_override[],
  -- Dwa parametry potwierdzenia adresu stoją na końcu i mają wartość domyślną,
  -- bo należą wyłącznie do Rezerwacji, która na potwierdzenie **czeka**. Wpis
  -- z Panelu ich nie podaje wcale — i to jest o nim zdanie prawdziwsze niż
  -- „token pusty, czekanie zerowe".
  --
  -- Token z linku potwierdzającego adres losuje Edge Function, bo to ona zaraz
  -- wkleja go do e-maila.
  p_confirmation_token text default null,
  -- Ile minut Rezerwacja czeka na potwierdzenie. Chwila wygaśnięcia liczy się
  -- z niej tutaj, zegarem bazy — tym samym, który później o niej rozstrzyga.
  p_hold_minutes integer default null
) returns uuid
language plpgsql
-- Ścieżka wyszukiwania przypięta wprost: funkcja woła się rolą serwisową,
-- więc nazwa nieprzypięta wskazywałaby to, co akurat stoi w `search_path`
-- wołającego.
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
begin
  -- Zgłoszenia jednej Strzelnicy idą odtąd pojedynczo. Sumowanie sztuk po
  -- nakładających się Rezerwacjach nie ma sensu, dopóki ktoś obok dopisuje
  -- swoje. Strzelnice nie czekają na siebie nawzajem.
  perform pg_advisory_xact_lock(hashtext(p_facility_id::text)::bigint);

  -- Termin trzymany przez Rezerwację, której czas minął, jest wolny — ale
  -- ograniczenie wyłączności Osi dowie się o tym dopiero stąd.
  perform public.expire_stale_bookings(p_facility_id);

  insert into public.bookings (
    facility_id, lane_id, starts_at, ends_at, status, participants,
    contact_name, contact_email, contact_phone, has_permit, with_instructor,
    amount_gr, block_rate_gr, participation_rate_gr, instructor_rate_gr,
    confirmation_token, expires_at, source, limit_overrides
  )
  values (
    p_facility_id, p_lane_id, p_starts_at, p_ends_at, p_status, p_participants,
    p_contact_name, p_contact_email, p_contact_phone, p_has_permit, p_with_instructor,
    p_amount_gr, p_block_rate_gr, p_participation_rate_gr, p_instructor_rate_gr,
    p_confirmation_token,
    -- Wygasa wyłącznie to, co czeka na potwierdzenie. Rezerwacja zapisana od
    -- razu jako potwierdzona — ręczny wpis w Panelu — nie ma na co czekać
    -- i nie ma czego tracić.
    case
      when p_status = 'oczekujaca' then now() + make_interval(mins => p_hold_minutes)
    end,
    p_source,
    coalesce(p_limit_overrides, '{}')
  )
  returning id into v_booking_id;

  insert into public.weapon_rentals (
    facility_id, booking_id, weapon_type_id, quantity, unit_price_gr
  )
  select
    p_facility_id,
    v_booking_id,
    (pozycja ->> 'weaponTypeId')::uuid,
    (pozycja ->> 'quantity')::smallint,
    (pozycja ->> 'unitPriceGr')::integer
  from jsonb_array_elements(coalesce(p_rentals, '[]'::jsonb)) as pozycja;

  insert into public.ammunition_demands (
    facility_id, booking_id, ammunition_kind_id, quantity, unit_price_gr
  )
  select
    p_facility_id,
    v_booking_id,
    (pozycja ->> 'ammunitionKindId')::uuid,
    (pozycja ->> 'quantity')::integer,
    (pozycja ->> 'unitPriceGr')::integer
  from jsonb_array_elements(coalesce(p_ammunition, '[]'::jsonb)) as pozycja;

  -- Suma obejmuje właśnie zapisaną Rezerwację, bo ona też już nakłada się
  -- w czasie i też trzyma termin. Sprawdzamy po zapisie właśnie po to.
  --
  -- Wpisu z Panelu to sprawdzenie dotyczy tak samo: Pula sztuk mówi, ile sztuk
  -- Strzelnica **ma**, a nie ile zwykle wydaje — obsługa, która zna czwarty
  -- Glock, dopisuje go do katalogu, a nie obchodzi jego pulę Rezerwacją
  -- (ADR 0012).
  if exists (
    select 1
    from public.weapon_rentals moje
    join public.weapon_types typ on typ.id = moje.weapon_type_id
    where moje.booking_id = v_booking_id
      and typ.pool < (
        select coalesce(sum(cudze.quantity), 0)
        from public.weapon_rentals cudze
        join public.bookings b on b.id = cudze.booking_id
        where cudze.weapon_type_id = moje.weapon_type_id
          and public.booking_holds_term(b.status, b.expires_at)
          -- Zakres domknięty od początku, otwarty od końca — tak samo jak
          -- wszędzie indziej. Rezerwacja kończąca się o 12:00 oddaje broń.
          and b.starts_at < p_ends_at
          and b.ends_at > p_starts_at
      )
  ) then
    raise exception 'Pula sztuk Typu broni jest wyczerpana w tym terminie.'
      using errcode = 'WP001';
  end if;

  return v_booking_id;
end;
$$;

comment on function public.place_booking is
  'Zapis Rezerwacji wraz z pozycjami, zamrożoną Kwotą, Źródłem i przekroczonymi limitami.';

-- Rezerwacja powstaje wyłącznie przez Edge Function (ADR 0003), a ta łączy się
-- rolą serwisową. Klucz anonimowy i Użytkownik panelu nie mają tędy drogi —
-- także wtedy, gdy Rezerwację wpisuje właśnie Użytkownik panelu: prawo nadane
-- jego kontu otwierałoby drogę z przeglądarki wprost tutaj, a tamtędy Kwotę
-- i listę naruszeń podawałby sobie sam (ADR 0010).
revoke execute on function public.place_booking from public, anon, authenticated;
