# 02: Kalendarz wolnych Bloków

**What to build:** Osoba rezerwująca wchodzi na stronę Widgetu, wybiera Oś i widzi grafik
wolnych Bloków na kolejne dni. To pierwszy pełny przekrój przez wszystkie
warstwy: schemat, reguły, interfejs.

Rezerwacje jeszcze nie istnieją — wszystkie Bloki w godzinach otwarcia są
wolne, a niedostępność wynika wyłącznie z rozkładu, godzin otwarcia
i wyjątków kalendarzowych.

**Blocked by:** 1

**Status:** ready-for-agent

- [ ] Schemat obejmuje Strzelnicę, Oś z pojemnością, Rozkład Bloków, godziny otwarcia i wyjątki kalendarzowe
- [ ] Każda tabela domenowa niesie identyfikator Strzelnicy; czas przechowywany w UTC
- [ ] Rozkład Bloków definiowany osobno dla każdej Osi i każdego dnia tygodnia, każdy Blok jest wielokrotnością 30 minut
- [ ] Wyznaczanie dostępnych Bloków jest czystą funkcją w `packages/shared`, przyjmującą „teraz" jako parametr
- [ ] Polityki RLS pozwalają anonimowo czytać dane publiczne Strzelnicy i nie pozwalają czytać niczego innego
- [ ] Seed tworzy jedną Strzelnicę z dwiema Osiami i rozkładem na 30 dni w przód
- [ ] Widget pozwala wybrać Oś i przechodzić między dniami, pokazując Bloki jako wolne lub niedostępne
- [ ] Dzień objęty wyjątkiem kalendarzowym nie pokazuje żadnych Bloków
- [ ] Testy jednostkowe pokrywają: Blok poza godzinami otwarcia, wyjątek kalendarzowy, Blok przecinający granicę doby
