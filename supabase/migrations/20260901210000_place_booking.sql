-- Zapis Rezerwacji wraz z jej Wypożyczeniami — w jednej transakcji.
--
-- Do tej pory Rezerwacja powstawała jednym `insert`, więc transakcja brała się
-- sama. Wypożyczenia są osobnymi wierszami: dwa zapisy z Edge Function to dwie
-- transakcje, a Rezerwacja bez swoich Wypożyczeń jest gorsza niż żadna —
-- Strzelnica przygotowałaby stanowisko bez broni. Stąd jedna funkcja.
--
-- Drugim powodem jest Pula sztuk. Wyłączności Osi pilnuje ograniczenie
-- wykluczające, ale sumy sztuk po nakładających się Rezerwacjach nie da się
-- wyrazić ograniczeniem tabeli. Edge Function czyta zajętość w innej
-- transakcji niż zapisuje, więc między odczytem a zapisem mieści się cudza
-- Rezerwacja. Blokada doradcza na Strzelnicę ustawia zgłoszenia w kolejkę,
-- a sprawdzenie po zapisie widzi już własny wiersz w sumie.
--
-- Warunek nakładania się jest tu drugim wyrażeniem tej samej reguły, co
-- `overlaps` w `packages/shared` — świadomie, tak samo jak `bookings_lane_is_exclusive`.
-- Schemat ma dotrzymać obietnicy nawet wtedy, gdy sprawdzenie wykonane przed
-- zapisem okaże się nieaktualne.

-- Naruszenie Puli sztuk Typu broni. Własny SQLSTATE, bo Edge Function ma
-- odróżnić je od zajętej Osi i odpowiedzieć innym zastrzeżeniem.
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
  -- Wypożyczenia w kształcie, w jakim przyszły w zgłoszeniu:
  -- [{"weaponTypeId": "...", "quantity": 2}]. Pusta tablica znaczy Rezerwację
  -- Osoby rezerwującej z własną bronią.
  p_rentals jsonb
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
    contact_name, contact_email, contact_phone, has_permit, with_instructor
  )
  values (
    p_facility_id, p_lane_id, p_starts_at, p_ends_at, p_status, p_participants,
    p_contact_name, p_contact_email, p_contact_phone, p_has_permit, p_with_instructor
  )
  returning id into v_booking_id;

  insert into public.weapon_rentals (facility_id, booking_id, weapon_type_id, quantity)
  select
    p_facility_id,
    v_booking_id,
    (pozycja ->> 'weaponTypeId')::uuid,
    (pozycja ->> 'quantity')::smallint
  from jsonb_array_elements(coalesce(p_rentals, '[]'::jsonb)) as pozycja;

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
  'Zapis Rezerwacji wraz z Wypożyczeniami w jednej transakcji, z pilnowaniem Puli sztuk.';

-- Rezerwacja powstaje wyłącznie przez Edge Function (ADR 0003), a ta łączy się
-- rolą serwisową. Klucz anonimowy i Użytkownik panelu nie mają tędy drogi.
revoke execute on function public.place_booking from public, anon, authenticated;
