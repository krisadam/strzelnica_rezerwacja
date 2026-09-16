import { describe, expect, it } from 'vitest'
import type { ProvisioningDraft } from './index.ts'
import {
  MalformedProvisioningArgumentsError,
  MAX_FACILITY_SLUG_LENGTH,
  MIN_PANEL_PASSWORD_LENGTH,
  PANEL_PASSWORD_BYTES,
  panelPassword,
  provisioningProblems,
  readProvisioningArguments,
} from './index.ts'

function zamiar(dane: Partial<ProvisioningDraft> = {}): ProvisioningDraft {
  return {
    slug: 'strzelnica-nowa',
    name: 'Strzelnica Nowa',
    email: 'obsluga@strzelnica-nowa.example.pl',
    password: null,
    ...dane,
  }
}

describe('zastrzeżenia do zakładanej Strzelnicy', () => {
  it('przepuszcza komplet, który da się wpisać do bazy', () => {
    expect(provisioningProblems(zamiar())).toEqual([])
  })

  it('wytyka identyfikator z wielkimi literami i ze spacją', () => {
    // Identyfikator jedzie parametrem adresu ramki, więc wolno mu tyle, ile
    // wolno napisowi w adresie bez kodowania.
    expect(provisioningProblems(zamiar({ slug: 'Strzelnica Nowa' }))).toEqual([
      'zly-identyfikator',
    ])
  })

  it('wytyka identyfikator z ukośnikiem, znakiem zapytania i ogonkiem', () => {
    for (const slug of ['strzelnica/nowa', 'strzelnica?nowa', 'strzelnica-łąka']) {
      expect(provisioningProblems(zamiar({ slug }))).toEqual(['zly-identyfikator'])
    }
  })

  it('wytyka identyfikator z myślnikiem na brzegu i z myślnikiem podwójnym', () => {
    for (const slug of ['-nowa', 'nowa-', 'strzelnica--nowa']) {
      expect(provisioningProblems(zamiar({ slug }))).toEqual(['zly-identyfikator'])
    }
  })

  it('wytyka identyfikator pusty i dłuższy, niż wolno', () => {
    expect(provisioningProblems(zamiar({ slug: '' }))).toEqual(['zly-identyfikator'])
    expect(provisioningProblems(zamiar({ slug: 'a'.repeat(MAX_FACILITY_SLUG_LENGTH + 1) }))).toEqual(
      ['zly-identyfikator'],
    )
  })

  it('przepuszcza identyfikator z cyframi i dokładnie tak długi, jak wolno', () => {
    expect(provisioningProblems(zamiar({ slug: 'strzelnica-4' }))).toEqual([])
    expect(provisioningProblems(zamiar({ slug: 'a'.repeat(MAX_FACILITY_SLUG_LENGTH) }))).toEqual([])
  })

  it('wytyka nazwę złożoną z samych spacji', () => {
    expect(provisioningProblems(zamiar({ name: '   ' }))).toEqual(['brak-nazwy'])
  })

  it('wytyka adres, który nie jest adresem e-mail', () => {
    expect(provisioningProblems(zamiar({ email: 'obsluga' }))).toEqual(['niepoprawny-email'])
  })

  it('wytyka hasło krótsze, niż przyjmuje Supabase Auth', () => {
    // Bez tego zastrzeżenia hasło odrzuciłby dopiero GoTrue — po tym, jak
    // Strzelnica stoi już w bazie i zostaje do posprzątania.
    expect(provisioningProblems(zamiar({ password: 'a'.repeat(MIN_PANEL_PASSWORD_LENGTH - 1) })))
      .toEqual(['za-krotkie-haslo'])
  })

  it('przepuszcza hasło dokładnie tak długie, jak wolno', () => {
    expect(
      provisioningProblems(zamiar({ password: 'a'.repeat(MIN_PANEL_PASSWORD_LENGTH) })),
    ).toEqual([])
  })

  it('wypisuje wszystkie zastrzeżenia naraz, w kolejności argumentów', () => {
    expect(provisioningProblems(zamiar({ slug: 'Nowa', name: '', email: 'obsluga' }))).toEqual([
      'zly-identyfikator',
      'brak-nazwy',
      'niepoprawny-email',
    ])
  })
})

