-- Jedna Strzelnica do pracy lokalnej: dwie Osie, tygodniowy rozkład Bloków,
-- godziny otwarcia i jeden wyjątek kalendarzowy. Rozkład jest tygodniowy,
-- więc pokrywa 30 dni w przód i każde kolejne — bez przepisywania seeda.
-- Cennik wypisany wprost i w okrągłych stawkach, żeby rozbicie Kwoty
-- w Widgecie dawało się przeczytać bez kalkulatora. Wszystko w groszach.

-- Reguły czasowe wypisane wprost, choć równe wartościom domyślnym: grafik
-- demo ma pokazywać, co robi horyzont i wyprzedzenie, więc muszą być widoczne
-- w danych, a nie tylko w schemacie.
-- Dozwolona domena osadzenia wskazuje stronę demonstracyjną z `apps/widget/demo`,
-- podawaną lokalnie na porcie 5175. Testy przeglądarkowe podają tę samą stronę
-- także spod portu 5176 — spoza listy — żeby sprawdzić, że przeglądarka blokuje
-- osadzenie na obcej domenie.
--
-- Pula instruktorów wynosi jeden, żeby grafik demo pokazywał także jej
-- wyczerpanie: Rezerwacja niżej zabiera jedynego Instruktora, więc ten sam
-- czas na drugiej Osi zostaje wolny dla Osoby rezerwującej z Pozwoleniem
-- i niedostępny dla tej bez.
insert into public.facilities (
  id, slug, name, booking_horizon_days, min_lead_minutes, cancellation_window_hours,
  allowed_origins, instructor_pool, participation_rate_gr, instructor_rate_gr,
  notification_email, contact_email, contact_phone
)
values (
  '00000000-0000-0000-0000-000000000001',
  'strzelnica-demo',
  'Strzelnica Demo',
  30,
  120,
  24,
  '{http://localhost:5175}',
  1,
  -- 30 zł za każdego Uczestnika poza pierwszym, 80 zł za Instruktora.
  3000,
  8000,
  -- Adres powiadomień: tu Strzelnica dowiaduje się o nowej Rezerwacji.
  'recepcja@strzelnica-demo.example.pl',
  -- Kontakt podawany klientom — inny niż skrzynka obsługi, bo to on wychodzi
  -- na ekran po upływie Okna anulowania.
  'kontakt@strzelnica-demo.example.pl',
  '+48 123 456 789'
)
on conflict (id) do nothing;

-- Stawki za Blok celowo różne: stawka jest własnością Osi, nie Strzelnicy,
-- a Osoba rezerwująca ma to zobaczyć w Kwocie po przełączeniu Osi.
insert into public.lanes (id, facility_id, name, capacity, block_rate_gr)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000001',
    'Oś pistoletowa nr 1',
    4,
    12000
  ),
  (
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-000000000001',
    'Oś karabinowa nr 2',
    2,
    15000
  )
on conflict (id) do nothing;

-- Sobota kończy się o 01:00 następnego dnia (1500 minut), żeby zmieścić Blok
-- przecinający granicę doby. Poniedziałek–piątek 10:00–22:00, niedziela
-- 09:00–20:00.
insert into public.opening_hours (facility_id, weekday, opens_minute, closes_minute)
values
  ('00000000-0000-0000-0000-000000000001', 1, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 2, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 3, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 4, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 5, 600, 1320),
  ('00000000-0000-0000-0000-000000000001', 6, 540, 1500),
  ('00000000-0000-0000-0000-000000000001', 7, 540, 1200)
on conflict (facility_id, weekday) do nothing;

-- Oś pistoletowa: Bloki dwugodzinne co 150 minut (30 minut przerwy między
-- Rezerwacjami wynika z odstępu w rozkładzie, nie z osobnej reguły).
insert into public.block_schedules (facility_id, lane_id, weekday, start_minute, duration_minutes)
select
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  weekday,
  start_minute,
  120
from generate_series(1, 5) as weekday
cross join unnest(array[600, 750, 900, 1050, 1200]) as start_minute
on conflict (lane_id, weekday, start_minute) do nothing;

insert into public.block_schedules (facility_id, lane_id, weekday, start_minute, duration_minutes)
values
  -- Sobota, w tym Blok 23:00–01:00 przechodzący na niedzielę.
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 540, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 690, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 840, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 990, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 1140, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 6, 1380, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 7, 540, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 7, 690, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 7, 840, 120),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 7, 990, 120)
on conflict (lane_id, weekday, start_minute) do nothing;

-- Oś karabinowa ma własny rytm dnia i w niedzielę nie pracuje wcale — dowód,
-- że rozkład jest własnością Osi, nie Strzelnicy.
insert into public.block_schedules (facility_id, lane_id, weekday, start_minute, duration_minutes)
select
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a2',
  weekday,
  start_minute,
  150
from generate_series(1, 5) as weekday
cross join unnest(array[600, 780, 960, 1140]) as start_minute
on conflict (lane_id, weekday, start_minute) do nothing;

