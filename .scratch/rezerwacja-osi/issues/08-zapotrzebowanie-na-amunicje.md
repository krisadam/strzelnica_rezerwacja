# 08: Zapotrzebowanie na amunicję

**What to build:** Osoba rezerwująca zamawia amunicję, podając rodzaj i liczbę sztuk.
Strzelnica dostaje tę informację, żeby się przygotować — system niczego nie
pilnuje i nigdy nie odmawia z powodu amunicji.

**Blocked by:** 5

**Status:** ready-for-agent

- [ ] Schemat obejmuje Rodzaj amunicji oraz Zapotrzebowanie jako pozycję Rezerwacji
- [ ] Jedna Rezerwacja może zawierać wiele pozycji różnych Rodzajów
- [ ] Zamówienie amunicji nigdy nie wpływa na dostępność terminu
- [ ] Brak walidacji zgodności amunicji z wypożyczaną bronią — zgodnie z ADR 0004
- [ ] Osoba rezerwująca może nie zamówić amunicji i przyjechać z własną
- [ ] Interfejs komunikuje, że to zapowiedź dla Strzelnicy, nie rezerwacja towaru
