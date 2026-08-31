# 03: Reguły czasowe: horyzont i wyprzedzenie

**What to build:** Osoba rezerwująca nie widzi terminów zbyt odległych ani zbyt bliskich.
Strzelnica ustala oba progi, a moduł je respektuje.

**Blocked by:** 2

**Status:** ready-for-agent

- [ ] Konfiguracja Strzelnicy zawiera horyzont rezerwacji, minimalne wyprzedzenie i okno anulowania
- [ ] Funkcja dostępności odrzuca Bloki poza horyzontem i poniżej minimalnego wyprzedzenia
- [ ] Kalendarz nie pozwala przejść poza horyzont
- [ ] Bloki zbyt bliskie są widoczne jako niedostępne, nie znikają bez wyjaśnienia
- [ ] Testy jednostkowe pokrywają termin dokładnie na granicy horyzontu i dokładnie na granicy wyprzedzenia
