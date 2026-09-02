-- Zapis Rezerwacji oczekującej na potwierdzenie adresu.
--
-- Zmieniają się trzy rzeczy i wszystkie trzy biorą się z jednego: Rezerwacja
-- nie jest już potwierdzona z chwilą zapisu.
--
-- Po pierwsze, zapis niesie token i termin wygaśnięcia. Token losuje Edge
-- Function, ale chwilę wygaśnięcia liczy baza — `now()` w jednej transakcji
-- z zapisem, a nie zegar środowiska brzegowego, który potrafi iść inaczej.
-- Długość czekania przyjeżdża parametrem, bo należy do domeny i ma jedną
-- kopię w `packages/shared`.
--
-- Po drugie, przed zapisem zamiatane są Rezerwacje, których czas minął.
-- Widoki zajętości już ich nie pokazują, ale ograniczenie wyłączności Osi
-- pytać o zegar nie umie — wiersz stojący jako „oczekująca" trzyma Oś
-- w indeksie do chwili, w której ktoś przestawi mu stan. Zamiatanie idzie pod
-- tą samą blokadą doradczą, co reszta zapisu, więc dwa zgłoszenia na wygasły
-- termin nie zamiotą go sobie nawzajem spod rąk.
--
-- Po trzecie, Pula sztuk broni liczy się odtąd przez `booking_holds_term` —
-- tę samą regułę, co widoki. Lista stanów wypisana tutaj po raz drugi
-- pomijałaby fakt, że Rezerwacja oczekująca bywa już martwa.
--
-- Funkcja znów zmienia listę parametrów, więc znów `drop` wprost, a nie
-- `create or replace`: dwie funkcje `place_booking` znaczyłyby dwie drogi
-- zapisu Rezerwacji.
drop function public.place_booking(
  uuid, uuid, timestamptz, timestamptz, public.booking_status, smallint,
  text, text, text, boolean, boolean, jsonb, jsonb, bigint, integer, integer, integer
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
  -- Token z linku potwierdzającego adres. Losowany po stronie Edge Function,
  -- bo to ona zaraz wkleja go do e-maila.
  p_confirmation_token text,
  -- Ile minut Rezerwacja czeka na potwierdzenie. Chwila wygaśnięcia liczy się
  -- z niej tutaj, zegarem bazy — tym samym, który później o niej rozstrzyga.
  p_hold_minutes integer
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
    confirmation_token, expires_at
  )
  values (
    p_facility_id, p_lane_id, p_starts_at, p_ends_at, p_status, p_participants,
    p_contact_name, p_contact_email, p_contact_phone, p_has_permit, p_with_instructor,
    p_amount_gr, p_block_rate_gr, p_participation_rate_gr, p_instructor_rate_gr,
    p_confirmation_token,
    -- Wygasa wyłącznie to, co czeka na potwierdzenie. Rezerwacja zapisana od
    -- razu jako potwierdzona — ręczny wpis w Panelu (ticket #43) — nie ma na
    -- co czekać i nie ma czego tracić.
    case
      when p_status = 'oczekujaca' then now() + make_interval(mins => p_hold_minutes)
    end
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
  'Zapis Rezerwacji oczekującej na potwierdzenie adresu wraz z pozycjami i zamrożoną Kwotą.';

-- Rezerwacja powstaje wyłącznie przez Edge Function (ADR 0003), a ta łączy się
-- rolą serwisową. Klucz anonimowy i Użytkownik panelu nie mają tędy drogi.
revoke execute on function public.place_booking from public, anon, authenticated;
