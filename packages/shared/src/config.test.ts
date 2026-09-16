import { describe, expect, it } from 'vitest'
import {
  MissingSupabaseConfigError,
  readEnvFile,
  readServiceConfig,
  readSupabaseConfig,
} from './index.ts'

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

describe('konfiguracja roli serwisowej', () => {
  it('czyta adres i klucz serwisowy ze środowiska', () => {
    expect(
      readServiceConfig({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY: 'klucz-serwisowy',
      }),
    ).toEqual({ url: 'http://127.0.0.1:54321', serviceRoleKey: 'klucz-serwisowy' })
  })

  it('mówi, że brakuje klucza serwisowego, a nie anonimowego', () => {
    expect(() => readServiceConfig(kompletne)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('pilnuje adresu tak samo, jak przy konfiguracji przeglądarki', () => {
    expect(() =>
      readServiceConfig({ VITE_SUPABASE_URL: '127.0.0.1', SUPABASE_SERVICE_ROLE_KEY: 'klucz' }),
    ).toThrow(/nie jest adresem URL/)
  })
})

describe('plik .env', () => {
  it('czyta zmienne razem z cudzysłowami, którymi otacza je Supabase CLI', () => {
    expect(
      readEnvFile('VITE_SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_SERVICE_ROLE_KEY="klucz"\n'),
    ).toEqual({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'klucz',
    })
  })

  it('pomija wiersze, które nie są przypisaniem', () => {
    expect(readEnvFile('# komentarz\n\nA=1\nbyle co\n')).toEqual({ A: '1' })
  })

  it('czyta plik zapisany zakończeniami wiersza Windowsa', () => {
    expect(readEnvFile('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' })
  })
})
