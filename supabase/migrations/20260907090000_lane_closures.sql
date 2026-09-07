-- Blokada: wyłączenie Osi z rezerwacji na wskazany czas — serwis, zawody,
-- przerwa techniczna.
--
-- Osobna tabela, a nie Rezerwacja bez klienta (ADR 0011): `bookings` wymaga
-- kontaktu, liczby Uczestników, Kwoty i stawek, a Blokada nie ma ani jednej
-- z tych rzeczy. Kolumny dopuszczalnie puste otworzyłyby drogę do Rezerwacji
-- bez nazwiska, a stan „blokada" w cyklu życia Rezerwacji dołożyłby wartość,
-- której nie dotyczy ani potwierdzenie adresu, ani anulowanie, ani odwołanie —
-- czyli wszystko, co ten cykl życia robi.
--
-- Dla dostępności Blokada jest przy tym **nierozróżnialna od Rezerwacji**:
-- zajmuje Oś na wyłączność. Stąd dwie rzeczy niżej — widok `lane_occupancy`
-- wystawia odtąd jedno i drugie, a wyłączność między tabelami pilnują dwa
-- wyzwalacze, po jednym z każdej strony.
--
-- Powód jest częścią Blokady, a nie notatką obok: Oś wyłączona ze sprzedaży
-- bez powodu każe kolejnej zmianie obsługi dzwonić po koleżankę, żeby dowiedzieć
-- się, czy wolno ją włączyć. Ta sama reguła, co przy Odwołaniu — tylko
-- czytelnikiem jest tu Strzelnica, a nie klient, więc powodu nie ma czym
-- wysłać i nie ma po co.

create table public.lane_closures (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  lane_id uuid not null,
  -- Dowolny zakres czasu, nie Blok z rozkładu: obsługa zamyka Oś na czas
  -- serwisu, a nie na wielokrotność Slotu. Blokada bywa też dłuższa od doby —
  -- zawody trwają weekend.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Oś i Strzelnica muszą się zgadzać, tak samo jak w rozkładzie Bloków
  -- i w Rezerwacjach.
  constraint lane_closures_lane_fkey
    foreign key (lane_id, facility_id)
    references public.lanes (id, facility_id)
    on delete cascade
);

comment on table public.lane_closures is
  'Blokada — wyłączenie Osi z rezerwacji na wskazany czas, wprowadzane przez Panel.';

comment on column public.lane_closures.reason is
  'Powód wyłączenia Osi. Czyta go wyłącznie obsługa — klient widzi sam brak terminu.';

-- Wyłączność Osi między Blokadami — jak przy Rezerwacjach i tym samym
-- narzędziem. Bez warunku na stan, bo Blokada stanów nie ma: jest albo jej nie
-- ma. Druga Blokada na tym samym czasie niczego by nie dodała, a odmowa mówi
-- obsłudze, że ta Oś jest już wyłączona i przez kogo innego niż ona myśli.
alter table public.lane_closures
  add constraint lane_closures_lane_is_exclusive
  exclude using gist (
    lane_id with =,
    tstzrange(starts_at, ends_at) with &&
  );

create index lane_closures_facility_starts_idx
  on public.lane_closures (facility_id, starts_at);

alter table public.lane_closures enable row level security;

-- Odczyt dla konta Panelu, zawężony jego Strzelnicą — tym samym warunkiem, co
-- reszta jej wierszy (ADR 0009).
create policy "Użytkownik panelu widzi swoje Blokady"
  on public.lane_closures for select
  to authenticated
  using (facility_id = (select public.panel_facility()));

-- Klucz anonimowy nie dostaje ani polityki, ani prawa — i jest to decyzja, nie
-- przeoczenie. Widget ma widzieć **skutek** Blokady, czyli zajęty termin, a nie
-- ją samą: powód jest sprawą wewnętrzną Strzelnicy („Serwis po awarii" nie jest
-- zdaniem do klienta), a Zajętość i tak wychodzi do niego widokiem
-- `lane_occupancy` niżej. Prawa zapisu nie ma tu żadna publiczna rola, bo
-- domyślne prawa zeszły w migracji izolacji — nowa tabela wstaje zamknięta.
grant select on public.lane_closures to authenticated;

