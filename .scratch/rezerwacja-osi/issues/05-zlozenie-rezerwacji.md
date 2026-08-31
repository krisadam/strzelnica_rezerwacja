# 05: Złożenie Rezerwacji

**What to build:** Osoba rezerwująca wybiera wolny Blok, podaje liczbę Uczestników i dane
kontaktowe, akceptuje zgodę i składa Rezerwację. Termin natychmiast przestaje
być wolny dla wszystkich pozostałych.

Dwoje ludzi klikających ten sam Blok w tej samej chwili nie może obojga
zarezerwować — dokładnie jedno zgłoszenie wygrywa, drugie dostaje zrozumiały
komunikat i wraca do kalendarza.

**Blocked by:** 2

**Status:** ready-for-agent

- [ ] Schemat obejmuje Rezerwację ze stanem, danymi kontaktowymi i liczbą Uczestników
- [ ] Rezerwacja powstaje wyłącznie przez Edge Function; klient nie zapisuje do bazy bezpośrednio
- [ ] Edge Function waliduje wszystko ponownie po stronie serwera i zapisuje w jednej transakcji z blokadą
- [ ] Edge Function weryfikuje nagłówek `Origin` względem listy domen Strzelnicy
- [ ] Funkcja dostępności uwzględnia istniejące Rezerwacje; zajęty Blok jest niedostępny
- [ ] Liczba Uczestników nie może przekroczyć pojemności Osi
- [ ] Formularz wymaga imienia, adresu e-mail, telefonu i akceptacji zgody
- [ ] Po złożeniu Osoba rezerwująca widzi podsumowanie przed wysłaniem i potwierdzenie po wysłaniu
- [ ] Przy zajętym w międzyczasie terminie klient dostaje komunikat i wraca do kalendarza
- [ ] Zajętość odczytywana publicznie nie zawiera danych osobowych
- [ ] Test przeglądarkowy: dwa konteksty składają Rezerwację na ten sam Blok równocześnie, dokładnie jedna się powodzi
- [ ] Test przeglądarkowy: pełne przejście od kalendarza do potwierdzenia
- [ ] Testy jednostkowe pokrywają kolizję Rezerwacji, w tym Rezerwację stykającą się końcem z początkiem kolejnej
