import { describe, expect, it } from 'vitest'
import type { Lane, LaneDraft } from './index.ts'
import {
  laneProblems,
  MalformedLaneRequestError,
  MAX_LANE_CAPACITY,
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
  return { id: null, name: 'Oś nowa', capacity: 4, active: true, ...dane }
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

  it('wymienia wszystkie zastrzeżenia naraz', () => {
    expect(laneProblems({ draft: zamiar({ name: '', capacity: 0 }), lanes: [] })).toEqual([
      'brak-nazwy',
      'zla-pojemnosc',
    ])
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
      readLaneRequest({ id: null, name: 'Oś nowa', capacity: 4, active: true }),
    ).toEqual({ id: null, name: 'Oś nowa', capacity: 4, active: true })
  })

  it('czyta żądanie zmiany Osi istniejącej', () => {
    expect(
      readLaneRequest({
        id: OS_PISTOLETOWA,
        name: '  Oś pistoletowa nr 1  ',
        capacity: 6,
        active: false,
      }),
    ).toEqual({
      id: OS_PISTOLETOWA,
      name: 'Oś pistoletowa nr 1',
      capacity: 6,
      active: false,
    })
  })

  it('odmawia żądaniu, które o polu `id` milczy', () => {
    // Puste `id` znaczy Oś nową, więc żądanie bez tego pola byłoby nie do
    // odróżnienia od takiego, które prosi o nową — a literówka w jego nazwie
    // zakładałaby Oś zamiast poprawić istniejącą.
    expect(() => readLaneRequest({ name: 'Oś nowa', capacity: 4, active: true })).toThrow(
      MalformedLaneRequestError,
    )
  })

  it('przepuszcza nazwę pustą — orzeka o niej zastrzeżenie, nie kształt', () => {
    // To samo, co z powodem Blokady: odsianie pustej nazwy już tutaj czyniłoby
    // „brak nazwy" odpowiedzią, której serwer nigdy nie udziela.
    expect(readLaneRequest({ id: null, name: '   ', capacity: 4, active: true })).toEqual({
      id: null,
      name: '',
      capacity: 4,
      active: true,
    })
  })

  it('przepuszcza pojemność spoza zakresu, a odmawia pojemności, która nie jest liczbą', () => {
    expect(readLaneRequest({ id: null, name: 'Oś', capacity: 0, active: true }).capacity).toBe(0)
    expect(() =>
      readLaneRequest({ id: null, name: 'Oś', capacity: '4', active: true }),
    ).toThrow(MalformedLaneRequestError)
    expect(() =>
      readLaneRequest({ id: null, name: 'Oś', capacity: 4.5, active: true }),
    ).toThrow(MalformedLaneRequestError)
  })

  it('odmawia żądaniu bez nazwy i bez znacznika czynnej Osi', () => {
    expect(() => readLaneRequest({ id: null, capacity: 4, active: true })).toThrow(
      MalformedLaneRequestError,
    )
    expect(() => readLaneRequest({ id: null, name: 'Oś', capacity: 4 })).toThrow(
      MalformedLaneRequestError,
    )
  })

  it('odmawia treści, która nie jest obiektem', () => {
    expect(() => readLaneRequest(null)).toThrow(MalformedLaneRequestError)
    expect(() => readLaneRequest('os')).toThrow(MalformedLaneRequestError)
  })
})