-- Zajętość Osi widziana przez kalendarz — odtąd Rezerwacje **i** Blokady.
-- „Dla dostępności nierozróżnialne" jest tu wykonane dosłownie: Osoba
-- rezerwująca dostaje z jednego i z drugiego to samo, czyli Oś i zakres czasu,
-- i nie ma czym ich rozróżnić. Terminy Osi wyłączonej znikają jej z kalendarza
-- w tej samej chwili, w której Blokada trafia do tabeli — bez czekania na
-- cokolwiek.
--
-- Blokada nie zajmuje przy tym miejsca w Puli instruktorów, więc niesie
-- `with_instructor` fałszywe: nie ma przy niej nikogo do nadzorowania, a Oś
-- zamknięta na serwis nie ma odbierać Instruktora Rezerwacji na Osi obok.
--
-- Ubocznie widok przestaje być zapisywalny sam z siebie: `union all` czyni go
-- oknem tylko do odczytu na własność, a nie na `revoke`. Prawa i tak zostają
-- odebrane z migracji Panelu — `create or replace view` ich nie rusza.
create or replace view public.lane_occupancy as
  select
    facility_id,
    lane_id,
    starts_at,
    ends_at,
    with_instructor
  from public.bookings
  where public.booking_holds_term(status, expires_at)
  union all
  select
    facility_id,
    lane_id,
    starts_at,
    ends_at,
    false
  from public.lane_closures;

comment on view public.lane_occupancy is
  'Zajętość Osi bez danych osobowych — Rezerwacje i Blokady, jednym kształtem.';

-- Wyłączność Osi **między** tabelami. Ograniczenie wykluczające obejmuje jedną
-- tabelę i inaczej być nie może, więc tę samą obietnicę składają tu dwa
-- wyzwalacze — po jednym z każdej strony, żeby żadna z dwóch dróg zapisu nie
-- miała własnej reguły. Warunek nakładania się jest w nich trzecim wyrażeniem
-- tej samej reguły, co `overlaps` w `packages/shared` i co
-- `bookings_lane_is_exclusive`: zakres domknięty od początku, otwarty od końca.
--
-- Wyzwalacz, a nie sprawdzenie w `place_booking` i `place_closure`: reguła
-- należy do tabeli, więc obowiązuje każdą drogę zapisu — także seed, także
-- ręczny wpis Rezerwacji w Panelu (ticket #17), który dopiero powstanie.
--
-- Wyścigu dwóch równoczesnych zapisów wyzwalacz sam nie rozstrzyga: czytając
-- w swojej transakcji, nie widzi cudzego wiersza jeszcze niezatwierdzonego.
-- Rozstrzyga go blokada doradcza na Strzelnicę, którą bierze i `place_booking`,
-- i `place_closure` — a innej drogi zapisu z zewnątrz nie ma (ADR 0003).
--
-- `security definer`, bo pytana jest tabela pod RLS: sprawdzenie, które
-- polityka zasłoniłaby choćby częściowo, byłoby sprawdzeniem, które przepuszcza.
create function public.reject_booking_over_closure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.lane_closures c
    where c.lane_id = new.lane_id
      and c.starts_at < new.ends_at
      and c.ends_at > new.starts_at
  ) then
    raise exception 'Oś jest w tym czasie wyłączona z rezerwacji.'
      using errcode = 'LC001';
  end if;

  return new;
end;
$$;

comment on function public.reject_booking_over_closure is
  'Nie wpuszcza Rezerwacji na czas objęty Blokadą tej samej Osi.';

-- Wyzwalacz obejmuje wyłącznie Rezerwacje trzymające termin i liczy to tą samą
-- funkcją, co widoki zajętości: Rezerwacja anulowana, odwołana albo wygasła
-- Osi nie zajmuje, więc Blokada jej nie dotyczy. Zmiana stanu na „wygasła"
-- przechodzi tędy bez sprawdzenia i o to chodzi — inaczej zamiatanie wygasłych
-- padałoby na Osi, którą ktoś w międzyczasie wyłączył.
--
-- Jedynym przejściem **w** stan trzymający termin jest potwierdzenie adresu,
-- a ono na Blokadę zahaczyć nie może: `confirm_booking` bierze tę samą blokadę
-- doradczą i zamiata wygasłe przed swoim `update`, a Blokada nie weszłaby na
-- Rezerwację, która termin trzymała. Wyzwalacz stoi tu więc nie dla tej drogi,
-- tylko dla każdej przyszłej, która o tym rozumowaniu nie będzie wiedziała.
create trigger bookings_free_of_closures
  before insert or update of lane_id, starts_at, ends_at, status
  on public.bookings
  for each row
  when (public.booking_holds_term(new.status, new.expires_at))
  execute function public.reject_booking_over_closure();

