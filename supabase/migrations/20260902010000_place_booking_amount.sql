-- Kwota do zapłaty dołącza do zapisu Rezerwacji.
--
-- Powstaje razem z nią i z jej pozycjami, w tej samej transakcji, bo jest
-- o nich: Rezerwacja z Kwotą policzoną z połowy pozycji byłaby rachunkiem nie
-- za to, co Strzelnica przygotuje.
--
-- Kwota przychodzi **policzona**, a nie liczona tutaj. Liczy ją czysta funkcja
-- z `packages/shared` — ta sama, która pokazała rozbicie Osobie rezerwującej
-- w formularzu. Druga kopia reguły napisana w SQL-u byłaby dokładnie tym
-- rozjazdem, przed którym stawia spec: klient płaci inną Kwotę, niż zobaczył.
-- Ceny w pozycjach nie są przy tym wartościami od klienta — Edge Function
-- czyta katalog z bazy rolą serwisową i sama je tam wstawia.
--
-- Funkcja znów zmienia listę parametrów, więc znów `drop` wprost, a nie
-- `create or replace`: dwie funkcje `place_booking` znaczyłyby dwie drogi
-- zapisu Rezerwacji.
drop function public.place_booking(
  uuid, uuid, timestamptz, timestamptz, public.booking_status, smallint,
  text, text, text, boolean, boolean, jsonb, jsonb
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
  p_instructor_rate_gr integer
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

  insert into public.bookings (
    facility_id, lane_id, starts_at, ends_at, status, participants,
    contact_name, contact_email, contact_phone, has_permit, with_instructor,
    amount_gr, block_rate_gr, participation_rate_gr, instructor_rate_gr
  )
  values (
    p_facility_id, p_lane_id, p_starts_at, p_ends_at, p_status, p_participants,
    p_contact_name, p_contact_email, p_contact_phone, p_has_permit, p_with_instructor,
    p_amount_gr, p_block_rate_gr, p_participation_rate_gr, p_instructor_rate_gr
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
  -- w czasie i też jest żywa. Sprawdzamy po zapisie właśnie po to.
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
          and b.status in ('oczekujaca', 'potwierdzona')
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
  'Zapis Rezerwacji wraz z Wypożyczeniami, Zapotrzebowaniem i zamrożoną Kwotą w jednej transakcji.';

-- Rezerwacja powstaje wyłącznie przez Edge Function (ADR 0003), a ta łączy się
-- rolą serwisową. Klucz anonimowy i Użytkownik panelu nie mają tędy drogi.
revoke execute on function public.place_booking from public, anon, authenticated;
