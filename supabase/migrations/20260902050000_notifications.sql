-- Powiadomienia o Rezerwacji: co dostaje na piśmie Osoba rezerwująca i czym
-- Strzelnica dowiaduje się o nowej Rezerwacji bez zaglądania do Panelu.
--
-- Oba listy wychodzą dopiero po potwierdzeniu adresu, a nie po samym złożeniu.
-- Powód jest ten sam po obu stronach: Rezerwacja oczekująca bywa zmyślona,
-- więc podsumowanie wysłane od razu obiecywałoby termin, który za pół godziny
-- wróci do puli, a Strzelnica przygotowywałaby sprzęt na gościa, którego nie ma.

-- Adres, pod który idą powiadomienia Strzelnicy. Jej pole konfiguracyjne, nie
-- stała platformy: jedna Strzelnica czyta pocztę na recepcji, druga u kierownika.
--
-- Pusty znaczy Strzelnicę, która powiadomień nie chce — i jest to odpowiedź,
-- a nie brak konfiguracji. List do klienta nie zależy od tej kolumny.
alter table public.facilities
  add column notification_email text
    check (notification_email is null or length(btrim(notification_email)) > 0);

comment on column public.facilities.notification_email is
  'Adres, pod który Strzelnica dostaje powiadomienia o Rezerwacjach. Pusty znaczy: nie chce.';

-- Polityka RLS na `facilities` wpuszcza klucz anonimowy do każdego wiersza, bo
-- dane Strzelnicy są ofertą — ale jest polityką **wierszową** i o kolumnach nie
-- mówi nic. Adres skrzynki obsługi ofertą nie jest: to dana kontaktowa
-- pracownika, a publiczny klucz Widgetu nie ma czytać danych osobowych
-- (spec: „publiczny klucz w kodzie Widgetu nie pozwalał na odczyt danych
-- osobowych").
--
-- Prawa nadaje się więc kolumnami, a nie całą tabelą. Uprawnienie na tabelę
-- przesłania każde zawężenie kolumnowe, więc najpierw schodzi ono, a potem
-- wraca wypisane: dokładnie te kolumny, które czyta Widget — te same, co
-- w `FacilityRow`. Skutkiem ubocznym jest reguła warta samej zmiany: kolumna
-- dołożona do `facilities` przyszłą migracją jest domyślnie prywatna, więc
-- wystawienie jej publicznie wymaga świadomego zdania w SQL-u.
revoke select on public.facilities from anon, authenticated;

grant select (
  id,
  slug,
  name,
  timezone,
  booking_horizon_days,
  min_lead_minutes,
  cancellation_window_hours,
  instructor_pool,
  participation_rate_gr,
  instructor_rate_gr,
  allowed_origins
) on public.facilities to anon, authenticated;

-- Token linku do zarządzania Rezerwacją — odrębny od potwierdzającego, bo
-- odrębne są ich życia. Link potwierdzający działa raz i nie robi nic więcej;
-- ten otwiera Rezerwację na cały czas jej trwania i to nim Osoba rezerwująca
-- ją anuluje (tickety #12 i #15). Jeden token dla obu spraw znaczyłby, że
-- link zużyty przy potwierdzeniu wciąż otwiera cudzą Rezerwację, a link
-- przesłany dalej „żeby kolega zobaczył godzinę" pozwala ją odwołać.
--
-- Losuje go baza wartością domyślną, nie Edge Function jak token potwierdzający
-- (ADR 0007): tamten wkleja się do listu wysyłanego w tej samej chwili, co zapis,
-- a ten trafia do listu wysyłanego dopiero po potwierdzeniu — kiedy wiersz i tak
-- jest odczytywany z bazy. 32 bajty, czyli 256 bitów, tak samo jak tamten.
alter table public.bookings
  add column management_token text not null
    default encode(extensions.gen_random_bytes(32), 'hex');

comment on column public.bookings.management_token is
  'Token linku do zarządzania Rezerwacją; żyje tak długo, jak sama Rezerwacja.';

-- Token jest kluczem: dwa takie same znaczyłyby dwie Rezerwacje otwierane
-- jednym linkiem. Bez warunku częściowego — inaczej niż przy tokenie
-- potwierdzającym — bo ten ma każda Rezerwacja, także wpisana ręcznie w Panelu.
create unique index bookings_management_token_key
  on public.bookings (management_token);

-- `confirm_booking` odpowiada teraz także tym, **której** Rezerwacji dotyczy.
-- Bez tego Edge Function musiałaby odszukać ją po tokenie po raz drugi, żeby
-- złożyć podsumowanie — a drugi odczyt po tym samym kluczu jest tym samym
-- pytaniem zadanym dwa razy. Ciało bez zmian; Postgres nie umie dołożyć
-- kolumny do wyniku funkcji inaczej niż przez jej odtworzenie.
drop function public.confirm_booking(text);

create function public.confirm_booking(p_token text)
returns table (
  booking_id uuid,
  final_status public.booking_status,
  just_confirmed boolean
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_facility_id uuid;
begin
  select b.id, b.facility_id
    into v_booking_id, v_facility_id
    from public.bookings b
   where b.confirmation_token = p_token;

  -- Token, którego baza nie zna. Pusty wynik, a nie wyjątek: to odpowiedź
  -- o zgłoszeniu, nie awaria.
  if v_booking_id is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_facility_id::text)::bigint);
  -- Najpierw zegar, potem decyzja. Rezerwacja po terminie jest tu przenoszona
  -- w „wygasłą", więc `update` niżej po prostu jej nie znajdzie — warunek na
  -- czas nie musi się w nim powtarzać.
  perform public.expire_stale_bookings(v_facility_id);

  update public.bookings b
     set status = 'potwierdzona',
         confirmed_at = now()
   where b.id = v_booking_id
     and b.status = 'oczekujaca';

  -- Jednorazowość linku bierze się ze stanu, a nie z kasowania tokenu: drugie
  -- wejście trafia na Rezerwację już potwierdzoną i niczego nie zmienia, ale ma
  -- czym odpowiedzieć klientowi, że wszystko jest w porządku.
  if found then
    return query select v_booking_id, 'potwierdzona'::public.booking_status, true;
  end if;

  return query
    select b.id, b.status, false
      from public.bookings b
     where b.id = v_booking_id;
end;
$$;

comment on function public.confirm_booking is
  'Potwierdzenie adresu linkiem; zwraca Rezerwację, jej stan i to, czy zmienił się właśnie teraz.';

revoke execute on function public.confirm_booking from public, anon, authenticated;
