# 10: Potwierdzenie adresu i wygasanie

**What to build:** Po złożeniu Rezerwacji Osoba rezerwująca dostaje e-mail z linkiem.
Do czasu kliknięcia termin jest jej, ale tylko przez 30 minut — potem
Rezerwacja wygasa i termin wraca do puli. Zmyślony adres nie zablokuje soboty.

**Blocked by:** 5

**Status:** ready-for-agent

- [ ] Rezerwacja powstaje w stanie oczekującym na potwierdzenie adresu
- [ ] E-mail z linkiem potwierdzającym wysyłany jest przez Edge Function zaraz po złożeniu
- [ ] Rezerwacja oczekująca zajmuje termin tak samo jak potwierdzona
- [ ] Kliknięcie linku przenosi Rezerwację w stan potwierdzony
- [ ] Rezerwacja niepotwierdzona po 30 minutach wygasa i zwalnia termin
- [ ] Link jest jednorazowy i nie działa dla Rezerwacji wygasłej
- [ ] Konfiguracja i szablony poczty żyją w repozytorium
- [ ] W środowisku testowym wysyłka jest przechwytywana zamiast wysyłana
- [ ] Test przeglądarkowy: potwierdzenie adresu przez link oraz wygaśnięcie zwalniające termin
