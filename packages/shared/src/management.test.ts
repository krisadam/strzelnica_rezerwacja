import { describe, expect, it } from 'vitest'
import { CONFIRMATION_PARAM, MANAGEMENT_PARAM, managementUrl } from './index.ts'

const LINK = managementUrl({
  widgetOrigin: 'https://widget.example.pl',
  facilitySlug: 'strzelnica-demo',
  token: 'abc123',
})

describe('Link do zarządzania Rezerwacją', () => {
  it('prowadzi do Widgetu podanego wprost, bo e-mail otwiera się poza witryną Strzelnicy', () => {
    expect(LINK.startsWith('https://widget.example.pl/?')).toBe(true)
  })

  it('niesie Strzelnicę i token', () => {
    const parametry = new URL(LINK).searchParams
    expect(parametry.get('strzelnica')).toBe('strzelnica-demo')
    expect(parametry.get(MANAGEMENT_PARAM)).toBe('abc123')
  })

  // Dwa różne parametry, bo dwa różne uprawnienia: potwierdzenie działa raz
  // i nic więcej, zarządzanie otwiera Rezerwację na cały czas jej trwania.
  it('nie podszywa się pod link potwierdzający', () => {
    expect(MANAGEMENT_PARAM).not.toBe(CONFIRMATION_PARAM)
    expect(new URL(LINK).searchParams.has(CONFIRMATION_PARAM)).toBe(false)
  })

  it('nie przyjmuje ścieżki w miejscu źródła Widgetu', () => {
    expect(
      managementUrl({
        widgetOrigin: 'https://widget.example.pl/gdziekolwiek',
        facilitySlug: 'demo',
        token: 'x',
      }),
    ).toBe(LINK.replace('strzelnica-demo', 'demo').replace('abc123', 'x'))
  })
})
