/**
 * Wyznaczanie Bloków wybranej Osi w wybranym dniu. Czysta funkcja: rozkład,
 * godziny otwarcia, wyjątki i „teraz" są parametrami. Ta sama kopia obsługuje
 * Widget, Panel i Edge Function — kalendarz nie może pokazywać czegoś innego,
 * niż przyjmuje serwer.
 *
 * Niedostępność wynika z rozkładu, godzin otwarcia, wyjątków, reguł czasowych
 * Strzelnicy — horyzontu i minimalnego wyprzedzenia — z zajętości Osi, z Puli
 * instruktorów oraz z pul sztuk Typów broni. Kolejne powody dochodzą jako
 * kolejne wartości `Unavailability`.
 *
 * Termin jest dostępny dla konkretnego kształtu Rezerwacji, nie bezwzględnie:
 * ten sam Blok bywa wolny dla Osoby rezerwującej z Pozwoleniem na broń
 * i niedostępny dla tej bez niego. Dlatego wejściem są także jej zamierzenia.
 */
import type { CalendarDay, Weekday } from './calendar.ts'
import { addDays, dayIn, weekdayOf, zonedMinuteToInstant } from './calendar.ts'

/** Pozycja rozkładu: jeden Blok Osi w jednym dniu tygodnia. */
export type BlockSchedule = {
  id: string
  laneId: string
  weekday: Weekday
  /** Początek w minutach od północy dnia Strzelnicy, na siatce Slotów. */
  startMinute: number
  /** Długość Bloku; wielokrotność Slotu. */
  durationMinutes: number
}

/** Godziny otwarcia Strzelnicy w jednym dniu tygodnia. */
export type OpeningHours = {
  weekday: Weekday
  opensMinute: number
  /** Domknięcie po północy zapisuje się wartością powyżej 1440. */
  closesMinute: number
}

/**
 * Reguły czasowe Strzelnicy — jak daleko w przód wolno rezerwować, jak blisko
 * terminu jeszcze wolno i do kiedy wolno anulować. Strzelnica ustala je sama
 * (spec, historia 55), więc są jej konfiguracją, nie stałą w kodzie.
 */
export type TimeRules = {
  /** Ile dni w przód sięga rezerwacja, licząc od dzisiejszego dnia Strzelnicy. */
  horizonDays: number
  /** Ile minut przed początkiem Bloku zamyka się rezerwacja. */
  minLeadMinutes: number
  /**
   * Do ilu godzin przed terminem Osoba rezerwująca może anulować sama.
   * Dostępności nie dotyczy — czyta go anulowanie Rezerwacji.
   */
  cancellationWindowHours: number
}

/**
 * Zajęcie Osi na wyłączność w konkretnym czasie. Rezerwacja i Blokada
 * (ticket #16) różnią się wszystkim poza tym jednym — dla dostępności są tym
 * samym, więc dostają jeden kształt i jedną regułę kolizji.
 */
export type Occupancy = {
  laneId: string
  startsAt: Date
  endsAt: Date
  /**
   * Czy zajmuje miejsce w Puli instruktorów. Blokada (ticket #16) nie zajmuje
   * go nigdy — nie ma przy niej nikogo do nadzorowania.
   */
  withInstructor: boolean
}

/** Pozycja katalogu Strzelnicy wraz z pulą sztuk do wypożyczenia. */
export type WeaponType = {
  id: string
  name: string
  /** Ile sztuk tego Typu Strzelnica ma w ogóle do wydania. */
  pool: number
  /**
   * Cena wypożyczenia jednej sztuki w groszach. Dostępności nie dotyczy —
   * czyta ją wyliczanie Kwoty do zapłaty. Mieszka tutaj, bo katalog jest
   * jeden: Typ z ceną trzymaną osobno dałby się wystawić bez niej.
   */
  unitPrice: number
}

/** Zamówienie sztuk jednego Typu: pozycja Rezerwacji, a zarazem zamierzenie. */
export type WeaponRental = {
  weaponTypeId: string
  quantity: number
}