insert into public.block_schedules (facility_id, lane_id, weekday, start_minute, duration_minutes)
select
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a2',
  6,
  start_minute,
  150
from unnest(array[540, 720, 900, 1080]) as start_minute
on conflict (lane_id, weekday, start_minute) do nothing;

-- Dzień zamknięty w zasięgu kalendarza Widgetu, liczony od dnia seeda.
insert into public.calendar_exceptions (facility_id, closed_on, reason)
values (
  '00000000-0000-0000-0000-000000000001',
  current_date + 10,
  'Zawody klubowe'
)
on conflict (facility_id, closed_on) do nothing;

-- Jedna Rezerwacja, żeby kalendarz demo pokazywał także termin zajęty, a nie
-- wyłącznie wolne. Celuje w pierwszy Blok Osi pistoletowej (10:00, dwie
-- godziny) najbliższego poniedziałku oddalonego o co najmniej 14 dni: dzień
-- roboczy ma ten Blok w rozkładzie, a odległość trzyma go z dala od terminów,
-- w które celują testy przeglądarkowe. Moment liczony jest w strefie
-- Strzelnicy, bo rozkład mówi o jej zegarze, a kolumna trzyma UTC.
-- Rezerwujący nie ma Pozwolenia, więc bierze Instruktora — i tym samym
-- jedyne miejsce w Puli.
-- Kwota wypisana wprost, a nie policzona zapytaniem: w bazie jest wartością
-- zamrożoną w chwili złożenia, więc seed ma ją podać tak samo, jak podaje ją
-- Edge Function. Rachunek tej Rezerwacji: 120 zł za Blok + 30 zł za drugiego
-- Uczestnika + 80 zł za Instruktora + 60 zł za „CZ Shadow 2" + 200 × 0,40 zł
-- za amunicję = 370 zł.
insert into public.bookings (
  id, facility_id, lane_id, starts_at, ends_at, status, participants,
  contact_name, contact_email, contact_phone, has_permit, with_instructor,
  amount_gr, block_rate_gr, participation_rate_gr, instructor_rate_gr
)
select
  '00000000-0000-0000-0000-0000000000b1',
  f.id,
  '00000000-0000-0000-0000-0000000000a1',
  poczatek,
  poczatek + interval '120 minutes',
  'potwierdzona',
  2,
  'Jan Przykładowy',
  'jan@example.pl',
  '600100200',
  false,
  true,
  37000,
  12000,
  3000,
  8000
from public.facilities f
cross join lateral (
  select (
    (current_date + 14 + ((8 - extract(isodow from current_date + 14)::int) % 7))::timestamp
      + interval '600 minutes'
  ) at time zone f.timezone as poczatek
) t
where f.id = '00000000-0000-0000-0000-000000000001'
on conflict (id) do nothing;

-- Katalog Typów broni. Pule celowo różne: „Glock 17" starcza na kilka
-- Rezerwacji naraz, a „CZ Shadow 2" jest jeden — więc Rezerwacja poniżej
-- wyczerpuje go w swoim terminie i grafik demo pokazuje Typ niedostępny.
insert into public.weapon_types (id, facility_id, name, pool, unit_price_gr)
values
  (
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-000000000001',
    'Glock 17',
    3,
    5000
  ),
  (
    '00000000-0000-0000-0000-0000000000c2',
    '00000000-0000-0000-0000-000000000001',
    'CZ Shadow 2',
    1,
    6000
  ),
  (
    '00000000-0000-0000-0000-0000000000c3',
    '00000000-0000-0000-0000-000000000001',
    'Karabinek AR-15',
    2,
    9000
  )
on conflict (id) do nothing;

-- Wypożyczenie przy Rezerwacji z seeda: jedyna sztuka „CZ Shadow 2". Ten sam
-- termin na drugiej Osi zostaje więc wolny, ale bez tego Typu — dokładnie ta
-- różnica, o której mówi spec: dostępność zależy od kształtu Rezerwacji.
insert into public.weapon_rentals (
  id, facility_id, booking_id, weapon_type_id, quantity, unit_price_gr
)
values (
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000c2',
  1,
  6000
)
on conflict (id) do nothing;

-- Katalog Rodzajów amunicji. Bez pul — Rodzaj amunicji ich nie ma (ADR 0004),
-- więc żaden z nich nie bywa „wyczerpany" i grafik demo nie ma tu czego
-- pokazywać poza samą listą.
insert into public.ammunition_kinds (id, facility_id, name, unit_price_gr)
values
  (
    '00000000-0000-0000-0000-0000000000e1',
    '00000000-0000-0000-0000-000000000001',
    '9 × 19 mm Parabellum',
    150
  ),
  (
    '00000000-0000-0000-0000-0000000000e2',
    '00000000-0000-0000-0000-000000000001',
    '.223 Remington',
    250
  ),
  (
    '00000000-0000-0000-0000-0000000000e3',
    '00000000-0000-0000-0000-000000000001',
    '.22 Long Rifle',
    40
  )
