-- Zarządzanie Rezerwacją przez link: co Osoba rezerwująca widzi pod swoim
-- adresem i jak sama zwalnia termin, dopóki nie jest za późno.
--
-- Token linku (`bookings.management_token`) i jego parametr adresu powstały
-- wraz z powiadomieniami — list z podsumowaniem musiał już je nieść. Tutaj
-- dochodzi to, czego ten link potrzebuje, żeby cokolwiek robić: przejście
-- Rezerwacji w stan „anulowana przez klienta" i kontakt do Strzelnicy dla
-- chwili, w której klient nie może już sam.

-- Kontakt, który Strzelnica podaje klientom. Odrębny od Adresu powiadomień:
-- tamten jest skrzynką obsługi i nie wychodzi publicznie, a ten jest właśnie
-- tym, co ma wyjść — po upływie Okna anulowania zostaje Osobie rezerwującej
-- telefon i nic więcej.
--
-- Puste znaczy Strzelnicę, która kontaktu jeszcze nie wpisała (ustawi go
-- w Panelu, ticket #22). Nie da się tego wymagać kolumną `not null`: Strzelnice
-- już istnieją, a wartość zmyślona domyślnie byłaby numerem, pod który klient
-- naprawdę zadzwoni.
alter table public.facilities
  add column contact_email text
    check (contact_email is null or length(btrim(contact_email)) > 0),
  add column contact_phone text
    check (contact_phone is null or length(btrim(contact_phone)) > 0);

comment on column public.facilities.contact_email is
  'Adres, który Strzelnica podaje klientom. Odrębny od Adresu powiadomień.';
comment on column public.facilities.contact_phone is
  'Telefon, który Strzelnica podaje klientom — kontakt po upływie Okna anulowania.';

-- Świadomie **bez** `grant select`: te kolumny czyta wyłącznie Edge Function
-- rolą serwisową i podaje je dalej razem z Rezerwacją, której dotyczą. Klucz
-- anonimowy nie ma po nie sięgać do `facilities` — kontakt bez Rezerwacji nie
-- jest niczyją odpowiedzią, a lista telefonów wszystkich Strzelnic tym mniej.
-- Zobacz `grant select (…)` w migracji powiadomień: kolumna dołożona do tej
-- tabeli jest odtąd domyślnie prywatna.

-- Kiedy Rezerwacja została anulowana albo odwołana. Jedna kolumna dla obu dróg,
-- bo mówi o tym samym: która to była chwila. **Kto** i **dlaczego** wynika ze
-- stanu, a powód odwołania przez Strzelnicę dojdzie osobno (ticket #15).
alter table public.bookings
  add column cancelled_at timestamptz;

comment on column public.bookings.cancelled_at is
  'Kiedy Rezerwacja przestała obowiązywać. Puste znaczy Rezerwację nieodwołaną.';

-- Anulowanie przez klienta. Jedyna droga, którą Rezerwacja przechodzi w stan
-- „anulowana przez klienta" — jak zapis i potwierdzenie, wyłącznie przez Edge
-- Function (spec: „Zapis Rezerwacji, jej potwierdzenie i anulowanie — wyłącznie
-- przez Edge Functions").
--
-- Chwila domknięcia Okna anulowania przychodzi **parametrem**, a nie liczy się
-- tutaj z `cancellation_window_hours`: reguła okna jest regułą domeny, mieszka
-- w `packages/shared` i jest tam pokryta testami, w tym na granicy. Do bazy
-- należy natomiast zegar — ten sam, którym mierzy się wygaśnięcie — bo zegar
-- środowiska brzegowego bywa innym zegarem, a granica ma być jedna.
--
-- Czego tu nie ma: blokady doradczej na Strzelnicę, którą biorą zapis
-- i potwierdzenie. Tam była konieczna, bo oba **zajmują** termin i muszą
-- widzieć skutek siebie nawzajem w ograniczeniu wyłączności. Anulowanie termin
-- wyłącznie zwalnia: przejście jednego wiersza pod warunkiem na jego stan,
-- rozstrzygane blokadą tego wiersza. Dwa anulowania tej samej Rezerwacji nie
-- wchodzą oba, a cudze zgłoszenie, które w tej samej chwili zobaczy termin
-- jeszcze zajęty, po prostu przyszło o sekundę za wcześnie.
create function public.cancel_booking(p_token text, p_deadline timestamptz)
returns table (final_status public.booking_status, just_cancelled boolean)
language plpgsql
-- Ścieżka wyszukiwania przypięta wprost: funkcja woła się rolą serwisową.
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
begin
  select b.id
    into v_booking_id
    from public.bookings b
   where b.management_token = p_token;

  -- Token, którego baza nie zna. Pusty wynik, a nie wyjątek: to odpowiedź
  -- o zgłoszeniu, nie awaria.
  if v_booking_id is null then
    return;
  end if;

  update public.bookings b
     set status = 'anulowana-przez-klienta',
         cancelled_at = now()
   where b.id = v_booking_id
     -- Anulować da się wyłącznie Rezerwację potwierdzoną. Oczekująca zniknie
     -- sama po Czasie na potwierdzenie, a reszta stanów terminu już nie trzyma.
     and b.status = 'potwierdzona'
     -- Granica należy do klienta: w ostatniej sekundzie okna anulowanie
     -- jeszcze wchodzi.
     and now() <= p_deadline;

  if found then
    return query select 'anulowana-przez-klienta'::public.booking_status, true;
  end if;

  -- Nie weszło. Stan wiersza mówi, dlaczego: „potwierdzona" znaczy okno już
  -- domknięte — bo tylko o nie ten `update` się rozbija — a każdy inny stan
  -- znaczy Rezerwację, której nie ma czego anulować. Nazywa to po polsku
  -- `cancellationOutcome` z `packages/shared`.
  return query
    select b.status, false
      from public.bookings b
     where b.id = v_booking_id;
end;
$$;

comment on function public.cancel_booking is
  'Anulowanie Rezerwacji linkiem klienta; zwraca jej stan i to, czy zmienił się właśnie teraz.';

revoke execute on function public.cancel_booking from public, anon, authenticated;
