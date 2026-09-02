-- Potwierdzenie adresu i wygasanie Rezerwacji.
--
-- Do tej pory Rezerwacja powstawała od razu potwierdzona, więc adres e-mail
-- był deklaracją niesprawdzalną: zmyślony blokował sobotę tak samo skutecznie,
-- jak prawdziwy. Odtąd Rezerwacja powstaje oczekująca, trzyma termin
-- na wyłączność jak każda inna, ale tylko do chwili wskazanej w `expires_at`.
--
-- Nie ma tu żadnego zadania cyklicznego i nie będzie w tej fazie (spec: „Brak
-- zadań cyklicznych"). Wygaśnięcie jest więc **leniwe**: termin przestaje być
-- czyjś dokładnie o swojej godzinie w oczach każdego, kto na niego patrzy
-- (widoki zajętości), a wiersz zmienia stan przy pierwszym zapisie, który
-- o ten termin zahacza (`expire_stale_bookings` pod blokadą doradczą). Dwie
-- drogi, bo dwie różne potrzeby: odczyt ma być natychmiast prawdziwy, a zapis
-- musi zdjąć wiersz z ograniczenia wyłączności — ograniczenie nie umie pytać
-- o zegar. Zobacz ADR 0006.

alter table public.bookings
  -- Token losowy, a nie identyfikator Rezerwacji i nie podpis (ADR 0007):
  -- identyfikator wraca do przeglądarki na potwierdzeniu, więc link liczony
  -- z niego dałby się podrobić dla cudzej Rezerwacji. Losuje go Edge Function,
  -- baza tylko przechowuje.
  add column confirmation_token text,
  -- Do kiedy Rezerwacja oczekująca trzyma termin. Liczone zegarem bazy przy
  -- zapisie — jednym zegarem, tym samym, którym mierzy się je później.
  add column expires_at timestamptz,
  add column confirmed_at timestamptz,
  -- Rezerwacja oczekująca bez terminu wygaśnięcia trzymałaby Oś wiecznie,
  -- a bez tokenu nie dałaby się potwierdzić. Jedno i drugie byłoby cichym
  -- zablokowaniem soboty.
  add constraint bookings_pending_expires
    check (status <> 'oczekujaca' or (expires_at is not null and confirmation_token is not null));

comment on column public.bookings.confirmation_token is
  'Token z linku potwierdzającego adres; jedyna droga do potwierdzenia Rezerwacji.';
comment on column public.bookings.expires_at is
  'Do kiedy Rezerwacja oczekująca trzyma termin. Po tej chwili termin wraca do puli.';
comment on column public.bookings.confirmed_at is
  'Kiedy Osoba rezerwująca potwierdziła adres. Puste znaczy: jeszcze nie.';

-- Token jest kluczem, więc dwa takie same znaczyłyby dwie Rezerwacje otwierane
-- jednym linkiem. Indeks częściowy, bo Rezerwacje wpisane ręcznie w Panelu
-- (ticket #43) tokenu mieć nie będą, a `null` nie jest wartością, którą warto
-- pilnować.
create unique index bookings_confirmation_token_key
  on public.bookings (confirmation_token)
  where confirmation_token is not null;

-- Czy Rezerwacja trzyma termin. Jedna kopia reguły dla obu publicznych widoków
-- zajętości i dla sprawdzenia Puli sztuk broni — trzy kopie rozjechałyby się
-- przy pierwszej poprawce, a rozjazd znaczyłby termin wolny w kalendarzu
-- i zajęty przy zapisie.
--
-- `stable`, nie `immutable`: odpowiedź zależy od `now()`. Dlatego właśnie nie
-- da się jej użyć w ograniczeniu wykluczającym — ograniczenia przyjmują
-- wyłącznie wyrażenia niezmienne.
create function public.booking_holds_term(
  p_status public.booking_status,
  p_expires_at timestamptz
) returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_status = 'potwierdzona'
      or (p_status = 'oczekujaca' and p_expires_at > now());
$$;

comment on function public.booking_holds_term is
  'Czy Rezerwacja w tym stanie trzyma jeszcze termin na wyłączność.';

-- Prawo wykonania zostaje przy `public`: przez tę funkcję przechodzą oba
-- widoki czytane kluczem anonimowym. Nie wystawia niczego — bierze stan
-- i datę podane przez wołającego i odpowiada „tak" albo „nie".

-- Zajętość Osi widziana przez kalendarz. Rezerwacja oczekująca, której czas
-- minął, znika stąd co do sekundy — bez czekania, aż ktokolwiek cokolwiek
-- zapisze. To jest owo „wygasa i zwalnia termin" od strony Osoby rezerwującej.
create or replace view public.lane_occupancy as
  select
    facility_id,
    lane_id,
    starts_at,
    ends_at,
    with_instructor
  from public.bookings
  where public.booking_holds_term(status, expires_at);

-- Sztuki broni tak samo: Rezerwacja, która przestała trzymać termin, przestaje
-- też trzymać zamówione sztuki. Inaczej wygasła Rezerwacja oddawałaby Oś,
-- a wciąż odbierała ostatniego „Glocka".
create or replace view public.weapon_occupancy as
  select
    b.facility_id,
    r.weapon_type_id,
    r.quantity,
    b.starts_at,
    b.ends_at
  from public.weapon_rentals r
  join public.bookings b on b.id = r.booking_id
  where public.booking_holds_term(b.status, b.expires_at);

-- Przeniesienie wygasłych Rezerwacji Strzelnicy w stan „wygasła". Widoki nie
-- potrzebują tego kroku — one liczą zegarem — ale ograniczenie wyłączności
-- Osi potrzebuje: dopóki wiersz stoi jako „oczekująca", zajmuje Oś w indeksie
-- i nie wpuści nikogo na ten termin.
--
-- Wołane wyłącznie pod blokadą doradczą na Strzelnicę, tuż przed zapisem,
-- który o ten termin zahacza. Zamiatanie całej bazy raz na dobę wymagałoby
-- schedulera, którego w tej fazie nie ma — a to zamiata dokładnie tyle, ile
-- trzeba, i dokładnie wtedy, kiedy to komuś przeszkadza.
create function public.expire_stale_bookings(p_facility_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_expired integer;
begin
  update public.bookings
     set status = 'wygasla'
   where facility_id = p_facility_id
     and status = 'oczekujaca'
     and expires_at <= now();

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

comment on function public.expire_stale_bookings is
  'Przenosi niepotwierdzone Rezerwacje Strzelnicy po terminie w stan „wygasła".';

revoke execute on function public.expire_stale_bookings from public, anon, authenticated;

-- Potwierdzenie adresu. Cała zmiana stanu w jednym miejscu i pod tą samą
-- blokadą, co zapis: gdyby potwierdzenie i cudze zgłoszenie na ten sam termin
-- spotkały się w tej samej chwili, jedno musi zobaczyć skutek drugiego.
--
-- Jednorazowość linku bierze się ze stanu, a nie z kasowania tokenu: drugie
-- wejście trafia na Rezerwację już potwierdzoną i niczego nie zmienia, ale ma
-- czym odpowiedzieć klientowi, że wszystko jest w porządku. Skasowany token
-- kazałby na drugie kliknięcie odpowiedzieć „nie znamy tego linku" — zdaniem
-- fałszywym i niepotrzebnie strasznym.
create function public.confirm_booking(p_token text)
returns table (final_status public.booking_status, just_confirmed boolean)
language plpgsql
-- Ścieżka wyszukiwania przypięta wprost: funkcja woła się rolą serwisową.
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

  if found then
    return query select 'potwierdzona'::public.booking_status, true;
  end if;

  return query
    select b.status, false
      from public.bookings b
     where b.id = v_booking_id;
end;
$$;

comment on function public.confirm_booking is
  'Potwierdzenie adresu linkiem; zwraca stan Rezerwacji i to, czy zmienił się właśnie teraz.';

-- Potwierdzenie idzie wyłącznie przez Edge Function (spec: „Zapis Rezerwacji,
-- jej potwierdzenie i anulowanie — wyłącznie przez Edge Functions").
revoke execute on function public.confirm_booking from public, anon, authenticated;

-- Poczta wysłana albo przechwycona. W środowisku bez dostawcy (praca lokalna,
-- CI) Edge Function nie ma czym wysyłać, więc zapisuje wiadomość tutaj —
-- i tędy testy przeglądarkowe dostają link, którego inaczej nie zobaczyłyby
-- wcale. Spec: „E-maile weryfikowane przez przechwytywanie wysyłki
-- w środowisku testowym".
--
-- Wiadomość niesie dane osobowe i treść linku, więc tabela zachowuje się jak
-- `bookings`: RLS włączone, zero polityk. Klucz anonimowy nie czyta z niej nic.
create table public.mail_outbox (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  -- Rezerwacja, której wiadomość dotyczy. Może jej nie być — poczta, która
  -- nie mówi o konkretnej Rezerwacji, przyjdzie wraz z powiadomieniami
  -- dla Strzelnicy (ticket #11).
  booking_id uuid references public.bookings (id) on delete cascade,
  recipient text not null check (length(btrim(recipient)) > 0),
  subject text not null,
  body_text text not null,
  body_html text not null,
  created_at timestamptz not null default now()
);

comment on table public.mail_outbox is
  'Poczta przechwycona zamiast wysłanej — środowisko bez dostawcy zapisuje ją tutaj.';

create index mail_outbox_booking_idx on public.mail_outbox (booking_id);

alter table public.mail_outbox enable row level security;