/**
 * Sztuki jednego Typu trzymane przez cudzą Rezerwację w konkretnym czasie.
 * Siostrzana wobec `Occupancy`, ale rozstrzyga się inaczej: Oś jest czyjaś
 * albo niczyja, a katalog dzieli się po sztukach.
 */
export type WeaponOccupancy = WeaponRental & {
  startsAt: Date
  endsAt: Date
}

/**
 * Zamierzenia Osoby rezerwującej, od których zależy dostępność terminu:
 * Instruktor i zamawiane Typy broni. Oba pytają o to samo — czy Strzelnica ma
 * czym obsłużyć właśnie tę Rezerwację — więc oba mieszkają tutaj, a nie wśród
 * zwykłych pól formularza.
 */
export type Intent = {
  /** Deklaracja Pozwolenia na broń; jej brak wymusza obecność Instruktora. */
  hasPermit: boolean
  /** Instruktor zamówiony dobrowolnie mimo Pozwolenia. */
  wantsInstructor: boolean
  /**
   * Zamawiane Wypożyczenia. Pusta lista znaczy Osobę rezerwującą z własną
   * bronią — i wtedy pule sztuk nie odbierają jej żadnego terminu.
   */
  rentals: readonly WeaponRental[]
}

/**
 * Czy przy Rezerwacji o takich zamierzeniach będzie Instruktor. Powód —
 * wymagany czy zamówiony — nie zmienia niczego ani dla Puli, ani dla Kwoty
 * do zapłaty (ticket #9), więc jedna funkcja odpowiada obu.
 */
export function instructorAttends(intent: Intent): boolean {
  return !intent.hasPermit || intent.wantsInstructor
}

/** Wejście `instructorPresence`: to, co Rezerwacja o Instruktorze zapisała. */
export type InstructorPresenceInput = {
  hasPermit: boolean
  withInstructor: boolean
}

/**
 * Skąd wziął się Instruktor przy **zapisanej** Rezerwacji — albo dlaczego go
 * nie ma. Ta sama reguła domeny, co w `instructorAttends`, widziana z drugiej
 * strony: tamta pyta zamierzenia, zanim Rezerwacja powstanie, ta czyta fakt.
 * Stoją obok siebie, bo rozjazd między nimi znaczyłby Rezerwację zapisaną jako
 * „bez Instruktora" i opisaną jako „z Instruktorem".
 *
 * Odpowiedź jest znacznikiem, a nie zdaniem: to samo rozróżnienie opisują
 * trzema różnymi zdaniami list do klienta, ekran jego Rezerwacji i Panel —
 * a wspólna jest reguła, nie słowa.
 */
export function instructorPresence({
  hasPermit,
  withInstructor,
}: InstructorPresenceInput): InstructorPresence {
  if (!withInstructor) return 'brak'
  return hasPermit ? 'zamowiony' : 'wymagany'
}

/** Obecność Instruktora przy Rezerwacji wraz z jej powodem. */
export type InstructorPresence = 'wymagany' | 'zamowiony' | 'brak'

/** Powód, dla którego Bloku nie da się zarezerwować. */
export type Unavailability =
  | 'poza-godzinami-otwarcia'
  | 'poza-horyzontem'
  | 'przeszlosc'
  | 'ponizej-wyprzedzenia'
  | 'termin-zajety'
  | 'brak-instruktora'
  | 'brak-sztuk-broni'

export type Block = {
  scheduleId: string
  laneId: string
  startMinute: number
  startsAt: Date
  endsAt: Date
  available: boolean
  unavailableBecause?: Unavailability
}

export type BookingHorizonInput = {
  /** Strefa Strzelnicy; pole jej konfiguracji, nie stała w kodzie. */
  timeZone: string
  timeRules: TimeRules
  now: Date
}

/**
 * Ostatni dzień, na który Strzelnica przyjmuje Rezerwacje; sam jeszcze mieści
 * się w horyzoncie. Ta sama granica rozstrzyga o powodzie „poza-horyzontem"
 * w `scheduleForDay`, żeby nawigacja kalendarza i dostępność nie mogły się
 * rozjechać.
 */
