-- Osadzenie Widgetu i dokumenty Strzelnicy ustawiane przez Panel: lista domen,
-- na których wolno Widget osadzić, treść regulaminu i adres polityki
-- prywatności. Spec, historie 56–58.
--
-- Lista domen stoi w schemacie od ticketu #4 (`facilities.allowed_origins`) —
-- czytał ją nagłówek `frame-ancestors`, a zmieniał wyłącznie `supabase db
-- reset`. Ten ticket dokłada do niej **drogę zapisu** i dwa dokumenty, których
-- dotąd nie było wcale: Widget pokazywał przy zgodzie zdanie ogólne, a klient
-- godził się na regulamin, którego nikt mu nie podał.
--
-- Zapis idzie tą samą drogą, co Oś, rozkład, godziny, katalogi i cennik:
-- funkcja bazodanowa z warunkiem `panel_facility_of(p_user_id)`, prawo
-- wykonania wyłącznie dla roli serwisowej i Edge Function jako jedyne
-- przejście z przeglądarki (ADR 0003, ADR 0010).

-- Regulamin i adres polityki jako kolumny Strzelnicy, nie platformy: klient
-- akceptuje dokumenty tej Strzelnicy, u której staje na Osi.
--
-- Puste znaczy dokument jeszcze niepodany i jest to stan, a nie brak danych —
-- dlatego `not null default ''`, tak samo jak pusta tablica domen znaczy
-- „nigdzie", a nie „nie wiadomo". Widget pokazuje wtedy samą zgodę, bez
-- dokumentu, zamiast podstawiać cokolwiek naszego.
alter table public.facilities
  add column terms_text text not null default ''
    -- Granica powiedziana wprost, ta sama, którą wypisuje `MAX_TERMS_LENGTH`.
    -- Nie jest regułą domeny — o długości regulaminu nie nam orzekać — tylko
    -- zaporą przed treścią wklejoną omyłkowo z całej witryny.
    constraint facilities_terms_text_length check (length(terms_text) <= 20000),
  add column privacy_url text not null default ''
    -- Pusty albo adres http(s). Gruby bezpiecznik przed wpisem, który nie ma
    -- prawa tu trafić, a nie druga kopia reguły: rozstrzyga `embeddingProblems`
    -- z `packages/shared`, przez które przechodzi każdy zapis z Panelu.
    constraint facilities_privacy_url_is_url check (
      privacy_url = '' or privacy_url ~ '^https?://'
    );

comment on column public.facilities.terms_text is
  'Regulamin Strzelnicy pokazywany w Widgecie przy zgodzie; pusty = niepodany.';
comment on column public.facilities.privacy_url is
  'Adres polityki prywatności Strzelnicy; pusty = niepodana.';

-- Obie kolumny publiczne, bo obie są **ofertą**: Osoba rezerwująca ma je
-- przeczytać, zanim zaznaczy zgodę. Prawa nadaje się kolumnami (migracja
-- `…_notifications`), więc kolumna dołożona bez tego zdania zostałaby prywatna
-- i Widget pokazałby zgodę bez dokumentów.
grant select (terms_text, privacy_url) on public.facilities to anon, authenticated;

-- Osadzenie i dokumenty jednym zapisem, tak samo jak sześć wartości cennika
-- idzie w całości: to jeden ekran i jeden przycisk, więc nie ma chwili,
-- w której Strzelnica ma nową listę domen i stary regulamin.
--
-- Bez `p_facility_id` i bez `insert`: wiersz Strzelnicy istnieje przed tym
-- żądaniem, a o tym, który to wiersz, rozstrzyga numer potwierdzonego konta
-- (ADR 0010). Ta sama decyzja, co przy `set_facility_configuration`.
--
-- Skutek zmiany listy jest natychmiastowy i nie ma tu nic, co by go odkładało:
-- nagłówek `frame-ancestors` liczy się z tej kolumny przy każdym podaniu
-- dokumentu Widgetu, więc domena skasowana tutaj przestaje osadzać przy
-- następnym wejściu — bez żadnego wdrożenia i bez czekania.
create function public.set_facility_embedding(
  p_allowed_origins text[],
  p_terms_text text,
  p_privacy_url text,
  p_user_id uuid
) returns boolean
-- Ścieżka wyszukiwania przypięta wprost: funkcja woła się rolą serwisową.
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_facility_id uuid;
begin
  v_facility_id := public.panel_facility_of(p_user_id);
  if v_facility_id is null then
    return null;
  end if;

  update public.facilities
     set allowed_origins = p_allowed_origins,
         terms_text = p_terms_text,
         privacy_url = p_privacy_url
   where id = v_facility_id;

  return true;
end;
$$;

comment on function public.set_facility_embedding is
  'Zapis domen osadzenia, regulaminu i adresu polityki; puste znaczy konto bez Strzelnicy.';

revoke execute on function public.set_facility_embedding from public, anon, authenticated;

-- Wzorzec na wpisy listy domen, rozluźniony. Poprzedni (migracja
-- `…_facility_allowed_origins`) dopuszczał wyłącznie hosty z liter, cyfr,
-- kropek i myślników — czyli mniej, niż przepuszcza `normalizeOrigin`, przez
-- które przechodzi każdy wpis z Panelu: adres IPv6 (`https://[::1]:8080`) czy
-- host z podkreśleniem są dla przeglądarki źródłami jak każde inne. Wpisana
-- taka domena przechodziła zastrzeżenia i wywracała się dopiero tutaj, więc
-- obsługa dostawała awarię zapisu zamiast nazwanego zastrzeżenia — a że zapis
-- idzie w całości, jedna taka domena blokowała przy okazji regulamin i adres
-- polityki.
--
-- Tamta migracja mówi to zresztą sama: „Wzorzec wolno mieć luźniejszy od
-- funkcji, nigdy ostrzejszy". Zostaje więc z niego to, co jest grubym
-- bezpiecznikiem przed wpisem, który nie ma prawa tu trafić: schemat http(s)
-- i brak spacji — bo spacja rozdziela wpisy w nagłówku, więc wpis ze spacją
-- byłby dwoma.
alter table public.facilities
  drop constraint facilities_allowed_origins_are_origins;

alter table public.facilities
  add constraint facilities_allowed_origins_are_origins check (
    array_to_string(allowed_origins, ' ') ~ '^(https?://[^ ]+( |$))*$'
  );