on conflict (id) do nothing;

-- Zapotrzebowanie przy Rezerwacji z seeda. Rodzaj celowo nie pasuje do
-- kalibru wypożyczonego „CZ Shadow 2": zgodności nie sprawdzamy (ADR 0004),
-- a dane demo mają to pokazywać, zamiast udawać walidację, której nie ma.
insert into public.ammunition_demands (
  id, facility_id, booking_id, ammunition_kind_id, quantity, unit_price_gr
)
values (
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e3',
  200,
  40
)
on conflict (id) do nothing;

-- Druga Strzelnica: minimum, na którym widać rozdzielenie danych. Bez rozkładu
-- Bloków i bez dozwolonych domen — Widgetu nikt tu nie osadza, a Panel niczego
-- z rozkładu nie czyta. Jest tu po to, żeby „nie widzę cudzych Rezerwacji"
-- dało się w ogóle sprawdzić: jedna Strzelnica w bazie czyni to zdanie
-- prawdziwym z braku czegokolwiek obcego.
insert into public.facilities (
  id, slug, name, allowed_origins, contact_email, contact_phone
)
values (
  '00000000-0000-0000-0000-000000000002',
  'strzelnica-druga',
  'Strzelnica Druga',
  '{}',
  'kontakt@strzelnica-druga.example.pl',
  '+48 987 654 321'
)
on conflict (id) do nothing;

insert into public.lanes (id, facility_id, name, capacity, block_rate_gr)
values (
  '00000000-0000-0000-0000-0000000000a3',
  '00000000-0000-0000-0000-000000000002',
  'Oś obcej Strzelnicy',
  3,
  9000
)
on conflict (id) do nothing;

-- Rezerwacja obcej Strzelnicy, celowo w tym samym oknie czasu, co ta z demo:
-- gdyby Panel filtrował po dacie zamiast po Strzelnicy, wypadłaby na ekran
-- razem z tamtą i byłoby to widać.
insert into public.bookings (
  id, facility_id, lane_id, starts_at, ends_at, status, participants,
  contact_name, contact_email, contact_phone, has_permit, with_instructor,
  amount_gr, block_rate_gr, participation_rate_gr, instructor_rate_gr
)
select
  '00000000-0000-0000-0000-0000000000b2',
  f.id,
  '00000000-0000-0000-0000-0000000000a3',
  poczatek,
  poczatek + interval '120 minutes',
  'potwierdzona',
  1,
  'Obcy Klient',
  'obcy@example.pl',
  '600900800',
  true,
  false,
  9000,
  9000,
  0,
  0
from public.facilities f
cross join lateral (
  select (
    (current_date + 14 + ((8 - extract(isodow from current_date + 14)::int) % 7))::timestamp
      + interval '600 minutes'
  ) at time zone f.timezone as poczatek
) t
where f.id = '00000000-0000-0000-0000-000000000002'
on conflict (id) do nothing;

-- Konta do Panelu. Tworzone wprost w `auth.users`, bo rejestracji nie ma
-- i nie będzie: Strzelnice zakłada operator platformy skryptem (spec,
-- historia 60), a `enable_signup = false` w `supabase/config.toml` zamyka
-- drogę przez formularz. Hasło jedno dla obu i wypisane wprost — to seed
-- pracy lokalnej, ta baza nie wychodzi poza `localhost`.
--
-- Wiersz w `auth.identities` jest częścią konta, a nie ozdobą: GoTrue szuka
-- tożsamości dostawcy „email" przy logowaniu hasłem i konto bez niej odmawia
-- wpuszczenia, mimo poprawnego hasła w `auth.users`.
--
-- Puste ciągi w kolumnach tokenów jednorazowych nie są ozdobą: GoTrue czyta je
-- jako `string`, więc konto z `null` w którejkolwiek z nich wywraca logowanie
-- błędem serwera, zamiast odmówić albo wpuścić.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change, phone_change_token,
  reauthentication_token,
  created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  konto.id,
  'authenticated',
  'authenticated',
  konto.email,
  extensions.crypt('panel-demo-123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  '', '', '', '', '', '', '', '',
  now(),
  now()
from (
  values
    ('00000000-0000-0000-0000-000000000101'::uuid, 'obsluga@strzelnica-demo.example.pl'),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'obsluga@strzelnica-druga.example.pl')
) as konto (id, email)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, created_at, updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now()
from auth.users u
where u.id in (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102'
)
on conflict (provider, provider_id) do nothing;

-- Powiązanie konta ze Strzelnicą — jedyna treść Użytkownika panelu. Dwa konta
-- w dwóch różnych Strzelnicach, bo dopiero para pokazuje, że powiązanie
-- cokolwiek odcina.
insert into public.panel_users (user_id, facility_id)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002')
on conflict (user_id) do nothing;
