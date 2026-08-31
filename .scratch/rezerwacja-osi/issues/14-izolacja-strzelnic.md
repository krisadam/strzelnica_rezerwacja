# 14: Izolacja Strzelnic

**What to build:** Użytkownik panelu jednej Strzelnicy nie widzi i nie może zmienić niczego,
co należy do innej — nawet gdy zna identyfikatory. To gwarancja wpisana
w bazę, nie w interfejs.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] Wszystkie tabele domenowe mają włączone RLS z politykami opartymi na przynależności do Strzelnicy
- [ ] Seed zawiera drugą Strzelnicę z własnymi Osiami i Rezerwacjami
- [ ] Odczyt i zapis danych obcej Strzelnicy jest niemożliwy niezależnie od znajomości identyfikatorów
- [ ] Publiczny klucz Widgetu nie pozwala odczytać danych osobowych z żadnej Strzelnicy
- [ ] Test przeglądarkowy potwierdza niewidoczność danych obcej Strzelnicy po zalogowaniu
