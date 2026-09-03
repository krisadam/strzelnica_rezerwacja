# Panel czyta Rezerwacje widokiem, a nie polityką na tabeli

Spec mówi: „Panel: Supabase Auth, jedna rola — każdy Użytkownik panelu
Strzelnicy ma pełne uprawnienia w jej obrębie. RLS odcina go od danych innych
Strzelnic". Robimy to, ale nie polityką `select` na `bookings`: Panel czyta
widok `panel_bookings`, a sama tabela zostaje bez jednej polityki dla
zalogowanego — tak samo jak dla klucza anonimowego.

Powód: polityka RLS mówi o **wierszach** i o kolumnach nie mówi nic, a
`bookings` niesie dwa tokeny. Token potwierdzający i token linku do zarządzania
są upoważnieniem Osoby rezerwującej, a nie daną o Rezerwacji: kto je widzi, ten
może wejść w cudzy link i anulować Rezerwację cudzą ręką. Polityka wpuszczająca
Panel do tabeli wystawiłaby oba — a każda przyszła kolumna z tokenem
wystawiłaby się sama, bez jednego zdania w migracji.

Widok jest odwrotnością tej domyślności: kolumna dołożona do `bookings` nie
pojawia się w Panelu, dopóki ktoś świadomie jej tam nie dopisze. Ta sama
reguła, co przy `grant select (…)` na `facilities` — i wprowadzona z tego
samego powodu.

Wielodostępności pilnuje wtedy warunek samego widoku
(`facility_id = panel_facility()`), bo widok czyta tabelę prawami właściciela
i jej RLS omija. Nie jest to obejście zabezpieczenia, tylko ten sam wzorzec, na
którym stoją `lane_occupancy` i `weapon_occupancy`: widok jest **oknem** o
z góry wyciętym kształcie, a tym kształtem jest tu jedna Strzelnica i kolumny
bez tokenów. Klucz anonimowy nie ma do niego prawa odczytu w ogóle, więc bez
zalogowania nie widać ani jednego wiersza.

Pozycje Rezerwacji — Wypożyczenia i Zapotrzebowanie na amunicję — idą
politykami, nie widokami. Nie niosą ani jednej kolumny, której obsługa nie ma
prawa zobaczyć, więc zasłanianie ich kolumnami byłoby ceremonią bez treści.
Różnica jest w danych, nie w upodobaniu.

## Konsekwencje

Widok jest do odczytu i tylko do odczytu. Ręczne wpisanie Rezerwacji w Panelu
(spec, historie 43–45), odwołanie jej przez Strzelnicę (historia 40) i Blokady
Osi (historia 46) **nie** będą pisać przez `panel_bookings` — zapis do
`bookings` idzie wyłącznie przez funkcje bazodanowe wołane z Edge Functions
(ADR 0003) i tak zostanie. Panel dostanie tam własne końcówki, a nie politykę
`insert` na tabeli.

Odczyt Panelu z widoku i odczyt klienta przez `pokaz-rezerwacje` zostają dwiema
różnymi drogami do tych samych wierszy. Nie jest to duplikat: klient nie ma
konta, którym dałoby się mu pokazać własny wiersz i tylko własny, więc jego
droga musi iść przez token i rolę serwisową. Panel konto ma — i to konto jest
całą różnicą.
