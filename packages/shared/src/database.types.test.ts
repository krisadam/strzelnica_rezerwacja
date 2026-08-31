import { describe, expect, it } from 'vitest'
import type { Tables, TablesInsert } from './index.js'

// Typy pochodzą z `pnpm db:types`. Ten test nie sprawdza logiki — pilnuje,
// że eksportowany kształt daje się użyć i nadąża za migracjami. Gdy kolumna
// zniknie ze schematu, kontrola typów padnie tutaj, a nie u konsumenta.
describe('typy ze schematu bazy', () => {
  it('Strzelnica ma identyfikator, slug, nazwę i strefę', () => {
    const strzelnica: Tables<'facilities'> = {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'strzelnica-demo',
      name: 'Strzelnica Demo',
      timezone: 'Europe/Warsaw',
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(strzelnica.timezone).toBe('Europe/Warsaw')
  })

  it('zapis Strzelnicy wymaga tylko slug i nazwy — resztę uzupełnia baza', () => {
    const nowa: TablesInsert<'facilities'> = {
      slug: 'strzelnica-druga',
      name: 'Strzelnica Druga',
    }

    expect(nowa.timezone).toBeUndefined()
  })
})