create function public.reject_closure_over_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.bookings b
    where b.lane_id = new.lane_id
      and public.booking_holds_term(b.status, b.expires_at)
      and b.starts_at < new.ends_at
      and b.ends_at > new.starts_at
  ) then
    -- Odmowa, a nie ciche zdjęcie Rezerwacji: termin jest czyjś, a klient ma
    -- się o jego odwołaniu dowiedzieć listem z powodem (ticket #15). Blokada
    -- wchodzi po odwołaniu, nie zamiast niego.
    raise exception 'Termin jest zajęty przez Rezerwację.'
      using errcode = 'LC001';
  end if;

  return new;
end;
$$;

comment on function public.reject_closure_over_booking is
  'Nie wpuszcza Blokady na czas zajęty przez Rezerwację trzymającą termin.';

create trigger lane_closures_free_of_bookings
  before insert or update of lane_id, starts_at, ends_at
  on public.lane_closures
  for each row
  execute function public.reject_closure_over_booking();

-- Zapis Blokady. Droga jedna i ta sama, co przy Rezerwacji: Edge Function rolą
-- serwisową (ADR 0003), bo prawa zapisu nie ma żadna publiczna rola, a granica
-- Strzelnicy zostaje w bazie (ADR 0010). Konto, w imieniu którego prosi
-- funkcja, przychodzi parametrem — o jego Strzelnicę pyta `panel_facility_of`,
-- więc identyfikator Osi podstawiony z palca nie otwiera niczego, choć
-- w żądaniu stoi wprost.
--
-- Czego tu nie ma: sprawdzenia kolizji. Pilnuje jej wyzwalacz wyżej, bo należy
-- do tabeli, a nie do tej jednej drogi. Zostaje blokada doradcza — ta sama, co
-- w `place_booking` — bo dopiero ona ustawia oba zapisy w kolejkę.
create function public.place_closure(
  p_lane_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text,
  p_user_id uuid
) returns uuid
language plpgsql
-- Ścieżka wyszukiwania przypięta wprost: funkcja woła się rolą serwisową.
set search_path = public, pg_temp
as $$
declare
  v_facility_id uuid;
  v_closure_id uuid;
begin
  v_facility_id := public.panel_facility_of(p_user_id);
  -- Konto bez powiązania ze Strzelnicą nie ma czego blokować. Pusto, a nie
  -- wyjątek — tak samo jak przy odwołaniu Rezerwacji, i z tego samego powodu:
  -- rozróżnienie mówiłoby pytającemu o Osiach, których nie ma prawa widzieć.
  if v_facility_id is null then
    return null;
  end if;

  -- Oś tej Strzelnicy — albo pusto. Klucz obcy złożony zatrzymałby obcą Oś
  -- i tak, ale jako błąd serwera, a nie odpowiedź o żądaniu.
  perform 1
     from public.lanes l
    where l.id = p_lane_id
      and l.facility_id = v_facility_id;
  if not found then
    return null;
  end if;

  -- Zgłoszenia jednej Strzelnicy idą pojedynczo. Bez tego Blokada i Rezerwacja
  -- na ten sam termin przechodzą oba sprawdzenia i wchodzą obie: żadna nie
  -- widzi cudzego wiersza, dopóki tamten nie zatwierdzi transakcji.
  perform pg_advisory_xact_lock(hashtext(v_facility_id::text)::bigint);

  -- Termin trzymany przez Rezerwację, której czas minął, jest wolny — ale
  -- wyzwalacz niżej dowie się o tym dopiero stąd. Bez tego Blokada odbijałaby
  -- się od Rezerwacji oczekującej, której Widget już nie pokazuje.
  perform public.expire_stale_bookings(v_facility_id);

  insert into public.lane_closures (facility_id, lane_id, starts_at, ends_at, reason)
  values (v_facility_id, p_lane_id, p_starts_at, p_ends_at, btrim(p_reason))
  returning id into v_closure_id;

  return v_closure_id;
end;
$$;

comment on function public.place_closure is
  'Zapis Blokady Osi w imieniu konta Panelu; puste znaczy Oś nie tej Strzelnicy.';

-- Prawo wykonania schodzi obu publicznym rolom, tak samo jak przy
-- `place_booking` i `revoke_booking`: Blokada powstaje wyłącznie przez Edge
-- Function, bo tam sprawdza się, kto prosi (ADR 0003, ADR 0010).
revoke execute on function public.place_closure from public, anon, authenticated;
