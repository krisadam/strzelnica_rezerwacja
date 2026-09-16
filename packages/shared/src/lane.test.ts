import { describe, expect, it } from 'vitest'
import type { Lane, LaneDraft } from './index.ts'
import {
  laneProblems,
  MalformedLaneRequestError,
  MAX_LANE_CAPACITY,
  MAX_RATE_GR,
  readLaneRequest,
} from './index.ts'

const OS_PISTOLETOWA = 'os-1'
const OS_KARABINOWA = 'os-2'

function os(dane: Partial<Lane> = {}): Lane {
  return {
    id: OS_PISTOLETOWA,
    name: 'Oś pistoletowa nr 1',
    capacity: 4,
    blockRate: 12000,
    active: true,
    ...dane,
  }
}

/** Wypełniony formularz nowej Osi; `id` puste znaczy Oś, której jeszcze nie ma. */
function zamiar(dane: Partial<LaneDraft> = {}): LaneDraft {
  return { id: null, name: 'Oś nowa', capacity: 4, blockRate: 12_000, active: true, ...dane }
}

describe('zastrzeżenia do Osi', () => {
  it('przepuszcza nową Oś o nazwie, której Strzelnica jeszcze nie używa', () => {
    expect(laneProblems({ draft: zamiar(), lanes: [os()] })).toEqual([])
  })

  it('wytyka Oś bez nazwy', () => {
    expect(laneProblems({ draft: zamiar({ name: '   ' }), lanes: [] })).toEqual(['brak-nazwy'])
  })

  it('wytyka nazwę zajętą przez inną Oś', () => {
    // Nazwa jest tym, po czym obsługa poznaje Oś w każdym polu wyboru Panelu —
    // dwie „Oś nr 1" znaczą telefon do koleżanki przy każdej Rezerwacji.
    expect(
      laneProblems({ draft: zamiar({ name: 'Oś pistoletowa nr 1' }), lanes: [os()] }),
    ).toEqual(['nazwa-zajeta'])
  })

  it('nie liczy jako zajętej nazwy, którą Oś nosi sama', () => {
    expect(
      laneProblems({
        draft: zamiar({ id: OS_PISTOLETOWA, name: 'Oś pistoletowa nr 1' }),
        lanes: [os()],
      }),
    ).toEqual([])
  })

  it('nie odróżnia nazw samymi spacjami po bokach', () => {
    expect(
      laneProblems({ draft: zamiar({ name: '  Oś pistoletowa nr 1 ' }), lanes: [os()] }),
    ).toEqual(['nazwa-zajeta'])
  })

  it('wytyka pojemność, która nie jest dodatnią liczbą Uczestników', () => {
    expect(laneProblems({ draft: zamiar({ capacity: 0 }), lanes: [] })).toEqual(['zla-pojemnosc'])
    expect(laneProblems({ draft: zamiar({ capacity: -2 }), lanes: [] })).toEqual(['zla-pojemnosc'])
    expect(laneProblems({ draft: zamiar({ capacity: 2.5 }), lanes: [] })).toEqual([
      'zla-pojemnosc',
    ])
    expect(laneProblems({ draft: zamiar({ capacity: Number.NaN }), lanes: [] })).toEqual([
      'zla-pojemnosc',
    ])
  })

  it('wytyka pojemność większą, niż Oś może mieć', () => {
    // Granica jest po to, żeby liczba niemieszcząca się w kolumnie wróciła
    // zastrzeżeniem, a nie awarią serwera.
    expect(
      laneProblems({ draft: zamiar({ capacity: MAX_LANE_CAPACITY + 1 }), lanes: [] }),
    ).toEqual(['zla-pojemnosc'])
    expect(laneProblems({ draft: zamiar({ capacity: MAX_LANE_CAPACITY }), lanes: [] })).toEqual([])
  })

  it('przepuszcza stawkę zerową — Oś w cenie wstępu jest odpowiedzią, nie brakiem', () => {
    expect(laneProblems({ draft: zamiar({ blockRate: 0 }), lanes: [] })).toEqual([])
  })

  it('wytyka stawkę za Blok, która nie jest liczbą groszy', () => {
    expect(laneProblems({ draft: zamiar({ blockRate: -1 }), lanes: [] })).toEqual(['zla-stawka'])
    // Cena wpisana w złotych przechodzi przez `parseAmount`, więc ułamek grosza
    // dociera tutaj jako nie-liczba — i ma wrócić zastrzeżeniem, a nie
    // zaokrągleniem, którego nikt nie zobaczy.
    expect(laneProblems({ draft: zamiar({ blockRate: Number.NaN }), lanes: [] })).toEqual([
      'zla-stawka',
    ])
    expect(laneProblems({ draft: zamiar({ blockRate: MAX_RATE_GR + 1 }), lanes: [] })).toEqual([
      'zla-stawka',
    ])
  })

  it('wymienia wszystkie zastrzeżenia naraz', () => {
    expect(
      laneProblems({ draft: zamiar({ name: '', capacity: 0, blockRate: -1 }), lanes: [] }),
    ).toEqual(['brak-nazwy', 'zla-pojemnosc', 'zla-stawka'])
  })

  it('przepuszcza Oś wyłączaną — wyłączenie nie jest zmianą wymagającą niczego', () => {
    expect(
      laneProblems({
        draft: zamiar({ id: OS_KARABINOWA, name: 'Oś karabinowa nr 2', active: false }),
        lanes: [os(), os({ id: OS_KARABINOWA, name: 'Oś karabinowa nr 2' })],
      }),
    ).toEqual([])
  })
})

