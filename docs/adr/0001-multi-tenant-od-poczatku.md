# Multi-tenant od pierwszego dnia, mimo jednej strzelnicy

Moduł startuje z jednym realnym odbiorcą, ale schemat od początku rozdziela
dane po `facility_id`, a dostęp reguluje RLS oparty na przynależności do
Strzelnicy. Powód: dołożenie tenanta do działającego systemu z politykami RLS
oznacza rewizję każdej tabeli, każdej polityki i każdego zapytania, podczas
gdy koszt wprowadzenia go teraz to jedna kolumna i jeden warunek.

Konsekwencja: nie ma panelu superadmina. Nowe Strzelnice zakłada się skryptem
seedującym — self-service rejestracja została świadomie odrzucona jako
przedwczesna.
