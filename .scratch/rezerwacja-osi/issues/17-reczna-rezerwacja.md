# 17: Ręczna Rezerwacja telefoniczna

**What to build:** Użytkownik panelu wpisuje Rezerwację przyjętą przez telefon i może przy
tym świadomie złamać reguły, których system nie zna — bo wie o sytuacji więcej
niż system. Każde takie odstępstwo zostaje przy Rezerwacji odnotowane.

**Blocked by:** 13, 9

**Status:** ready-for-agent

- [ ] Panel pozwala utworzyć Rezerwację z pełnym zestawem danych, łącznie ze sprzętem i Kwotą
- [ ] Użytkownik panelu może przekroczyć pojemność Osi, godziny otwarcia i Pulę instruktorów po jawnym potwierdzeniu
- [ ] Naruszenia limitów są trwale odnotowane przy Rezerwacji i widoczne w jej szczegółach
- [ ] Każda Rezerwacja niesie swoje Źródło: Widget albo Panel
- [ ] Nie da się utworzyć Rezerwacji na termin zajęty przez inną Rezerwację — wyłączność Osi nie podlega nadpisaniu
- [ ] Funkcja dostępności znosi dane naruszające limity bez błędu i bez ich korygowania
- [ ] Rezerwacja z Panelu nie wymaga potwierdzenia adresu e-mail
