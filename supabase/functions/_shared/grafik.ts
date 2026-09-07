/**
 * Grafik jednej Osi w jednym dniu wraz z katalogami, z których się policzył —
 * wszystko, czego funkcja zapisująca Rezerwację potrzebuje, żeby orzec o jej
 * terminie i wycenić ją.
 *
 * Jedna kopia dla dwóch dróg zapisu: zgłoszenia z Widgetu (`zloz-rezerwacje`)
 * i ręcznego wpisu w Panelu (`wpisz-rezerwacje`). Obie zadają bazie dokładnie
 * to samo pytanie — „co Strzelnica wystawia na tej Osi tego dnia i co już ją
 * zajmuje" — a odpowiadają na nie inaczej: klientowi odmową, obsłudze pytaniem
 * o pewność. Dwie kopie tego odczytu rozjechałyby się przy pierwszym wejściu
 * dołożonym do dostępności, a rozjazd znaczyłby termin sprzedany dwa razy albo
 * limit przekroczony bez odnotowania. Ta sama reguła, co przy
 * `czytajRezerwacje`.
 *
 * Zajętość idzie z widoków `lane_occupancy` i `weapon_occupancy`, a nie
 * z zapytań pisanych tutaj po raz drugi: to one — a nie ten plik — wiedzą,
 * które Rezerwacje trzymają termin, i to one wystawiają obok nich Blokady.
 *
 * Samego osądu tu nie ma ani jednego zdania: dostępność liczy czysta funkcja
 * `scheduleForDay` z `packages/shared`, ta sama, którą pyta kalendarz.
 */
import type {
  AmmunitionKind,
  CalendarDay,
  DaySchedule,
  Facility,
  Intent,
  Lane,
  WeaponType,
} from '../../../packages/shared/src/index.ts'
import {
  ammunitionKindFromRow,
  blockScheduleFromRow,
  closedDateFromRow,
  occupancyFromRow,
  occupancyWindow,
  openingHoursFromRow,
  rowsOrThrow,
  scheduleForDay,
  weaponOccupancyFromRow,
  weaponTypeFromRow,
} from '../../../packages/shared/src/index.ts'
import type { Client } from './baza.ts'

export type GrafikOsi = {
  /** Bloki dnia z powodami, przez które któryś z nich nie jest wolny. */
  grafik: DaySchedule
  /**
   * Katalogi Strzelnicy, odczytane raz i oddane wołającemu. Potrzebuje ich
   * i dostępność, i wycena, i osąd o zgłoszeniu — a dwa odczyty tych samych
   * wierszy dałyby się rozejść przy pierwszej poprawce jednego z nich.
   */
  weaponTypes: WeaponType[]
  ammunitionKinds: AmmunitionKind[]
}

export type GrafikOsiInput = {
  facility: Facility
  lane: Lane
  day: CalendarDay
  /**
   * Zamierzenia pytającego. Dostępność zależy od nich tak samo, jak od
   * zajętości: Blok wolny dla Osoby rezerwującej z Pozwoleniem bywa
   * niedostępny dla tej bez niego.
   */
  intent: Intent
  /** Chwila, którą mierzy się przeszłość i minimalne wyprzedzenie. */
  now: Date
}

export async function grafikOsi(
  client: Client,
  { facility, lane, day, intent, now }: GrafikOsiInput,
): Promise<GrafikOsi> {
  // Okno liczy `packages/shared` z kształtu Bloku, a nie to zapytanie:
  // wyliczone tutaj osobno byłoby drugą kopią, która milczkiem gubiłaby
  // kolizje.
  const okno = occupancyWindow(day, facility.timeZone)

  const [schedules, openingHours, exceptions, zajetosc, katalog, wypozyczone, rodzaje] =
    await Promise.all([
      client.from('block_schedules').select('*').eq('facility_id', facility.id),
      client.from('opening_hours').select('*').eq('facility_id', facility.id),
      client.from('calendar_exceptions').select('*').eq('facility_id', facility.id),
      // Zajętość całej Strzelnicy, nie tylko wybranej Osi: kolizję rozstrzyga
      // Oś, ale Pulę instruktorów liczy się po wszystkich Osiach naraz.
      // Zapytanie zawężone do jednej zaniżałoby ją po cichu i sprzedawało
      // Instruktora, którego nie ma.
      client
        .from('lane_occupancy')
        .select('*')
        .eq('facility_id', facility.id)
        .lt('starts_at', okno.to.toISOString())
        .gt('ends_at', okno.from.toISOString()),
      client.from('weapon_types').select('*').eq('facility_id', facility.id),
      // Sztuki trzymane przez cudze Rezerwacje — z całej Strzelnicy, bo katalog
      // jest wspólny dla wszystkich Osi. To samo okno, co dla zajętości Osi.
      client
        .from('weapon_occupancy')
        .select('*')
        .eq('facility_id', facility.id)
        .lt('starts_at', okno.to.toISOString())
        .gt('ends_at', okno.from.toISOString()),
      // Katalog amunicji bez żadnej zajętości obok: Rodzaj nie ma puli
      // (ADR 0004), więc czyta się go tylko po to, żeby odsiać Rodzaj, którego
      // ta Strzelnica nie zna.
      client.from('ammunition_kinds').select('*').eq('facility_id', facility.id),
    ])

  const weaponTypes = rowsOrThrow(katalog).map(weaponTypeFromRow)
  const ammunitionKinds = rowsOrThrow(rodzaje).map(ammunitionKindFromRow)

  return {
    weaponTypes,
    ammunitionKinds,
    grafik: scheduleForDay({
      day,
      laneId: lane.id,
      timeZone: facility.timeZone,
      timeRules: facility.timeRules,
      instructorPool: facility.instructorPool,
      intent,
      schedules: rowsOrThrow(schedules).map(blockScheduleFromRow),
      openingHours: rowsOrThrow(openingHours).map(openingHoursFromRow),
      closedDates: rowsOrThrow(exceptions).map(closedDateFromRow),
      occupancies: rowsOrThrow(zajetosc).map(occupancyFromRow),
      weaponTypes,
      weaponOccupancies: rowsOrThrow(wypozyczone).map(weaponOccupancyFromRow),
      now,
    }),
  }
}
