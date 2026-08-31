# 06: Pozwolenie na broń i Pula instruktorów

**What to build:** Osoba rezerwująca deklaruje, czy posiada Pozwolenie na broń. Bez niego
Instruktor jest dodawany automatycznie, a termin jest dostępny tylko wtedy, gdy
Strzelnica ma jeszcze wolnego Instruktora. Osoba z Pozwoleniem widzi ten sam
termin jako wolny i może Instruktora zamówić dobrowolnie.

**Blocked by:** 5

**Status:** ready-for-agent

- [ ] Formularz zawiera deklarację Pozwolenia na broń
- [ ] Brak Pozwolenia automatycznie dodaje Instruktora do Rezerwacji i jest to widoczne dla klienta
- [ ] Osoba z Pozwoleniem może dobrowolnie zamówić Instruktora
- [ ] Konfiguracja Strzelnicy zawiera Pulę instruktorów
- [ ] Funkcja dostępności zajmuje miejsce w Puli dla Rezerwacji z Instruktorem, licząc po całej Strzelnicy
- [ ] Wyczerpana Pula czyni termin niedostępnym wyłącznie dla Rezerwacji wymagających Instruktora
- [ ] Kalendarz informuje, że przyczyną niedostępności jest brak wolnego Instruktora, a nie zajęta Oś
- [ ] Zmiana deklaracji Pozwolenia natychmiast przelicza dostępność w kalendarzu
- [ ] Edge Function odrzuca Rezerwację przy wyczerpanej Puli
- [ ] Testy jednostkowe pokrywają ostatnie wolne miejsce w Puli i różnicę dostępności między klientem z Pozwoleniem a bez
