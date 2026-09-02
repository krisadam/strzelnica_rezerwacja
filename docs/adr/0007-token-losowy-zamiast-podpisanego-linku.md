# Token losowy zamiast podpisanego linku

Spec mówi: „Dostęp do Rezerwacji dla klienta bez konta odbywa się przez token
w podpisanym linku, nie przez identyfikator Rezerwacji". Robimy pierwszą i trzecią
część, a **podpisu nie**: link niesie 256 bitów losowości z `crypto.getRandomValues`,
zapisane przy Rezerwacji i porównywane przy wejściu.

Powód: podpis rozwiązuje problem, którego tu nie ma. Podpisany token pozwala
zweryfikować link **bez odczytu z bazy** — a my i tak musimy do niej sięgnąć, bo
o tym, czy link jeszcze działa, rozstrzyga stan Rezerwacji i jej czas, a nie
treść linku. Podpis dokładałby więc sekret do trzymania i rotowania, nie
zdejmując ani jednego zapytania. Token losowy jest przy tym nie do zgadnięcia
tak samo jak podpisany, a wycofuje się go skuteczniej: zmianą wiersza, a nie
unieważnieniem klucza wspólnego dla wszystkich Rezerwacji.

Identyfikator Rezerwacji nie nadaje się na to miejsce i tu spec ma rację
w całości: wraca do przeglądarki na ekranie potwierdzenia, więc link liczony
z niego każdy klient umiałby sobie podrobić dla cudzej Rezerwacji.

## Brak sprawdzenia `Origin` przy potwierdzaniu

Z tej samej decyzji wynika druga: `potwierdz-rezerwacje` nie sprawdza nagłówka
`Origin`, choć `zloz-rezerwacje` sprawdza. Przy zapisie lista domen jest bramką,
bo o zapis prosi cudza strona w imieniu swojego gościa i to ona ma być na liście
Strzelnicy. Przy potwierdzaniu jedynym upoważnieniem jest token: nie ma
ciasteczka ani sesji, którą obca strona mogłaby wykorzystać w imieniu ofiary,
więc lista domen nie zamknęłaby niczego — zamknęłaby najwyżej klienta poczty
otwierającego link bez nagłówka.

Konsekwencja do zaakceptowania: końcówka przyjmuje tokeny od każdego i nie ma
ograniczenia liczby prób. Zgadywanie 256 bitów nie jest realną drogą, ale gdy
projekt dorobi się limitowania żądań, to jest miejsce, które ma je dostać.
