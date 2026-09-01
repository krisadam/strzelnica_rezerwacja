import { describe, expect, it } from 'vitest'
import { MissingSupabaseConfigError, readSupabaseConfig } from './index.ts'

const kompletne = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'klucz-anonimowy',
}

describe('konfiguracja Supabase', () => {
  it('czyta adres i klucz ze środowiska', () => {
    expect(readSupabaseConfig(kompletne)).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'klucz-anonimowy',
    })
  })

  it('mówi, której zmiennej brakuje', () => {
    expect(() => readSupabaseConfig({ ...kompletne, VITE_SUPABASE_ANON_KEY: undefined })).toThrow(
      /VITE_SUPABASE_ANON_KEY/,
    )
    expect(() => readSupabaseConfig({ ...kompletne, VITE_SUPABASE_URL: undefined })).toThrow(
      /VITE_SUPABASE_URL/,
    )
  })

  it('traktuje zmienną wypełnioną spacjami jak brakującą', () => {
    expect(() => readSupabaseConfig({ ...kompletne, VITE_SUPABASE_ANON_KEY: '   ' })).toThrow(
      MissingSupabaseConfigError,
    )
  })

  it('odrzuca adres, który nie jest URL-em', () => {
    expect(() => readSupabaseConfig({ ...kompletne, VITE_SUPABASE_URL: '127.0.0.1' })).toThrow(
      /nie jest adresem URL/,
    )
  })

  it('odrzuca adres o protokole innym niż http(s)', () => {
    expect(() =>
      readSupabaseConfig({ ...kompletne, VITE_SUPABASE_URL: 'postgres://localhost:54322' }),
    ).toThrow(/adresem http/)
  })

  it('podpowiada polecenie, którym uzupełnia się .env', () => {
    expect(() => readSupabaseConfig({})).toThrow(/pnpm db:env/)
  })
})
