import type { CalendarDay, PanelBooking, TallyItem } from '@strzelnica/shared'
import { dayTally, formatDayLabel, formatTimeRange } from '@strzelnica/shared'
import type { ReactNode } from 'react'
import { opisPozycji, teksty } from './teksty.js'

/** Identyfikatory nagłówków grup; wiążą listę z nazwą tego, co w niej stoi. */
const GRUPA_BRON = 'zestawienie-bron'
const GRUPA_AMUNICJA = 'zestawienie-amunicja'
const GRUPA_INSTRUKTOR = 'zestawienie-instruktor'

/**
 * Rezerwacja pod pozycją Zestawienia — przycisk prowadzący do jej szczegółów.
 * Niesie godzinę, Oś i nazwisko, bo to są trzy pytania, które przy pozycji
 * padają zaraz po „ile": kiedy wyłożyć, gdzie i komu.
 *
 * Strefę bierze z samej Rezerwacji: `BookingSummary` niesie zegar Strzelnicy,
 * więc nie ma jej po co podawać z zewnątrz — inaczej niż w kalendarzu, gdzie
 * obok Rezerwacji stoi Blokada, a ta zegara ze sobą nie nosi.
 */
function Zrodlo({
  booking,
  sztuki,
  onWybierz,
}: {
  booking: PanelBooking
  /** Ile sztuk bierze ta Rezerwacja; przy Instruktorze nie ma czego liczyć. */
  sztuki?: number
  onWybierz: (booking: PanelBooking) => void
}) {
  const { startsAt, endsAt, timeZone, laneName, contact } = booking.booking

  return (
    <li>
      <button type="button" className="tabela__link" onClick={() => onWybierz(booking)}>
        {formatTimeRange(startsAt, endsAt, timeZone)} · {laneName} · {contact.name}
        {sztuki !== undefined && ` — ${teksty.sztuki(sztuki)}`}
      </button>
    </li>
  )
}

/**
 * Ramka jednej grupy Zestawienia: nazwa i to, co pod nią stoi. Treść przychodzi
 * z zewnątrz, bo grupy odpowiadają na pytania mierzone różnie — sprzęt
 * w sztukach, Instruktor w Rezerwacjach — a wspólne mają dokładnie tyle:
 * nagłówek, który je nazywa, i obwódkę, która je od siebie oddziela.
 */
function Grupa({
  id,
  naglowek,
  children,
}: {
  id: string
  naglowek: string
  children: ReactNode
}) {
  return (
    <section className="zestawienie__grupa" aria-labelledby={id}>
      <h3 id={id}>{naglowek}</h3>
      {children}
    </section>
  )
}

/**
 * Suma po pozycjach katalogu, a pod każdą — Rezerwacje, z których wyszła.
 * Wypożyczenia i Zapotrzebowanie rysują się tym samym, bo różnią się wyłącznie
 * nagłówkiem grupy, tak samo jak w opisie Rezerwacji na piśmie.
 */
function Pozycje({
  pozycje,
  brak,
  onWybierz,
}: {
  pozycje: readonly TallyItem[]
  brak: string
  onWybierz: (booking: PanelBooking) => void
}) {
  if (pozycje.length === 0) return <p className="komunikat">{brak}</p>

  return (
    <ul className="zestawienie__pozycje">
      {pozycje.map((pozycja) => (
        <li key={pozycja.name}>
          <span className="zestawienie__ile">{opisPozycji(pozycja)}</span>
          <ul className="zestawienie__zrodla">
            {pozycja.shares.map((udzial) => (
              <Zrodlo
                key={udzial.booking.id}
                booking={udzial.booking}
                sztuki={udzial.quantity}
                onWybierz={onWybierz}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/**
 * Zestawienie dnia: jedna lista tego, co obsługa ma przygotować, zanim
 * ktokolwiek przyjedzie. Czyta ten sam dzień, co kalendarz nad nim, i nie ma
 * własnego pola daty: dwa pola daty na jednym ekranie każą czytającemu zgadywać,
 * którym z nich przesuwa się to, na co właśnie patrzy — a to jest jeden dzień
 * oglądany dwa razy, raz po Osiach i raz po sprzęcie.
 *
 * Sumowanie razem z regułą, co się w ogóle liczy, robi `dayTally`
 * z `@strzelnica/shared`. Tutaj zostaje rysowanie.
 */
export function Zestawienie({
  day,
  bookings,
  onWybierz,
}: {
  day: CalendarDay
  bookings: readonly PanelBooking[]
  onWybierz: (booking: PanelBooking) => void
}) {
  const { weapons, ammunition, instructorBookings } = dayTally({ bookings, day })
  // Trzy puste grupy zamienione w jedno zdanie: „nikt nie wypożycza, nikt nie
  // zamawia, nikogo nie trzeba" mówi trzy razy to samo, co „nie ma czego
  // przygotować" — a odpowiedzią jest tu zdanie, nie trzy puste ramki.
  const pusto =
    weapons.length === 0 && ammunition.length === 0 && instructorBookings.length === 0

  return (
    <section className="zestawienie">
      <h2>{teksty.zestawienie.naglowek}</h2>
      {/* Dzień wypisany także tutaj, choć bierze się z kalendarza: lista sprzętu
          bez daty nad sobą jest listą, którą da się skompletować na zły dzień. */}
      <p className="zestawienie__dzien">{formatDayLabel(day)}</p>
      <p className="zestawienie__wstep">{teksty.zestawienie.wstep}</p>

      {pusto ? (
        <p className="komunikat">{teksty.zestawienie.pusto}</p>
      ) : (
        <div className="zestawienie__grupy">
          <Grupa id={GRUPA_BRON} naglowek={teksty.zestawienie.bron}>
            <Pozycje
              pozycje={weapons}
              brak={teksty.zestawienie.brakBroni}
              onWybierz={onWybierz}
            />
          </Grupa>

          <Grupa id={GRUPA_AMUNICJA} naglowek={teksty.zestawienie.amunicja}>
            <Pozycje
              pozycje={ammunition}
              brak={teksty.zestawienie.brakAmunicji}
              onWybierz={onWybierz}
            />
          </Grupa>

          {/* Instruktor liczy się w Rezerwacjach, a nie w sztukach, więc jego
              grupa ma inną treść niż tamte dwie: „Instruktor — 2 szt." mówiłoby
              o sprzęcie, a chodzi o ludzi na zmianie. */}
          <Grupa id={GRUPA_INSTRUKTOR} naglowek={teksty.zestawienie.instruktor}>
            {instructorBookings.length === 0 ? (
              <p className="komunikat">{teksty.zestawienie.brakInstruktora}</p>
            ) : (
              <>
                <p className="zestawienie__ile">
                  {teksty.zestawienie.ilu(instructorBookings.length)}
                </p>
                <ul className="zestawienie__zrodla">
                  {instructorBookings.map((booking) => (
                    <Zrodlo key={booking.id} booking={booking} onWybierz={onWybierz} />
                  ))}
                </ul>
              </>
            )}
          </Grupa>
        </div>
      )}
    </section>
  )
}
