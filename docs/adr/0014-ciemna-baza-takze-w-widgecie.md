# Ciemna baza także w Widgecie osadzanym na cudzych stronach

Moduł dostaje jedną skórę: granatowy canvas, kremowy tekst, bursztynowy akcent,
hierarchia budowana obwódkami na jednym płaskim tle. Ta sama skóra obowiązuje
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

## Hierarchię niosą obwódki, nie warstwy jasności

Pierwsza wersja tej decyzji brała wzorzec wprost z referencji, na której ciemna
baza stoi: trzy poziomy jasności powierzchni — canvas ciemniejszy od panelu,
panel od karty — zero cieni, duże promienie. Rozstrzygnął to dopiero prototyp,
bo jednej rzeczy nie dało się przewidzieć na papierze: Kalendarz jest ekranem,
na którym Bloki wolne i niedostępne stoją obok siebie, a kolor jest tam
**jedynym** nośnikiem stanu.

Trzy warianty postawione na tym samym DOM-ie różniły się wyłącznie sposobem
budowania hierarchii: warstwy jasności, obwódki na płaskim tle, oraz pas
nagłówka z jasnymi płytami kart. Wybrany został **wariant oparty na obwódkach**:
jedno tło pod wszystkim, karty i Bloki bez wypełnienia, granice rysowane
kreską i kolorem, promienie drobne (0,35–0,5 rem) zamiast osiemnastopunktowych
z referencji.

Skutek dla całej reszty dokumentu: zdanie „hierarchia wyłącznie jasnością
powierzchni" **przestało obowiązywać**, i nie jest to przeoczenie ani regres do
poprzedniego wyglądu. Kto zobaczy płaskie tło i cienkie obwódki tam, gdzie
referencja ma warstwy, patrzy na wynik prototypu, a nie na niedokończoną robotę.

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
Przy hierarchii obwódkowej akcent kładzie się na **obwódkę i napis**, a nie na
wypełnienie: bursztyn na granacie trzyma 6,5:1, więc przycisk konturowy jest
czytelny, a wypełniona plama byłaby jedyną taką powierzchnią na całym ekranie
i kłóciłaby się z zasadą, że nic tu nie ma wypełnienia.

Kolor stanu niesie w Bloku **napis**, a obwódka zostaje neutralna. Zieleń
obwódki wolnego Bloku razem z zielonym napisem „wolny" powtarzałaby ten sam
sygnał dwa razy — a to dokładnie ta dwuznaczność, którą wyżej odbieramy
przyciskowi głównemu.

Paleta, promienie i skala nagłówków mieszkają w jednym pliku tokenów wspólnym
dla obu aplikacji, tak samo jak reguły domenowe mieszkają w `packages/shared`.
Dwie kopie zmiennych w dwóch arkuszach są tym, od czego ta decyzja odchodzi.

## Stan

Decyzja przyjęta, sposób jej wykonania rozstrzygnięty prototypem, kodu jeszcze
nie ma — ten dokument powstał przed nim celowo. Sama zmiana wyglądu przyjdzie
osobnymi ticketami; ten ADR jest ich przesłanką, a nie zapisem tego, co już
w repozytorium stoi. Kod da się odtworzyć; rozumowanie stojące za ciemnym
Widgetem nie.
