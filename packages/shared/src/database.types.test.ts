import { describe, expect, it } from 'vitest'
import type { Tables, TablesInsert } from './index.ts'

// Typy pochodzą z `pnpm db:types`. Ten test nie sprawdza logiki — pilnuje,
// że eksportowany kształt daje się użyć i nadąża za migracjami. Gdy kolumna
// zniknie ze schematu, kontrola typów padnie tutaj, a nie u konsumenta.
describe('typy ze schematu bazy', () => {
  it('Strzelnica ma slug, strefę, reguły czasowe, domeny osadzenia i Pulę', () => {
    const strzelnica: Tables<'facilities'> = {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'strzelnica-demo',
      name: 'Strzelnica Demo',
      timezone: 'Europe/Warsaw',
      booking_horizon_days: 30,
      min_lead_minutes: 120,
      cancellation_window_hours: 24,
      allowed_origins: ['https://klient.example.pl'],
      instructor_pool: 2,
      participation_rate_gr: 3000,
      instructor_rate_gr: 8000,
      notification_email: 'recepcja@example.pl',
      contact_email: 'kontakt@example.pl',
      contact_phone: '+48 123 456 789',
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(strzelnica.timezone).toBe('Europe/Warsaw')
    // Adres powiadomień jest polem Strzelnicy, a nie stałą platformy: jedna
    // czyta pocztę na recepcji, druga u kierownika.
    expect(strzelnica.notification_email).toBe('recepcja@example.pl')
    // Kontakt podawany klientom jest osobną kolumną, bo jest osobną sprawą:
    // skrzynka obsługi nie wychodzi publicznie, a ten kontakt właśnie ma.
    expect(strzelnica.contact_email).not.toBe(strzelnica.notification_email)
  })

  it('zapis Strzelnicy wymaga tylko slug i nazwy — resztę uzupełnia baza', () => {
    const nowa: TablesInsert<'facilities'> = {
      slug: 'strzelnica-druga',
      name: 'Strzelnica Druga',
    }

    expect(nowa.timezone).toBeUndefined()
    // Reguły czasowe mają wartości domyślne, więc nowa Strzelnica ma je
    // sensowne, zanim ktokolwiek wejdzie do Panelu.
    expect(nowa.booking_horizon_days).toBeUndefined()
    expect(nowa.min_lead_minutes).toBeUndefined()
    expect(nowa.cancellation_window_hours).toBeUndefined()
    expect(nowa.instructor_pool).toBeUndefined()
    // Stawki tak samo: Strzelnica bez cennika liczy zero, a nie kwotę zmyśloną
    // za nią przez migracje.
    expect(nowa.participation_rate_gr).toBeUndefined()
    expect(nowa.instructor_rate_gr).toBeUndefined()
    // Adres powiadomień wolno zostawić pustym — Strzelnica, która ich nie chce,
    // jest odpowiedzią, a nie konfiguracją niedokończoną.
    expect(nowa.notification_email).toBeUndefined()
    // Kontakt dla klientów tak samo: wpisuje go Strzelnica w Panelu, a numeru
    // zmyślonego za nią przez migrację nikt nie chce widzieć na ekranie.
    expect(nowa.contact_email).toBeUndefined()
    expect(nowa.contact_phone).toBeUndefined()
  })

  it('Oś niesie identyfikator Strzelnicy, pojemność i stawkę za Blok', () => {
    const os: Tables<'lanes'> = {
      id: '00000000-0000-0000-0000-0000000000a1',
      facility_id: '00000000-0000-0000-0000-000000000001',
      name: 'Oś pistoletowa nr 1',
      capacity: 4,
      block_rate_gr: 12000,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(os.capacity).toBe(4)
    // Stawka za Blok jest własnością Osi, nie Strzelnicy.
    expect(os.block_rate_gr).toBe(12000)
  })

  it('pozycja rozkładu wiąże Oś z dniem tygodnia i minutą początku', () => {
    const pozycja: TablesInsert<'block_schedules'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      lane_id: '00000000-0000-0000-0000-0000000000a1',
      weekday: 1,
      start_minute: 600,
      duration_minutes: 120,
    }

    expect(pozycja.duration_minutes % 30).toBe(0)
  })

  it('wyjątek kalendarzowy niesie datę, a powód jest opcjonalny', () => {
    const wyjatek: Tables<'calendar_exceptions'> = {
      id: '00000000-0000-0000-0000-0000000000b1',
      facility_id: '00000000-0000-0000-0000-000000000001',
      closed_on: '2026-06-20',
      reason: null,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(wyjatek.reason).toBeNull()
  })

  it('godziny otwarcia dopuszczają domknięcie po północy', () => {
    const godziny: TablesInsert<'opening_hours'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      weekday: 6,
      opens_minute: 540,
      closes_minute: 1500,
    }

    expect(godziny.closes_minute).toBeGreaterThan(1440)
  })

  it('Rezerwacja niesie stan, kontakt, liczbę Uczestników i Instruktora', () => {
    const rezerwacja: TablesInsert<'bookings'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      lane_id: '00000000-0000-0000-0000-0000000000a1',
      starts_at: '2026-06-15T08:00:00Z',
      ends_at: '2026-06-15T10:00:00Z',
      status: 'potwierdzona',
      participants: 2,
      contact_name: 'Anna Kowalska',
      contact_email: 'anna@example.pl',
      contact_phone: '600100200',
      has_permit: false,
      with_instructor: true,
      amount_gr: 37000,
      block_rate_gr: 12000,
      participation_rate_gr: 3000,
      instructor_rate_gr: 8000,
    }

    expect(rezerwacja.status).toBe('potwierdzona')
    // Deklaracja i obecność Instruktora podawane wprost: kolumny straciły
    // wartości domyślne, żeby wpis nie mógł o nich milczkiem zapomnieć.
    expect(rezerwacja.with_instructor).toBe(true)
    // Kwota i stawki, z których się policzyła, podawane wprost i bez wartości
    // domyślnych: Rezerwacja zapisana bez nich byłaby rachunkiem, którego nikt
    // nie umie wytłumaczyć — i Kwotą, którą przeliczyłaby przyszła podwyżka.
    expect(rezerwacja.amount_gr).toBe(37000)
    expect(rezerwacja.block_rate_gr).toBe(12000)
    // Moment akceptacji regulaminu uzupełnia baza, tak jak datę utworzenia.
    expect(rezerwacja.consented_at).toBeUndefined()
    // Rezerwacja powstaje nieodwołana; chwilę odwołania wpisuje anulowanie.
    expect(rezerwacja.cancelled_at).toBeUndefined()
  })

  it('Typ broni niesie pulę sztuk i cenę za sztukę', () => {
    const typ: Tables<'weapon_types'> = {
      id: '00000000-0000-0000-0000-0000000000c1',
      facility_id: '00000000-0000-0000-0000-000000000001',
      name: 'Glock 17',
      pool: 3,
      unit_price_gr: 5000,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(typ.pool).toBe(3)
    expect(typ.unit_price_gr).toBe(5000)
  })

  it('Wypożyczenie wiąże Rezerwację z Typem broni i liczbą sztuk', () => {
    const wypozyczenie: TablesInsert<'weapon_rentals'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      booking_id: '00000000-0000-0000-0000-0000000000b1',
      weapon_type_id: '00000000-0000-0000-0000-0000000000c1',
      quantity: 2,
      unit_price_gr: 5000,
    }

    expect(wypozyczenie.quantity).toBe(2)
    // Cena przy pozycji, a nie odczytywana z katalogu przy pokazywaniu Kwoty:
    // inaczej podwyżka przeliczyłaby Rezerwacje złożone przed nią.
    expect(wypozyczenie.unit_price_gr).toBe(5000)
  })

  // Rodzaj amunicji nie ma puli — i to jest treść, nie brak. Gdyby kolumna
  // doszła, ten test przestałby się kompilować razem z ADR 0004. Cena za
  // sztukę pulą nie jest: mówi, ile amunicja kosztuje, a nie ile jej zostało.
  it('Rodzaj amunicji niesie nazwę i cenę za sztukę, bez puli', () => {
    const rodzaj: Tables<'ammunition_kinds'> = {
      id: '00000000-0000-0000-0000-0000000000e1',
      facility_id: '00000000-0000-0000-0000-000000000001',
      name: '9 × 19 mm Parabellum',
      unit_price_gr: 150,
      created_at: '2026-01-01T00:00:00Z',
    }

    expect(Object.keys(rodzaj)).toEqual([
      'id',
      'facility_id',
      'name',
      'unit_price_gr',
      'created_at',
    ])
  })

  it('Zapotrzebowanie wiąże Rezerwację z Rodzajem amunicji i liczbą sztuk', () => {
    const zapotrzebowanie: TablesInsert<'ammunition_demands'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      booking_id: '00000000-0000-0000-0000-0000000000b1',
      ammunition_kind_id: '00000000-0000-0000-0000-0000000000e1',
      quantity: 200,
      unit_price_gr: 150,
    }

    expect(zapotrzebowanie.quantity).toBe(200)
    expect(zapotrzebowanie.unit_price_gr).toBe(150)
  })

  // Publiczny odczyt Wypożyczeń idzie wyłącznie tędy: ile sztuk którego Typu
  // jest czyichś i kiedy — nigdy czyich.
  it('zajętość sztuk broni nie zna nikogo z nazwiska', () => {
    const zajetosc: Tables<'weapon_occupancy'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      weapon_type_id: '00000000-0000-0000-0000-0000000000c1',
      quantity: 2,
      starts_at: '2026-06-15T08:00:00Z',
      ends_at: '2026-06-15T10:00:00Z',
    }

    expect(Object.keys(zajetosc)).toEqual([
      'facility_id',
      'weapon_type_id',
      'quantity',
      'starts_at',
      'ends_at',
    ])
  })

  // Publiczny odczyt Rezerwacji idzie wyłącznie tędy: bez kontaktu, bez liczby
  // Uczestników, bez stanu. Kolumna, która by się tu pojawiła, byłaby wyciekiem.
  it('zajętość Osi nie zna nikogo z nazwiska', () => {
    const zajetosc: Tables<'lane_occupancy'> = {
      facility_id: '00000000-0000-0000-0000-000000000001',
      lane_id: '00000000-0000-0000-0000-0000000000a1',
      starts_at: '2026-06-15T08:00:00Z',
      ends_at: '2026-06-15T10:00:00Z',
      // Zajęcie miejsca w Puli instruktorów nie mówi o nikim z nazwiska,
      // a bez niego kalendarz nie policzyłby Puli.
      with_instructor: true,
    }

    expect(Object.keys(zajetosc)).toEqual([
      'facility_id',
      'lane_id',
      'starts_at',
      'ends_at',
      'with_instructor',
    ])
  })
})