describe('żądanie zapisu Osi', () => {
  it('czyta żądanie nowej Osi', () => {
    expect(
      readLaneRequest({ id: null, name: 'Oś nowa', capacity: 4, blockRateGr: 12_000, active: true }),
    ).toEqual({ id: null, name: 'Oś nowa', capacity: 4, blockRate: 12_000, active: true })
  })

  it('czyta żądanie zmiany Osi istniejącej', () => {
    expect(
      readLaneRequest({
        id: OS_PISTOLETOWA,
        name: '  Oś pistoletowa nr 1  ',
        capacity: 6,
        blockRateGr: 15_000,
        active: false,
      }),
    ).toEqual({
      id: OS_PISTOLETOWA,
      name: 'Oś pistoletowa nr 1',
      capacity: 6,
      blockRate: 15_000,
      active: false,
    })
  })

  it('odmawia żądaniu, które o polu `id` milczy', () => {
    // Puste `id` znaczy Oś nową, więc żądanie bez tego pola byłoby nie do
    // odróżnienia od takiego, które prosi o nową — a literówka w jego nazwie
    // zakładałaby Oś zamiast poprawić istniejącą.
    expect(() =>
      readLaneRequest({ name: 'Oś nowa', capacity: 4, blockRateGr: 0, active: true }),
    ).toThrow(MalformedLaneRequestError)
  })

  it('przepuszcza nazwę pustą — orzeka o niej zastrzeżenie, nie kształt', () => {
    // To samo, co z powodem Blokady: odsianie pustej nazwy już tutaj czyniłoby
    // „brak nazwy" odpowiedzią, której serwer nigdy nie udziela.
    expect(
      readLaneRequest({ id: null, name: '   ', capacity: 4, blockRateGr: 0, active: true }),
    ).toEqual({
      id: null,
      name: '',
      capacity: 4,
      blockRate: 0,
      active: true,
    })
  })

  it('przepuszcza liczby spoza zakresu, a odmawia tym, które liczbami nie są', () => {
    const ZADANIE = { id: null, name: 'Oś', capacity: 4, blockRateGr: 0, active: true }

    expect(readLaneRequest({ ...ZADANIE, capacity: 0 }).capacity).toBe(0)
    expect(readLaneRequest({ ...ZADANIE, blockRateGr: -1 }).blockRate).toBe(-1)
    expect(() => readLaneRequest({ ...ZADANIE, capacity: '4' })).toThrow(MalformedLaneRequestError)
    expect(() => readLaneRequest({ ...ZADANIE, capacity: 4.5 })).toThrow(
      MalformedLaneRequestError,
    )
    expect(() => readLaneRequest({ ...ZADANIE, blockRateGr: '120' })).toThrow(
      MalformedLaneRequestError,
    )
  })

  it('odmawia żądaniu bez nazwy, bez stawki i bez znacznika czynnej Osi', () => {
    expect(() =>
      readLaneRequest({ id: null, capacity: 4, blockRateGr: 0, active: true }),
    ).toThrow(MalformedLaneRequestError)
    expect(() => readLaneRequest({ id: null, name: 'Oś', capacity: 4, active: true })).toThrow(
      MalformedLaneRequestError,
    )
    expect(() =>
      readLaneRequest({ id: null, name: 'Oś', capacity: 4, blockRateGr: 0 }),
    ).toThrow(MalformedLaneRequestError)
  })

  it('odmawia treści, która nie jest obiektem', () => {
    expect(() => readLaneRequest(null)).toThrow(MalformedLaneRequestError)
    expect(() => readLaneRequest('os')).toThrow(MalformedLaneRequestError)
  })
})
