# Leniwe wygasanie Rezerwacji zamiast zadania cyklicznego

Rezerwacja niepotwierdzona wygasa po 30 minutach. Kuszące jest zadanie
cykliczne przemiatające co minutę całą bazę — i tego **nie robimy**: spec
wyklucza scheduler w tej fazie, a zadanie odpalane co minutę i tak zostawiałoby
okno, w którym termin jest już niczyj, ale wciąż wygląda na zajęty.

Zamiast tego wygaśnięcie liczy się z zegara w chwili patrzenia, dwiema drogami,
bo dwie różne rzeczy tego potrzebują:

**Odczyt** — widoki `lane_occupancy` i `weapon_occupancy` filtrują przez
`booking_holds_term(status, expires_at)`. Termin przestaje być czyjś co do
sekundy, dla każdego, kto na niego patrzy, bez żadnego zapisu po drodze.

**Zapis** — ograniczenie wykluczające `bookings_lane_is_exclusive` pyta
wyłącznie o stan, bo ograniczenia przyjmują tylko wyrażenia niezmienne, a
`now()` niezmienne nie jest. Wiersz stojący jako „oczekująca" trzyma więc Oś
w indeksie także po swoim czasie. Dlatego `place_booking` i `confirm_booking`
wołają `expire_stale_bookings` na wejściu, pod tą samą blokadą doradczą na
Strzelnicę, co reszta zapisu: zamiatamy dokładnie tyle, ile trzeba, i dokładnie
wtedy, kiedy komuś przeszkadza.

Konsekwencja do zaakceptowania: wiersz wygasłej Rezerwacji potrafi stać w stanie
„oczekująca" dowolnie długo, jeśli nikt więcej o ten termin nie zapyta. Dla
dostępności to bez znaczenia — widoki go nie pokazują — ale zestawienia
liczone wprost z `bookings` muszą używać `booking_holds_term`, a nie własnej
listy stanów. To ten sam wybór, co przy wyłączności Osi: obietnicy dotrzymuje
schemat, a nie uprzejmość kodu.

Gdy scheduler pojawi się w projekcie (przypomnienia przed terminem,
anonimizacja), `expire_stale_bookings` można zawołać także z niego — porządku
dla, nie dla poprawności.
