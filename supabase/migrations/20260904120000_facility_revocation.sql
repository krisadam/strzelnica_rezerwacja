-- Odwołanie Rezerwacji przez Strzelnicę: powód, przejście stanu i pierwszy
-- zapis wykonywany w imieniu konta Panelu.
--
-- Stan „odwolana-przez-strzelnice" i kolumna `cancelled_at` stoją w schemacie
-- od początku (migracja Rezerwacji i migracja anulowania przez klienta); tu
-- dochodzi to, czego odwołanie potrzebuje ponad tamto: powód i droga, którą
-- Rezerwacja w ten stan przechodzi.
--
-- Zwolnienia terminu, miejsca w Puli instruktorów i sztuk broni nie ma tu ani
-- jednym zdaniem i być nie może: ograniczenie wyłączności Osi obejmuje
-- wyłącznie Rezerwacje oczekujące i potwierdzone, a widoki zajętości filtrują
-- przez `booking_holds_term`. Termin wraca do puli przez samą zmianę stanu —
-- tak samo jak przy anulowaniu przez klienta.

-- Powód odwołania. Wymagany, i to jest tu regułą schematu, a nie uprzejmością
-- formularza: bez powodu klient dostaje list mówiący „odwołana" i telefon do
-- Strzelnicy, po który i tak sięgnie — a wtedy odwołanie w Panelu byłoby
-- zadaniem tej rozmowy, nie jej uniknięciem.
--
-- Kolumna dopuszcza puste, bo puste ma **każda** Rezerwacja nieodwołana.
-- Wymaganie wyraża drugi `check`: powód jest wtedy i tylko wtedy, gdy jest
-- odwołanie. Zapisane równością, a nie implikacją w jedną stronę, bo obie
-- strony są tu regułą — powód bez odwołania byłby notatką obsługi przy
-- Rezerwacji, która się odbędzie, a takiego pola ta tabela nie ma.
alter table public.bookings
  add column revocation_reason text,
  add constraint bookings_revocation_reason_not_blank
    check (revocation_reason is null or length(btrim(revocation_reason)) > 0),
  add constraint bookings_revoked_has_reason
    check ((status = 'odwolana-przez-strzelnice') = (revocation_reason is not null));

comment on column public.bookings.revocation_reason is
  'Powód odwołania Rezerwacji przez Strzelnicę. Puste znaczy Rezerwację nieodwołaną.';

-- Powód dochodzi do widoku Panelu, bo Rezerwacja odwołana zostaje w nim
-- widoczna ze swoim stanem — i stan bez powodu każe obsłudze dzwonić po
-- koleżance, która odwoływała. Kolumna dopisana wprost, na końcu: widok
-- wystawia dokładnie to, co ktoś świadomie do niego wpisał (ADR 0008), więc
-- `create or replace` powtarza tu całą jego definicję.
--
-- Uprawnień widok przy tym nie traci i nie ma ich tu czego nadawać na nowo:
-- `create or replace view` zachowuje `revoke all` i `grant select` z migracji
-- Panelu. Gdyby widok trzeba było **usunąć** i postawić od zera — bo zmieniła
-- się nazwa albo typ istniejącej kolumny — obie te linijki musiałyby tu wrócić,
-- a bez nich nowa relacja wstałaby z prawami, które Supabase nadaje sam.
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
    b.revocation_reason
  from public.bookings b
  where b.facility_id = public.panel_facility();

comment on view public.panel_bookings is
  'Rezerwacje Strzelnicy zalogowanego Użytkownika panelu, bez tokenów Osoby rezerwującej.';

