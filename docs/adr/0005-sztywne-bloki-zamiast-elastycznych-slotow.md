# Sztywne Bloki zamiast dowolnego zakresu Slotów

Grafik opiera się na siatce 30-minutowych Slotów, ale Osoba rezerwująca nie
składa Rezerwacji z dowolnej liczby kolejnych Slotów — wybiera jeden
z **Bloków wypisanych ręcznie przez Strzelnicę** dla każdej Osi i każdego dnia
tygodnia (Blok trwa wielokrotność Slotu).

Odrzucone: wybór zakresu 1–N Slotów przez klienta. Prowadzi do fragmentacji
grafiku — dziury nie do sprzedania między Rezerwacjami — i rozjeżdża się
z tym, jak Strzelnica realnie planuje dzień. Odrzucony też generator Bloków
z długości i przerwy: zawsze rozminie się z faktycznym rozkładem (przerwa
obiadowa, inny rytm osi karabinowej).

Konsekwencja: konfiguracja rozkładu jest żmudna i wymaga funkcji kopiowania
Bloków między dniami i Osiami. Przerwa techniczna między Rezerwacjami wynika
z odstępu między Blokami, więc nie ma osobnego pojęcia bufora.
