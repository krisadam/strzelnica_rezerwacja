-- Domeny, na których Strzelnica pozwala osadzić swój Widget. Spec, historia 56:
-- „wskazać domeny, na których wolno osadzić mój Widget, żeby nikt nie wystawił
-- moich terminów u siebie". Z tej listy budowany jest nagłówek
-- `frame-ancestors` serwowany razem z Widgetem — zobacz ADR 0002.
--
-- Pusta lista znaczy „nigdzie", nie „wszędzie": nowo założona Strzelnica
-- (ticket #24) nie zgodziła się jeszcze na żadną domenę. Dlatego domyślną
-- wartością jest pusta tablica, a nie NULL — brak zgody jest stanem, nie
-- brakiem danych.

alter table public.facilities
  add column allowed_origins text[] not null default '{}',
  -- Wpis ma być samym źródłem — schemat, host i opcjonalny port — bo tylko
  -- taki zapis rozumie `frame-ancestors`. Adres podstrony wklejony zamiast
  -- domeny nie blokowałby osadzania głośno, tylko po cichu.
  --
  -- To gruby bezpiecznik przed wpisem, który nie ma prawa tu trafić, a nie
  -- druga kopia reguły: rozstrzyga `normalizeOrigin` z `packages/shared`,
  -- przez które przechodzi każdy wpis z Panelu i z którego liczony jest
  -- nagłówek. Wzorzec wolno mieć luźniejszy od funkcji, nigdy ostrzejszy.
  --
  -- Sprawdzenie każdego elementu z osobna wymagałoby podzapytania, którego
  -- CHECK nie przyjmuje; stąd sklejenie tablicy spacją i jeden wzorzec na
  -- całość. Pusta tablica daje pusty napis i przechodzi.
  add constraint facilities_allowed_origins_are_origins check (
    array_to_string(allowed_origins, ' ')
      ~ '^(https?://[a-z0-9.-]+(:[0-9]{1,5})?( |$))*$'
  );

comment on column public.facilities.allowed_origins is
  'Domeny, na których wolno osadzić Widget Strzelnicy; pusta lista = nigdzie.';
