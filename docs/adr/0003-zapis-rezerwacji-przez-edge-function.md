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
