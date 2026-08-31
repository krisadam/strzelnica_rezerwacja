# 24: Skrypt zakładania Strzelnicy

**What to build:** Operator platformy uruchamia jedno polecenie i ma nową Strzelnicę
z pierwszym kontem gotowym do zalogowania się do Panelu. Nie ma do tego
interfejsu i nie ma samodzielnej rejestracji — zgodnie z ADR 0001.

**Blocked by:** 22

**Status:** ready-for-agent

- [ ] Skrypt tworzy Strzelnicę z podstawową konfiguracją i domyślnymi regułami czasowymi
- [ ] Skrypt tworzy pierwsze konto Użytkownika panelu powiązane z tą Strzelnicą
- [ ] Skrypt jest idempotentny albo jasno odmawia przy istniejącej Strzelnicy o tym samym identyfikatorze
- [ ] Nowo założona Strzelnica jest w pełni konfigurowalna z Panelu bez dotykania bazy
- [ ] Procedura opisana w README
