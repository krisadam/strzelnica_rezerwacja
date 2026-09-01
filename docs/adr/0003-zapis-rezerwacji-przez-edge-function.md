# Rezerwacje zapisywane wyłącznie przez Edge Function

Odczyt dostępności idzie bezpośrednio z klienta przez PostgREST pod kontrolą
RLS, ale **zapis Rezerwacji przechodzi wyłącznie przez Edge Function**. Powód:
przyjęcie Rezerwacji wymaga sprawdzenia w jednej transakcji kolizji Bloku,
pojemności Osi, Puli instruktorów i puli sztuk każdego Typu broni. Wyrażenie
tego w RLS jest albo niemożliwe, albo podatne na wyścig między dwoma
równoczesnymi zgłoszeniami na ten sam Blok.

Dodatkowo klucz `anon` jest publicznie widoczny w kodzie osadzonym na cudzej
stronie — funkcja daje miejsce na weryfikację `Origin`, rate limiting i captchę.

Konsekwencja: asymetria w kodzie (czytamy z bazy, piszemy przez HTTP) jest
zamierzona i nie należy jej „ujednolicać".

## Wyłączności Osi pilnuje schemat, nie funkcja

Funkcja sprawdza dostępność przed zapisem, ale to sprawdzenie nie jest tym, co
rozstrzyga wyścig — dwa równoczesne zgłoszenia przechodzą je oba i oba widzą
Blok wolny. Rozstrzyga ograniczenie `exclude` na `bookings`: równość Osi
zestawiona z zachodzeniem zakresów czasu, ograniczona do Rezerwacji żywych.
Przegrany dostaje `23P01` i ten sam komunikat, co ktoś, kto po prostu zwlekał.

Konsekwencja: obietnicy wyłączności nie wolno przenieść do kodu funkcji „dla
czytelności". Sprawdzenie przed zapisem jest po to, żeby powiedzieć Osobie
rezerwującej, co jest nie tak — nie po to, żeby chronić dane.

## Nagłówek `Origin` a domeny osadzenia

Widget serwowany jest z naszej domeny, więc `Origin` jego żądania jest naszą
domeną, nie domeną Strzelnicy. Lista `facilities.allowed_origins` opisuje, kto
może osadzić Widget w ramce — i to ona odsiewa żądania sklejone na cudzej
stronie, którym nikt ramki nie dawał. Domena samego Widgetu jest jednakowa dla
wszystkich Strzelnic, więc jest konfiguracją platformy (`WIDGET_ORIGIN`),
a nie ich danymi. Funkcja przyjmuje żądanie, gdy `Origin` należy do sumy tych
dwóch zbiorów.