export function bookingHorizon(input: BookingHorizonInput): CalendarDay {
  return addDays(dayIn(input.timeZone, input.now), input.timeRules.horizonDays)
}

/**
 * Najwcześniejszy i najpóźniejszy moment, w jaki może sięgnąć Blok wskazanego
 * dnia. Blok zaczyna się w obrębie doby i wolno mu trwać dalej, więc okno
 * kończy się dobę po jej końcu. Zajętość spoza tego okna nie ma z czym
 * kolidować — i tylko dlatego wolno jej nie pobierać.
 *
 * Reguła mieszka tutaj, a nie w zapytaniu Edge Function, bo wynika z tego
 * samego kształtu Bloku, co `scheduleForDay`. Wyliczona osobno w zapytaniu
 * byłaby drugą kopią, która milczkiem gubiłaby kolizje.
 */
export function occupancyWindow(day: CalendarDay, timeZone: string): { from: Date; to: Date } {
  return {
    from: zonedMinuteToInstant(day, 0, timeZone),
    to: zonedMinuteToInstant(day, 2 * 1440, timeZone),
  }
}

/** Ile sztuk jednego Typu zostaje do wzięcia w konkretnym terminie. */
export type WeaponAvailability = {
  type: WeaponType
  /** Nigdy poniżej zera — patrz `remainingWeapons`. */
  remaining: number
}

export type RemainingWeaponsInput = {
  weaponTypes: readonly WeaponType[]
  weaponOccupancies: readonly WeaponOccupancy[]
  startsAt: Date
  endsAt: Date
}

/**
 * Pozostałe sztuki każdego Typu w podanym terminie, w kolejności katalogu.
 * Widget pyta o to wprost, żeby ograniczyć wybór do liczby faktycznie
 * dostępnej, a `scheduleForDay` — żeby orzec o Bloku. Jedna funkcja odpowiada
 * obu, bo inaczej lista w formularzu i powód przy Bloku mogłyby się rozjechać.
 *
 * Wynik nie schodzi poniżej zera. Rezerwacja wpisana ręcznie w Panelu wolno
 * naruszyć limity Strzelnicy (ticket #17), więc suma wydanych sztuk bywa
 * większa od Puli — dostępność ma to znieść, a nie „naprawiać".
 *
 * Sztuki sumują się po wszystkich Rezerwacjach nachodzących na pytany termin,
 * także wtedy, gdy nie nachodzą na siebie nawzajem: Rezerwacje 8–10 i 10–12
 * obie liczą się do terminu 9–11. To zachowawcze — broń trzyma się przez cały
 * Blok, więc pozycja policzona z chwilowego szczytu obiecywałaby wydanie tej
 * samej sztuki dwóm grupom w środku Bloku. Odmowa bywa przez to o jedną sztukę
 * za wczesna przy Osiach o różnym rozkładzie; to właściwa strona pomyłki.
 */
export function remainingWeapons(input: RemainingWeaponsInput): WeaponAvailability[] {
  const wydane = new Map<string, number>()
  for (const zajete of input.weaponOccupancies) {
    if (!overlaps(zajete, input.startsAt, input.endsAt)) continue
    wydane.set(zajete.weaponTypeId, (wydane.get(zajete.weaponTypeId) ?? 0) + zajete.quantity)
  }

  return input.weaponTypes.map((type) => ({
    type,
    remaining: Math.max(0, type.pool - (wydane.get(type.id) ?? 0)),
  }))
}

