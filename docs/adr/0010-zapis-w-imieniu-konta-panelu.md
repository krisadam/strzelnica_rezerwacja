# Zapis w imieniu konta Panelu idzie rolą serwisową, a granicę stawia baza

Odwołanie Rezerwacji przez Strzelnicę (ticket #15) jest pierwszym zapisem, o
który prosi **konto Panelu**. Trzy dotychczasowe drogi zmiany stanu — zapis,
potwierdzenie adresu i anulowanie przez klienta — otwierał link z e-maila albo
formularz Widgetu, a upoważnieniem był token: rola serwisowa Edge Function
wykonywała zapis, bo o zasięg nie było tu czego pytać. Token wskazuje jedną
Rezerwację i nie ma czym wskazać cudzej (ADR 0007).

Tutaj jest inaczej. Żądanie niesie **numer** Rezerwacji, a wolno je wykonać
wtedy i tylko wtedy, gdy Rezerwacja należy do Strzelnicy pytającego konta.
Pytanie „czyja to Rezerwacja" pojawia się więc po stronie zapisu — a odpowiedź
na nie po stronie odczytu ma już swoje miejsce i swoją regułę: rozstrzyga
**rola**, a nie tabela, i rozstrzyga w bazie (ADR 0009).

Trzy rzeczy muszą tu być prawdziwe naraz, i to one wyznaczają rozwiązanie:

1. Rezerwacja zmienia stan wyłącznie przez Edge Functions (ADR 0003) — bo tam
   dzieje się walidacja i tam wychodzi poczta.
2. Granica Strzelnicy stoi w bazie, nie w kodzie ekranu ani funkcji (ADR 0009).
3. Prawa zapisu do `bookings` nie ma żadna publiczna rola i mieć nie będzie
   (ADR 0009), a polityki RLS ta tabela nie ma wcale (ADR 0003).

## Dlaczego nie polityka zapisu na `bookings`

Droga wyglądająca na naturalną: polityka `update` dla roli `authenticated`
z warunkiem `facility_id = panel_facility()`. Odrzucona, i to dwa razy.

Po pierwsze, polityka mówi o **wierszach** i o kolumnach nie mówi nic — ten
sam powód, dla którego Panel czyta Rezerwacje widokiem (ADR 0008). Polityka
zapisu wpuściłaby Panel do tabeli, w której każda kolumna jest do wzięcia:
`status` na „potwierdzona" bez potwierdzenia adresu, `amount_gr` na inną
kwotę, `management_token` na własny.

Po drugie, jest to wprost to, czego zabrania ADR 0003: zapis z przeglądarki
omijałby Edge Function razem z walidacją i listem do klienta.

## Dlaczego nie prawami zalogowanego konta

Droga kusząca, bo w niej granica wychodzi sama z siebie: Edge Function
przepisuje nagłówek `Authorization` swojego żądania do klienta bazy, a funkcja
`revoke_booking` — `security definer`, więc z prawem zapisu od właściciela —
pyta w warunku o `panel_facility()`. Tożsamość nie jest wtedy niczyim
parametrem: PostgREST sam sprawdza podpis tokenu, a baza czyta z niego konto.

Rozbija się to o prawo wykonania. Żeby konto Panelu mogło zawołać tę funkcję
**przez Edge Function**, musi mieć do niej `grant execute` — a wtedy ma je też
w przeglądarce, bo to ten sam token, którym Panel czyta widok Rezerwacji. Jedno
żądanie sklejone w konsoli odwołuje wtedy Rezerwację **bez listu do klienta**,
czyli bez tego jednego, po co odwołanie w ogóle istnieje. Trzy pozostałe
funkcje zapisujące (`place_booking`, `confirm_booking`, `cancel_booking`) mają
prawo wykonania odebrane obu publicznym rolom właśnie dlatego i ta nie może być
wyjątkiem.

Nie jest to obrona przed obsługą Strzelnicy, która i tak może odwołać każdą
swoją Rezerwację. Jest to ta sama reguła, co przy `truncate` i przy `update`
bez polityki (ADR 0009): granica nie ma stać na tym, czego przeglądarka akurat
nie próbuje.

## Co więc jest

`revoke_booking` wołana **rolą serwisową**, jak wszystkie trzy tamte, ale
z numerem konta jako parametrem:

- **prawo do zapisu** ma rola serwisowa i tylko ona; z przeglądarki nie ma do
  tej funkcji drogi;
- **zasięg** bierze się z konta: warunek pyta `panel_facility_of(p_user_id)`,
  a to jest ta sama odpowiedź na „czyja to Strzelnica", co `panel_facility()` —
  ta ostatnia staje się odtąd jej zawężeniem do zalogowanego, żeby pytanie
  stało w bazie raz;
- **tożsamość** potwierdza GoTrue: Edge Function podaje `auth.getUser` token
  z nagłówka i dopiero z odpowiedzi bierze numer konta. Nie przepisuje go
  z treści żądania — przysłany numer konta byłby upoważnieniem, które klient
  wystawia sobie sam.

Rezerwacja spoza Strzelnicy tego konta jest przy tym nieodróżnialna od
nieistniejącej i jest to odpowiedź zamierzona: „nie ma takiej" i „jest, ale nie
twoja" mówiłyby pytającemu dwie różne rzeczy o cudzych Rezerwacjach.

## Konsekwencje

Granica przebiega w bazie, ale tożsamość jest asercją Edge Function — i to jest
cena tego układu. Funkcja bazodanowa ufa parametrowi `p_user_id`, więc waży
tyle, ile sprawdzenie tokenu tuż przed nią. Dlatego prawo wykonania ma
wyłącznie rola serwisowa: parametrem wolno się posługiwać tylko temu, kto
tożsamość potwierdził, a jedynym takim wołającym są nasze Edge Functions.

Edge Function pyta sama o jedną rzecz — kto pyta — i nigdy o to, czyja jest
Rezerwacja. Sprawdzenie stoi przed wszystkim innym, także przed sprawdzeniem
powodu: żądaniu bez konta nie należy się nawet odpowiedź o brakującym powodzie,
bo nie wiadomo, komu by jej udzielono.

Nagłówka `Origin` nie sprawdzamy i tu — inaczej niż przy zapisie z Widgetu,
gdzie o zapis prosi cudza strona w imieniu swojego gościa. Upoważnieniem jest
nagłówek `Authorization`, nie ciasteczko: obca strona nie dołoży go z siebie,
a mając go, nie zatrzymałaby jej i lista domen.

Każdy przyszły zapis Panelu — ręczna Rezerwacja, Blokada Osi, ekrany
konfiguracji — ma odtąd kształt do naśladowania: funkcja bazodanowa z warunkiem
`panel_facility_of(p_user_id)`, prawo wykonania wyłącznie dla roli serwisowej,
Edge Function potwierdzająca token i jedyna droga z przeglądarki.

Sprawdzenie tej granicy należy przy tym do testów zadających pytanie **obok**
interfejsu (`e2e/tests/izolacja-strzelnic.spec.ts`), i pyta się tam obiema
drogami: wprost do funkcji bazodanowej — po dowód, że drogi nie ma — oraz Edge
Function z tokenem obcego konta, po dowód, że cudza Rezerwacja jest dla niej
nieznana. Panel, który obcej Rezerwacji nie pokazuje, wygląda tak samo jak baza,
która nie da jej odwołać.
