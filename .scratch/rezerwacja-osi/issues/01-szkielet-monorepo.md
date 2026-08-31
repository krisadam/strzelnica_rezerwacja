# 01: Szkielet monorepo i lokalne środowisko

**What to build:** Deweloper klonuje repozytorium, uruchamia jedno polecenie i ma działające
środowisko: obie aplikacje w przeglądarce, lokalną bazę i przechodzące testy.
Nic jeszcze nie robi nic domenowego — to fundament, na którym stanie reszta.

**Blocked by:** Brak (można zacząć od razu)

**Status:** ready-for-agent

- [ ] Monorepo pnpm zawiera `apps/widget`, `apps/panel`, `packages/shared`, `supabase/` i `e2e/`
- [ ] Widget i Panel to osobne aplikacje React + Vite, każda uruchamialna niezależnie
- [ ] Lokalny Supabase startuje w Dockerze jednym poleceniem
- [ ] Vitest uruchamia testy z `packages/shared`, Playwright uruchamia testy z `e2e/`
- [ ] `packages/shared` eksportuje typy generowane ze schematu bazy
- [ ] CI przechodzi lint, kontrolę typów, testy jednostkowe i testy przeglądarkowe
- [ ] README opisuje, jak postawić środowisko od zera