/** Rozszerza wejście horyzontu, więc `bookingHorizon` przyjmuje je wprost. */
export type DayAvailabilityInput = BookingHorizonInput & {
  day: CalendarDay
  laneId: string
  schedules: readonly BlockSchedule[]
  openingHours: readonly OpeningHours[]
  /** Daty objęte wyjątkiem kalendarzowym — Strzelnica jest wtedy zamknięta. */
  closedDates: readonly CalendarDay[]
  /**
   * Rezerwacje i Blokady trzymające Osie. Cudze Osie są tu potrzebne, a nie
   * tylko dopuszczalne: Pula instruktorów liczy się po całej Strzelnicy, więc
   * lista zawężona do jednej Osi zaniżałaby ją po cichu.
   */
  occupancies: readonly Occupancy[]
  /** Ilu Instruktorów Strzelnica zapewnia w tym samym czasie. */
  instructorPool: number
  /** Katalog Typów broni Strzelnicy wraz z pulami sztuk. */
  weaponTypes: readonly WeaponType[]
  /**
   * Sztuki trzymane przez cudze Rezerwacje. Tak jak przy Puli instruktorów,
   * potrzebne są tu Wypożyczenia z całej Strzelnicy — katalog jest wspólny dla
   * wszystkich Osi, więc lista zawężona do jednej zawyżałaby to, co zostało.
   */
  weaponOccupancies: readonly WeaponOccupancy[]
  intent: Intent
}

/** Wszystko, czego trzeba, żeby orzec o jednym Bloku wybranego dnia. */
type BlockContext = {
  hours: OpeningHours
  /** Wyznaczony raz dla całego dnia — horyzont nie zależy od Bloku. */
  beyondHorizon: boolean
  minLeadMinutes: number
  now: Date
  /** Zawężone do Osi, o którą pytamy — kolizja i tak sprawdza tylko ją. */
  occupancies: readonly Occupancy[]
  /** Czy pytający potrzebuje Instruktora; jeśli nie, Pula go nie dotyczy. */
  needsInstructor: boolean
  instructorPool: number
  /** Wszystkie Rezerwacje Strzelnicy trzymające Instruktora, z każdej Osi. */
  instructorOccupancies: readonly Occupancy[]
  /** Zamawiane Wypożyczenia; pusta lista zwalnia z liczenia pul sztuk. */
  rentals: readonly WeaponRental[]
  weaponTypes: readonly WeaponType[]
  weaponOccupancies: readonly WeaponOccupancy[]
}

/**
 * Przedziały są domknięte od początku i otwarte od końca: Rezerwacja kończąca
 * się o 12:00 nie zajmuje Bloku zaczynającego się o 12:00. Inaczej rozkład ze
 * stykającymi się Blokami sprzedawałby co drugi.
 *
 * Jedna reguła dla zajętości Osi i dla sztuk broni: obie mówią o tym samym
 * zachodzeniu w czasie, a druga jej kopia rozjechałaby się na granicy — dokładnie
 * tam, gdzie boli.
 */
function overlaps(zakres: { startsAt: Date; endsAt: Date }, startsAt: Date, endsAt: Date): boolean {
  return zakres.startsAt < endsAt && zakres.endsAt > startsAt
}

function reasonFor(
  schedule: BlockSchedule,
  startsAt: Date,
  endsAt: Date,
  context: BlockContext,
): Unavailability | undefined {
  const endMinute = schedule.startMinute + schedule.durationMinutes
  // Najpierw powód trwały: Blok poza godzinami otwarcia nie stanie się dostępny
  // z upływem czasu, więc mówi o sobie prawdziwiej niż horyzont czy wyprzedzenie.
  if (schedule.startMinute < context.hours.opensMinute || endMinute > context.hours.closesMinute) {
    return 'poza-godzinami-otwarcia'
  }
  if (context.beyondHorizon) return 'poza-horyzontem'
  // Blok, który się zaczął, przestaje być do wzięcia — także w trakcie trwania.
  const leadMinutes = (startsAt.getTime() - context.now.getTime()) / 60_000
  if (leadMinutes <= 0) return 'przeszlosc'
  if (leadMinutes < context.minLeadMinutes) return 'ponizej-wyprzedzenia'
  // Powód ostatni, bo jedyny mówiący o kimś innym niż sam Blok. Blok, którego
  // Strzelnica i tak nie sprzedaje, ma o tym powiedzieć wprost — a nie zwalać
  // na Osobę rezerwującą, która akurat wpisała go ręcznie w Panelu.
  if (context.occupancies.some((occupancy) => overlaps(occupancy, startsAt, endsAt))) {
    return 'termin-zajety'
  }
  // Powód wychodzący poza sam termin: mówi nie o Bloku, tylko o tym, kto pyta.
  // Stoi po zajętej Osi, bo Osoby rezerwującej nie ma po co zachęcać do zmiany
  // deklaracji, skoro Blok i tak jest czyjś.
  if (context.needsInstructor) {
    const zajete = context.instructorOccupancies.filter((occupancy) =>
      overlaps(occupancy, startsAt, endsAt),
    ).length
    if (zajete >= context.instructorPool) return 'brak-instruktora'
  }
  // Powód ostatni z zależnych od pytającego, bo najłatwiejszy do obejścia:
  // Osoba rezerwująca zdejmuje go, zamawiając mniej sztuk, a Instruktora bez
  // Pozwolenia zdjąć nie może wcale.
  if (context.rentals.length > 0) {
    const pozostale = remainingWeapons({
      weaponTypes: context.weaponTypes,
      weaponOccupancies: context.weaponOccupancies,
      startsAt,
      endsAt,
    })
    // Typ spoza katalogu nie ma ani jednej sztuki do wydania: odmowa jest ta
    // sama, co przy Puli wyczerpanej, bo obie znaczą „nie ma czym".
    const brakuje = context.rentals.some(
      (zamowione) =>
        zamowione.quantity >
        (pozostale.find((pozycja) => pozycja.type.id === zamowione.weaponTypeId)?.remaining ?? 0),
    )
    if (brakuje) return 'brak-sztuk-broni'
  }
  return undefined
}

