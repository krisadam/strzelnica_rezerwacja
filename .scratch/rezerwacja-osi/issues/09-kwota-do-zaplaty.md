# 09: Kwota do zapłaty

**What to build:** Osoba rezerwująca widzi, ile zapłaci na miejscu, i widzi, z czego ta kwota
się składa. Kwota aktualizuje się przy każdej zmianie formularza. Po złożeniu
Rezerwacji nie zmienia się już nigdy, nawet gdy Strzelnica zmieni cennik.

**Blocked by:** 6, 7, 8

**Status:** ready-for-agent

- [ ] Konfiguracja zawiera stawkę za Blok (na Osi), stawkę za uczestnictwo, stawkę za Instruktora oraz ceny broni i amunicji
- [ ] Kwoty przechowywane w groszach jako liczby całkowite, waluta PLN
- [ ] Wyliczanie Kwoty jest czystą funkcją w `packages/shared`
- [ ] Stawka za uczestnictwo naliczana za Uczestników poza pierwszym
- [ ] Stawka za Instruktora naliczana tak samo, gdy jest wymagany, jak gdy zamówiony dobrowolnie
- [ ] Widget pokazuje rozbicie Kwoty na składniki i aktualizuje je na bieżąco
- [ ] Interfejs komunikuje, że płatność następuje na miejscu
- [ ] Rezerwacja przechowuje wyliczoną Kwotę oraz stawki użyte do jej wyliczenia
- [ ] Zmiana cennika nie zmienia Kwoty złożonych wcześniej Rezerwacji
- [ ] Edge Function przelicza Kwotę po swojej stronie i nie ufa wartości z klienta
- [ ] Testy jednostkowe pokrywają wszystkie składniki, w tym Rezerwację jednoosobową i regułę pierwszego Uczestnika