describe('argumenty polecenia', () => {
  const komplet = [
    '--identyfikator=strzelnica-nowa',
    '--nazwa=Strzelnica Nowa',
    '--email=obsluga@strzelnica-nowa.example.pl',
  ]

  it('czyta trzy wymagane argumenty zapisane przez znak równości', () => {
    expect(readProvisioningArguments(komplet)).toEqual(zamiar())
  })

  it('czyta argumenty zapisane osobnym słowem', () => {
    expect(
      readProvisioningArguments([
        '--identyfikator',
        'strzelnica-nowa',
        '--nazwa',
        'Strzelnica Nowa',
        '--email',
        'obsluga@strzelnica-nowa.example.pl',
      ]),
    ).toEqual(zamiar())
  })

  it('czyta hasło, gdy operator poda je sam', () => {
    expect(readProvisioningArguments([...komplet, '--haslo=hasło-operatora'])).toEqual(
      zamiar({ password: 'hasło-operatora' }),
    )
  })

  it('obcina spacje wokół wartości', () => {
    expect(
      readProvisioningArguments([
        '--identyfikator=  strzelnica-nowa ',
        '--nazwa',
        '  Strzelnica Nowa  ',
        '--email= obsluga@strzelnica-nowa.example.pl ',
      ]),
    ).toEqual(zamiar())
  })

  it('odmawia przy argumencie podanym dwa razy', () => {
    // Milczące wzięcie ostatniego znaczyłoby Strzelnicę założoną pod innym
    // identyfikatorem, niż operator przeczytał w swoim poleceniu.
    expect(() =>
      readProvisioningArguments([...komplet, '--identyfikator=strzelnica-inna']),
    ).toThrow(/--identyfikator/)
  })

  it('odmawia przy nieznanym argumencie', () => {
    expect(() => readProvisioningArguments([...komplet, '--strefa=Europe/Warsaw'])).toThrow(
      MalformedProvisioningArgumentsError,
    )
  })

  it('odmawia przy wartości bez nazwy argumentu', () => {
    expect(() => readProvisioningArguments(['strzelnica-nowa'])).toThrow(/strzelnica-nowa/)
  })

  it('odmawia przy argumencie bez wartości', () => {
    expect(() => readProvisioningArguments(['--identyfikator'])).toThrow(/--identyfikator/)
    expect(() => readProvisioningArguments(['--identyfikator', '--nazwa=Nowa'])).toThrow(
      /--identyfikator/,
    )
  })

  it('mówi, którego wymaganego argumentu brakuje', () => {
    expect(() => readProvisioningArguments(['--identyfikator=strzelnica-nowa'])).toThrow(/--nazwa/)
    expect(() => readProvisioningArguments([])).toThrow(/--identyfikator/)
  })

  it('przepuszcza wartość wyglądającą jak argument, gdy stoi po znaku równości', () => {
    // Hasło bywa dowolnym napisem i nie ma powodu, żeby myślnik na początku
    // czynił je nazwą argumentu.
    expect(readProvisioningArguments([...komplet, '--haslo=--tajne--'])).toEqual(
      zamiar({ password: '--tajne--' }),
    )
  })
})

describe('hasło pierwszego konta', () => {
  const bajty = (wartosc: number): Uint8Array =>
    new Uint8Array(PANEL_PASSWORD_BYTES).fill(wartosc)

  it('zamienia te same bajty zawsze w to samo hasło', () => {
    expect(panelPassword(bajty(0))).toEqual(panelPassword(bajty(0)))
    expect(panelPassword(bajty(0))).not.toEqual(panelPassword(bajty(1)))
  })

  it('jest dłuższe, niż wymaga Supabase Auth', () => {
    expect(panelPassword(bajty(7)).length).toBeGreaterThanOrEqual(MIN_PANEL_PASSWORD_LENGTH)
  })

  it('składa się wyłącznie ze znaków, które da się przedyktować przez telefon', () => {
    // Bez „l", „o", zera i jedynki: hasło idzie do operatora, a od niego do
    // Strzelnicy — zwykle głosem.
    expect(panelPassword(bajty(3))).toMatch(/^[a-km-np-z2-9-]+$/)
  })

  it('bierze każdy bajt osobno, bez faworyzowania któregokolwiek znaku', () => {
    // Alfabet ma trzydzieści dwa znaki, a bajt dwieście pięćdziesiąt sześć
    // wartości: każdy znak wypada dokładnie osiem razy na dwieście pięćdziesiąt
    // sześć, więc reszta z dzielenia niczego tu nie przechyla.
    const wszystkie = new Uint8Array(256).map((_, index) => index)
    const znaki = new Set(
      Array.from(wszystkie, (bajt) => panelPassword(new Uint8Array(PANEL_PASSWORD_BYTES).fill(bajt)))
        .join('')
        .replace(/-/g, ''),
    )
    expect(znaki.size).toBe(32)
  })

  it('odmawia, gdy losowych bajtów jest mniej, niż trzeba', () => {
    expect(() => panelPassword(new Uint8Array(PANEL_PASSWORD_BYTES - 1))).toThrow(/bajt/)
  })
})