/**
 * Grafik Osi w jednym dniu. Dzień zamknięty — wyjątkiem kalendarzowym albo
 * brakiem godzin otwarcia — nie ma żadnych Bloków i mówi o tym wprost, żeby
 * nikt nie musiał tego wnioskować z pustej listy po raz drugi.
 */
export type DaySchedule =
  | { open: false; blocks: readonly [] }
  | { open: true; blocks: Block[] }

const ZAMKNIETE: DaySchedule = { open: false, blocks: [] }

/**
 * Bloki wskazanej Osi w wskazanym dniu, w kolejności rozpoczęcia. Blok nie
 * mieszczący się w godzinach otwarcia jest widoczny, ale niedostępny — inaczej
 * niż cały dzień zamknięty, którego w ogóle nie ma na grafiku.
 */
export function scheduleForDay(input: DayAvailabilityInput): DaySchedule {
  if (input.closedDates.includes(input.day)) return ZAMKNIETE

  const weekday = weekdayOf(input.day)
  const hours = input.openingHours.find((entry) => entry.weekday === weekday)
  if (!hours) return ZAMKNIETE

  const context: BlockContext = {
    hours,
    // Zapis dnia jest sortowalny, więc porównanie tekstów porównuje daty.
    beyondHorizon: input.day > bookingHorizon(input),
    minLeadMinutes: input.timeRules.minLeadMinutes,
    now: input.now,
    occupancies: input.occupancies.filter((occupancy) => occupancy.laneId === input.laneId),
    needsInstructor: instructorAttends(input.intent),
    instructorPool: input.instructorPool,
    instructorOccupancies: input.occupancies.filter((occupancy) => occupancy.withInstructor),
    rentals: input.intent.rentals,
    weaponTypes: input.weaponTypes,
    weaponOccupancies: input.weaponOccupancies,
  }

  const blocks = input.schedules
    .filter((schedule) => schedule.laneId === input.laneId && schedule.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((schedule) => {
      const startsAt = zonedMinuteToInstant(input.day, schedule.startMinute, input.timeZone)
      const endsAt = zonedMinuteToInstant(
        input.day,
        schedule.startMinute + schedule.durationMinutes,
        input.timeZone,
      )
      const unavailableBecause = reasonFor(schedule, startsAt, endsAt, context)

      return {
        scheduleId: schedule.id,
        laneId: schedule.laneId,
        startMinute: schedule.startMinute,
        startsAt,
        endsAt,
        available: unavailableBecause === undefined,
        ...(unavailableBecause ? { unavailableBecause } : {}),
      }
    })

  return { open: true, blocks }
}