-- Strzelnica wskazanego konta Panelu — to samo pytanie, co `panel_facility()`,
-- zadane o konto podane wprost, a nie o zalogowane. Jedno źródło odpowiedzi na
-- „czyja to Strzelnica": `panel_facility()` staje się odtąd jego zawężeniem do
-- pytającego, a nie drugą kopią tego samego zapytania. Dwie kopie rozjechałyby
-- się przy pierwszej poprawce, a rozjazd w tym miejscu znaczyłby Rezerwację
-- jednej Strzelnicy odwołaną ręką drugiej.
--
-- Potrzebne, bo odwołania nie zamawia przeglądarka, tylko Edge Function rolą
-- serwisową (ADR 0003) — a ta żadnym kontem nie jest, więc `auth.uid()` jest
-- przy niej puste. Konto, w imieniu którego prosi, podaje więc parametrem,
-- potwierdziwszy wcześniej jego token w GoTrue (ADR 0010).
--
-- `security definer` z tego samego powodu, co przy `panel_facility()`: pytana
-- jest tabela, którą RLS zasłania samą sobą. Puste wejście znaczy pustą
-- odpowiedź — brak konta i konto bez powiązania są tu jednym, i oba czynią
-- każdy warunek z jej udziałem fałszem.
create function public.panel_facility_of(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.facility_id
    from public.panel_users u
   where u.user_id = p_user_id;
$$;

comment on function public.panel_facility_of is
  'Strzelnica wskazanego Użytkownika panelu; puste znaczy konto bez dostępu do Panelu.';

-- Prawo wykonania wyłącznie dla roli serwisowej: parametrem tej funkcji jest
-- **cudze** konto, więc pytanie o nie należy do Edge Functions, a nie do
-- przeglądarki. Zalogowane konto pyta o siebie i ma do tego `panel_facility()`.
revoke execute on function public.panel_facility_of from public, anon, authenticated;

-- Strzelnica **zalogowanego** konta liczona odtąd tą jedną funkcją. Warunek
-- polityk i widoku nie zmienia się ani o literę; zmienia się to, że pytanie
-- „czyja to Strzelnica" stoi w bazie raz.
create or replace function public.panel_facility()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.panel_facility_of(auth.uid());
$$;

-- Odwołanie Rezerwacji przez Strzelnicę. Czwarta — obok zapisu, potwierdzenia
-- i anulowania — droga, którą Rezerwacja zmienia stan, i pierwsza, o którą
-- prosi **konto Panelu**, a nie link z e-maila (ADR 0010).
--
-- Wołana rolą serwisową, jak wszystkie trzy tamte: Rezerwacja zmienia stan
-- wyłącznie przez Edge Functions (ADR 0003), bo tam dzieje się walidacja
-- i wysyłka poczty. Prawo wykonania nadane kontu Panelu otwierałoby drogę
-- z przeglądarki wprost tutaj — a wtedy Rezerwacja dałaby się odwołać bez
-- listu do klienta, czyli bez tego jednego, po co odwołanie w ogóle istnieje.
--
-- Granica Strzelnicy zostaje jednak w bazie: konto, w imieniu którego prosi
-- Edge Function, przychodzi parametrem, a o jego Strzelnicę pyta
-- `panel_facility_of`. Numer Rezerwacji podstawiony z palca nie otwiera więc
-- niczego, choć w żądaniu stoi wprost.
--
-- Okna anulowania ta droga nie zna i znać nie ma: ono jest granicą dla
-- klienta, a Strzelnica odwołuje właśnie wtedy, gdy klient sam już nie może —
-- na godzinę przed terminem, bo pękła szyba. Zamiast okna jest powód.
--
-- Czego tu nie ma, tak jak przy `cancel_booking`: blokady doradczej na
-- Strzelnicę. Odwołanie termin wyłącznie zwalnia, więc jest przejściem jednego
-- wiersza pod warunkiem na jego stan, rozstrzyganym blokadą tego wiersza. Dwa
-- odwołania tej samej Rezerwacji nie wchodzą oba.
create function public.revoke_booking(
  p_booking_id uuid,
  p_reason text,
  p_user_id uuid
)
returns table (final_status public.booking_status, just_revoked boolean)
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
   where b.id = p_booking_id
     -- Rezerwacja Strzelnicy tego konta — a o to, czyja to Strzelnica, pyta
     -- się `panel_users`, nie wołający.
     and b.facility_id = public.panel_facility_of(p_user_id);

  -- Rezerwacja, której ta Strzelnica nie ma: cudza, nieistniejąca albo należąca
  -- do konta bez powiązania. Pusty wynik, a nie wyjątek — i jeden dla
  -- wszystkich trzech przypadków: rozróżnienie mówiłoby pytającemu
  -- o Rezerwacjach, których nie ma prawa widzieć.
  if v_booking_id is null then
    return;
  end if;

  update public.bookings b
     set status = 'odwolana-przez-strzelnice',
         -- Powód pusty nie ma tu osobnej odmowy: zatrzyma go `check` na
         -- kolumnie. Pyta o niego Panel, zanim pokaże przycisk — tą samą
         -- czystą funkcją (`revocationProblem`), którą serwer sprawdza go po
         -- raz drugi.
         revocation_reason = btrim(p_reason),
         -- Ta sama kolumna, co przy anulowaniu przez klienta: mówi o tym samym
         -- — która to była chwila. **Kto** i **dlaczego** wynika ze stanu.
         cancelled_at = now()
   where b.id = v_booking_id
     -- Odwołać da się wyłącznie Rezerwację potwierdzoną. Oczekująca zniknie
     -- sama po Czasie na potwierdzenie, a listu z powodem nie ma gdzie wysłać:
     -- adres nie został potwierdzony i bywa zmyślony. Reszta stanów terminu
     -- już nie trzyma. Ta sama granica stoi w `revocable`.
     and b.status = 'potwierdzona';

  if found then
    return query select 'odwolana-przez-strzelnice'::public.booking_status, true;
    -- Wyjście wprost, bo `return query` samo z niego nie wychodzi: bez tego
    -- zdania funkcja dokłada niżej **drugi** wiersz o tej samej Rezerwacji,
    -- mówiący „nie weszło". Wołający czytający pierwszy wiersz nie zauważyłby
    -- tego nigdy, a czytający wszystkie zobaczyłby dwie sprzeczne odpowiedzi.
    return;
  end if;

  -- Nie weszło. Stan wiersza mówi, dlaczego — i „odwolana-przez-strzelnice"
  -- znaczy tu odwołanie, które ktoś wykonał przed nami: drugie stanowisko
  -- obsługi albo drugie kliknięcie. Nazywa to po polsku `revocationOutcome`
  -- z `packages/shared`.
  return query
    select b.status, false
      from public.bookings b
     where b.id = v_booking_id;
end;
$$;

comment on function public.revoke_booking is
  'Odwołanie Rezerwacji przez Strzelnicę; zwraca jej stan i to, czy zmienił się właśnie teraz.';

-- Prawo wykonania schodzi obu publicznym rolom, tak samo jak przy
-- `place_booking`, `confirm_booking` i `cancel_booking`. Konto Panelu **ma**
-- token, którym baza wpuszcza je do widoku Rezerwacji — i właśnie dlatego nie
-- może mieć prawa do tej funkcji: żądanie sklejone w przeglądarce odwołałoby
-- Rezerwację bez listu do klienta. Zostaje jedna droga, ta z walidacją
-- i pocztą (ADR 0003).
revoke execute on function public.revoke_booking from public, anon, authenticated;
