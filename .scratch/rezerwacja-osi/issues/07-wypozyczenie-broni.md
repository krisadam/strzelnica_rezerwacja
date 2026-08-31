# 07: Wypożyczenie broni

**What to build:** Osoba rezerwująca wybiera z katalogu Typy broni i liczbę sztuk każdego.
Nie da się zamówić większej liczby sztuk, niż Strzelnica ma wolnych w tym
terminie.

**Blocked by:** 5

**Status:** ready-for-agent

- [ ] Schemat obejmuje Typ broni z pulą sztuk oraz Wypożyczenie jako pozycję Rezerwacji
- [ ] Jedna Rezerwacja może zawierać wiele Wypożyczeń różnych Typów
- [ ] Funkcja dostępności wylicza pozostałe sztuki każdego Typu w danym terminie po nakładających się Rezerwacjach
- [ ] Widget ogranicza wybór do liczby sztuk faktycznie dostępnych w wybranym terminie
- [ ] Typ całkowicie wyczerpany w danym terminie jest niedostępny wraz z wyjaśnieniem
- [ ] Osoba rezerwująca może nie wypożyczyć niczego i przyjechać z własną bronią
- [ ] Edge Function odrzuca Rezerwację przekraczającą pulę
- [ ] Testy jednostkowe pokrywają ostatnią sztukę Typu i sumowanie po nakładających się Rezerwacjach
