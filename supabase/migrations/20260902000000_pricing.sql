-- Cennik Strzelnicy i Kwota do zapłaty. Spec, historie 20, 21, 51, 52 i 53:
-- Osoba rezerwująca widzi, ile zapłaci na miejscu i z czego ta Kwota się
-- składa, a Strzelnica ustawia stawki, z których się liczy.
--
-- Wszystkie kwoty w groszach jako liczby całkowite — waluta jest jedna (PLN),
-- a suma liniowa liczb całkowitych nie wychodzi z całkowitych, więc nie ma tu
-- ani miejsca na błąd zaokrąglenia, ani powodu na typ zmiennoprzecinkowy.
-- Sufiks `_gr` w nazwie mówi o jednostce wprost: kolumna nazwana bez niego
-- prosi się o wpisanie złotówek.
--
-- Zero jest wszędzie dopuszczalną stawką i wartością domyślną: Strzelnica,
-- która czegoś nie liczy (Instruktor w cenie, wstęp za darmo), ma to wyrazić
-- danymi, a nie brakiem kolumny. Domyślne zero znaczy też, że migracja nie
-- zmyśla cennika za Strzelnicę — dopóki nie wejdzie do Panelu, Kwota wychodzi
-- zerowa i widać, że cennika nie ustawiono.

-- Stawki wspólne dla całej Strzelnicy: Instruktor i Uczestnik nie należą do
-- żadnej Osi z osobna.
alter table public.facilities
  add column participation_rate_gr integer not null default 0
    check (participation_rate_gr >= 0),
  add column instructor_rate_gr integer not null default 0
    check (instructor_rate_gr >= 0);

comment on column public.facilities.participation_rate_gr is
  'Stawka za uczestnictwo w groszach, naliczana za Uczestników poza pierwszym.';

comment on column public.facilities.instructor_rate_gr is
  'Stawka za Instruktora w groszach, naliczana za samą jego obecność.';

-- Stawka za Blok jest własnością Osi, a nie Strzelnicy. Cennika zależnego od
-- pory dnia i dnia tygodnia nie ma i w tym tickecie nie będzie — ale to tutaj
-- jest miejsce, w którym kiedyś stanie, bez zmiany kształtu pozostałych danych.
alter table public.lanes
  add column block_rate_gr integer not null default 0
    check (block_rate_gr >= 0);

comment on column public.lanes.block_rate_gr is
  'Stawka za Blok na tej Osi w groszach; obejmuje pierwszego Uczestnika.';

alter table public.weapon_types
  add column unit_price_gr integer not null default 0
    check (unit_price_gr >= 0);

comment on column public.weapon_types.unit_price_gr is
  'Cena wypożyczenia jednej sztuki w groszach.';

alter table public.ammunition_kinds
  add column unit_price_gr integer not null default 0
    check (unit_price_gr >= 0);

comment on column public.ammunition_kinds.unit_price_gr is
  'Cena jednej sztuki amunicji w groszach.';

-- Kwota złożonej Rezerwacji wraz ze stawkami, z których się policzyła.
-- Bez nich Rezerwacja niosłaby liczbę, której nikt nie umie wytłumaczyć —
-- a Strzelnica ma powiedzieć klientowi na miejscu, skąd się wzięła, także
-- wtedy, gdy zmieniła w międzyczasie cennik.
--
-- Zmiana cennika nie zmienia Kwot już złożonych Rezerwacji właśnie dlatego,
-- że tu nie ma widoku ani wyliczenia z katalogu — są zapisane wartości.
-- Ceny pozycji stoją przy pozycjach niżej, bo tam jest ich miejsce: jedna
-- Rezerwacja niesie wiele Typów broni, każdy w swojej cenie.
--
-- Kwota jest `bigint`, choć stawki i ceny są `integer`, i nie jest to
-- niekonsekwencja: Kwota bywa iloczynem dwóch takich kolumn. Liczba sztuk
-- amunicji nie ma górnej granicy poza typem kolumny (ADR 0004), więc
-- zamówienie sztuk razy cena za sztukę wychodzi poza `integer` — i wtedy
-- absurdalne zamówienie kończyłoby się błędem serwera zamiast odpowiedzią
-- o zgłoszeniu. Granicę stawia typ, tak samo jak przy liczbie sztuk.
alter table public.bookings
  add column amount_gr bigint not null default 0 check (amount_gr >= 0),
  add column block_rate_gr integer not null default 0 check (block_rate_gr >= 0),
  add column participation_rate_gr integer not null default 0
    check (participation_rate_gr >= 0),
  add column instructor_rate_gr integer not null default 0
    check (instructor_rate_gr >= 0);

-- Wartości domyślne były po to, żeby kolumny dało się dołożyć do istniejących
-- wierszy. Zaraz po tym znikają — tak samo jak przy Pozwoleniu i Instruktorze:
-- Rezerwacja bez podanej Kwoty ma się zatrzymać na braku wartości, a nie po
-- cichu zapisać się za darmo.
alter table public.bookings
  alter column amount_gr drop default,
  alter column block_rate_gr drop default,
  alter column participation_rate_gr drop default,
  alter column instructor_rate_gr drop default;

comment on column public.bookings.amount_gr is
  'Kwota do zapłaty w groszach, zamrożona w chwili złożenia Rezerwacji.';

comment on column public.bookings.block_rate_gr is
  'Stawka za Blok użyta do wyliczenia Kwoty tej Rezerwacji.';

-- Cena pozycji, po której ją policzono. Przy pozycji, a nie przy Rezerwacji:
-- jedna Rezerwacja niesie wiele Typów broni i wiele Rodzajów amunicji, każdy
-- w swojej cenie. Odczyt z katalogu przy pokazywaniu Kwoty rozmroziłby ją
-- przy pierwszej podwyżce.
alter table public.weapon_rentals
  add column unit_price_gr integer not null default 0 check (unit_price_gr >= 0);

alter table public.weapon_rentals alter column unit_price_gr drop default;

comment on column public.weapon_rentals.unit_price_gr is
  'Cena jednej sztuki użyta do wyliczenia Kwoty tej Rezerwacji.';

alter table public.ammunition_demands
  add column unit_price_gr integer not null default 0 check (unit_price_gr >= 0);

alter table public.ammunition_demands alter column unit_price_gr drop default;

comment on column public.ammunition_demands.unit_price_gr is
  'Cena jednej sztuki użyta do wyliczenia Kwoty tej Rezerwacji.';

-- Czego tu nie ma: Kwoty w widokach `lane_occupancy` i `weapon_occupancy`.
-- Wystawiają one zajętość Osobie rezerwującej patrzącej na kalendarz — cudza
-- Kwota nie mówi jej nic o dostępności, a mówi o cudzej Rezerwacji więcej,
-- niż wolno. Własną Kwotę Osoba rezerwująca dostaje z odpowiedzi Edge Function
-- przy złożeniu, a potem z e-maila (ticket #11) i z linku do swojej
-- Rezerwacji (ticket #12).
