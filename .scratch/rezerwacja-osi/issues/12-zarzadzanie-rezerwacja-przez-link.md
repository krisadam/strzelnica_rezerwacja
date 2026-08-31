# 12: Zarządzanie Rezerwacją przez link

**What to build:** Osoba rezerwująca wchodzi w link z e-maila, widzi szczegóły swojej
Rezerwacji i może ją anulować, dopóki nie jest za późno. Po upływie okna widzi,
dlaczego nie może, i do kogo zadzwonić.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Dostęp do Rezerwacji odbywa się przez token w podpisanym linku, nie przez jej identyfikator
- [ ] Podmiana identyfikatora w adresie nie daje dostępu do cudzej Rezerwacji
- [ ] Widok pokazuje wszystkie szczegóły Rezerwacji wraz z Kwotą
- [ ] Anulowanie jest możliwe do upływu okna anulowania i zwalnia termin
- [ ] Po upływie okna anulowanie jest niemożliwe, a klient widzi powód i kontakt do Strzelnicy
- [ ] Strzelnica dostaje e-mail o anulowaniu przez klienta
- [ ] Okno anulowania jest regułą w `packages/shared` pokrytą testami jednostkowymi, w tym na granicy
