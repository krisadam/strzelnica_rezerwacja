# Ciemna baza także w Widgecie osadzanym na cudzych stronach

Moduł dostaje jedną skórę: granatowy canvas, kremowy tekst, bursztynowy akcent,
hierarchia budowana wyłącznie jasnością powierzchni. Ta sama skóra obowiązuje
w Panelu i w Widgecie — a Widget, zgodnie z ADR 0002, ląduje w `<iframe>` na
stronach WWW, nad którymi nie mamy kontroli i które w większości są jasne.

Decyzja jest więc świadomym odwróceniem tego, co robił Widget do tej pory. Biały
Widget wtapiał się w cudzą stronę i wyglądał na jej część. Ciemny nie wtopi się
nigdzie: jest prostokątem w innym kolorze niż wszystko dookoła. Przyjmujemy to,
bo Widget **nie jest** częścią cudzej strony i udawanie, że jest, było pozorem —
iframe i tak nie dziedziczy niczego ze stylów gospodarza, więc biel zgadzała się
z otoczeniem przypadkiem, tylko dopóty, dopóki gospodarz też był biały. Ciemna
ramka mówi wprost, gdzie kończy się strona Strzelnicy, a zaczyna rezerwacja.

Odrzucone: **dwie skóry** — ciemny Panel jako narzędzie pracy i jasny Widget jako
witryna. Rozwiązywało to problem osadzenia i było pierwszą rekomendacją, ale
kosztowało dwie palety do utrzymania w miejscu, w którym już raz się rozjechały
(ten sam zestaw zmiennych stał przepisany ręcznie w dwóch arkuszach i zdążył się
rozejść o dwie pozycje). Jeden moduł ma wyglądać jak jeden moduł.

Odrzucone: **motywowanie per Strzelnica** — ciemny albo jasny Widget zależnie od
strony gospodarza, albo paleta z konfiguracji. To cofnięcie decyzji stojącej
w specyfikacji modułu („Jeden wygląd dla wszystkich Strzelnic — bez konfiguracji
kolorów", personalizacja wyglądu wprost poza zakresem) i nie zmieniamy jej przy
okazji zmiany palety. Strzelnica konfiguruje treść — regulamin, politykę — a nie
wygląd.

## Konsekwencje

Loader nadaje ramce promień i margines **wyłącznie poziomy**, żeby czytała się
jako celowa ciemna karta, a nie jak dziura w layoucie gospodarza. Pionowego
marginesu nie ma świadomie: wysokość ramki jest synchronizowana przez
`postMessage` i mierzona w teście osadzenia, więc odstęp w pionie wchodziłby
w ten sam wymiar, o którym mówi protokół.

Strona demo gospodarza zostaje jasna i obca (`#f4efe7`, Georgia). To jedyne
miejsce, w którym ryzyko tej decyzji widać gołym okiem, więc dopasowanie jej do
naszej palety usunęłoby test, zamiast go zdać.

Kolory stanu musiały **pojaśnieć**, a nie stonować się: na granacie ciemna
zieleń wolnego terminu i ciemna czerwień błędu schodzą poniżej progu
czytelności. Wszystkie trzy — wolny, błąd, wyłączony — trzymają co najmniej
4,5:1 wobec tła. Kto zechce je kiedyś „uspokoić", cofnie przy okazji dostępność
publicznego formularza rezerwacji.

Przycisk główny przestaje brać kolor wolnego terminu i bierze akcent. Dotąd
zieleń znaczyła naraz „ten termin jest do wzięcia" i „naciśnij mnie"; przy
palecie, w której kolor pojawia się rzadko, ta dwuznaczność stałaby się widoczna.

Paleta, promienie i skala nagłówków mieszkają w jednym pliku tokenów wspólnym
dla obu aplikacji, tak samo jak reguły domenowe mieszkają w `packages/shared`.
Dwie kopie zmiennych w dwóch arkuszach są tym, od czego ta decyzja odchodzi.

## Stan

Decyzja przyjęta, implementacji jeszcze nie ma — ten dokument powstał przed nią
celowo. Kod da się odtworzyć; rozumowanie stojące za ciemnym Widgetem nie.
