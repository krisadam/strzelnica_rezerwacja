# 04: Osadzenie na obcej stronie

**What to build:** Właściciel strony wkleja jeden znacznik `<script>` i dostaje działający
kalendarz. Ramka sama dopasowuje wysokość, a Widget nie da się osadzić
na domenie spoza listy dozwolonych.

**Blocked by:** 2

**Status:** ready-for-agent

- [ ] Skrypt-loader tworzy ramkę z Widgetem na podstawie atrybutu wskazującego Strzelnicę
- [ ] Widget przekazuje wysokość dokumentu do strony gospodarza, a ramka się do niej dopasowuje
- [ ] Widget żąda przewinięcia strony gospodarza do góry ramki przy zmianie widoku
- [ ] Nagłówek `frame-ancestors` budowany jest z listy domen dozwolonych dla danej Strzelnicy
- [ ] Osadzenie na domenie spoza listy jest blokowane przez przeglądarkę
- [ ] Repozytorium zawiera stronę demonstracyjną gospodarza z osadzonym Widgetem
- [ ] Test przeglądarkowy potwierdza działanie Widgetu w ramce i dopasowanie wysokości
