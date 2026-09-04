import type { PanelBooking, RevocationOutcome } from '@strzelnica/shared'
import {
  formatAmount,
  formatDayLabel,
  formatTimeRange,
  instructorPresence,
  revocable,
  revocationProblem,
} from '@strzelnica/shared'
import { useCallback, useState } from 'react'
import { odwolajRezerwacje } from './odwolanie.js'
import type { PanelClient } from './supabase.js'
import { opisZamowionych, teksty } from './teksty.js'

/**
 * Pełne szczegóły jednej Rezerwacji — to, z czego obsługa przygotowuje
 * stanowisko, i miejsce, z którego ją odwołuje. Wszystko naraz i bez
 * rozwijania: kontakt, Uczestnicy, deklaracja Pozwolenia, Wypożyczenia,
 * Zapotrzebowanie na amunicję, Instruktor i Kwota.
 *
 * Ten sam opis, który klient dostał na piśmie, powiększony o to, czego jemu nie
 * pokazujemy: stan Rezerwacji widziany od strony Strzelnicy. Kwota jest tą
 * zapisaną w chwili złożenia, a nie policzoną teraz z cennika — klient płaci to,
 * co zobaczył.
 */

/**
 * Odwołanie: powód, pytanie i odpowiedź. Powód jest tu polem wymaganym i nie
 * jest to formalność — jedzie w liście do klienta i jest całą jego treścią.
 *
 * Pytanie stoi między wpisaniem powodu a wysłaniem, bo odwołania nie da się
 * odkliknąć: list wychodzi od razu, a zwolniony termin bierze pierwszy chętny.
 *
 * O odpowiedzi funkcji ten formularz nie mówi ani słowa i nie może: po
 * odwołaniu, które weszło, Rezerwacja nie jest już do odwołania, więc ekran
 * wyżej zdejmuje formularz razem z każdym zdaniem, które by w nim stało.
 * Zostaje mu jedno zastrzeżenie — brak powodu — bo o nim orzeka sam, przed
 * wysłaniem czegokolwiek.
 */
function Odwolanie({
  client,
  bookingId,
  onWynik,
}: {
  client: PanelClient
  /** Rezerwacja, o którą tu chodzi; poza numerem formularz nie potrzebuje z niej nic. */
  bookingId: string
  /** Funkcja odpowiedziała — ekran wyżej mówi o tym zdanie i czyta dane od nowa. */
  onWynik: (wynik: RevocationOutcome) => void
}) {
  const [powod, setPowod] = useState('')
  const [pyta, setPyta] = useState(false)
  const [wysylanie, setWysylanie] = useState(false)
  const [brakPowodu, setBrakPowodu] = useState(false)
  const [blad, setBlad] = useState(false)

  /**
   * Wysłanie odwołania. Stanu Rezerwacji nie przepisujemy u siebie: ekran ma
   * pokazać to, co stoi w bazie, więc odpowiedź funkcji odświeża cały odczyt.
   * Odmowa przychodzi tą samą drogą — klient mógł anulować Rezerwację sam
   * między wczytaniem Panelu a tym kliknięciem, a Panel odświeża się raz na
   * minutę.
   */
  const odwolaj = useCallback(() => {
    setWysylanie(true)
    setBlad(false)

    odwolajRezerwacje(client, { bookingId, reason: powod })
      .then((wynik) => {
        setPyta(false)
        onWynik(wynik)
      })
      .catch((przyczyna: unknown) => {
        // Żądanie, które nie doszło, nie zmienia ekranu — bez tego zdania
        // kliknięcie wyglądałoby na zignorowane.
        console.error(przyczyna)
        setBlad(true)
      })
      .finally(() => setWysylanie(false))
  }, [bookingId, client, onWynik, powod])

  const zapytaj = useCallback(() => {
    // Powód sprawdzany tą samą czystą funkcją, którą pyta serwer, zanim
    // cokolwiek zapisze. Pytanie o pewność bez powodu byłoby pytaniem
    // o odwołanie, które i tak nie wejdzie.
    const zastrzezenie = revocationProblem(powod)
    setBrakPowodu(!!zastrzezenie)
    setPyta(!zastrzezenie)
  }, [powod])

  return (
    <section className="odwolanie">
      <h3>{teksty.odwolanie.naglowek}</h3>
      <p className="komunikat">{teksty.odwolanie.wstep}</p>

      <label className="pole">
        <span>{teksty.odwolanie.powod}</span>
        <textarea
          rows={3}
          value={powod}
          placeholder={teksty.odwolanie.podpowiedz}
          onChange={(zdarzenie) => setPowod(zdarzenie.target.value)}
        />
      </label>

      {brakPowodu && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.odwolanie.problem['brak-powodu']}
        </p>
      )}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.odwolanie.blad}
        </p>
      )}

      {pyta ? (
        <>
          <p>{teksty.odwolanie.pewnie}</p>
          <div className="przyciski">
            <button type="button" className="przycisk" onClick={() => setPyta(false)}>
              {teksty.odwolanie.nie}
            </button>
            <button
              type="button"
              className="przycisk"
              onClick={odwolaj}
              disabled={wysylanie}
            >
              {wysylanie ? teksty.odwolanie.odwolywanie : teksty.odwolanie.tak}
            </button>
          </div>
        </>
      ) : (
        <div className="przyciski">
          <button type="button" className="przycisk" onClick={zapytaj}>
            {teksty.odwolanie.odwolaj}
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * Co funkcja odpowiedziała na odwołanie — zdaniem dla obsługi. Stoi tutaj,
 * a nie w formularzu, bo formularz znika razem ze stanem Rezerwacji: odwołanej
 * nie ma już czego odwoływać, więc zdanie napisane w nim zniknęłoby razem
 * z nim, w tej samej chwili, w której jest potrzebne.
 */
function Odpowiedz({ wynik }: { wynik: RevocationOutcome }) {
  if (!wynik.ok) {
    return (
      <p className="komunikat komunikat--blad" role="alert">
        {teksty.odwolanie.problem[wynik.problem]}
      </p>
    )
  }

  return (
    <p className="komunikat" role="status">
      {wynik.alreadyRevoked ? teksty.odwolanie.juzOdwolana : teksty.odwolanie.odwolano}
    </p>
  )
}

export function Szczegoly({
  client,
  wpis,
  onWroc,
  onOdswiez,
}: {
  client: PanelClient
  wpis: PanelBooking
  onWroc: () => void
  /** Odwołanie zmieniło Rezerwację — ekran ma wziąć dane z bazy na nowo. */
  onOdswiez: () => void
}) {
  const { booking } = wpis
  const [odpowiedz, setOdpowiedz] = useState<RevocationOutcome | null>(null)

  const wynikOdwolania = useCallback(
    (wynik: RevocationOutcome) => {
      setOdpowiedz(wynik)
      onOdswiez()
    },
    [onOdswiez],
  )

  return (
    <section className="szczegoly">
      <h2>{teksty.szczegoly.naglowek}</h2>

      <dl className="opis">
        <dt>{teksty.szczegoly.termin}</dt>
        <dd>
          {formatDayLabel(booking.day)},{' '}
          {formatTimeRange(booking.startsAt, booking.endsAt, booking.timeZone)}
        </dd>

        <dt>{teksty.szczegoly.os}</dt>
        <dd>{booking.laneName}</dd>

        <dt>{teksty.szczegoly.stan}</dt>
        <dd>{teksty.stan[wpis.status]}</dd>

        {/* Powód zaraz pod stanem, bo tłumaczy właśnie jego. Rezerwacja
            nieodwołana nie ma tu wiersza — pusty wyglądałby na brakującą
            daną, a nie na Rezerwację, która się odbędzie. */}
        {wpis.revocationReason && (
          <>
            <dt>{teksty.szczegoly.powodOdwolania}</dt>
            <dd>{wpis.revocationReason}</dd>
          </>
        )}

        <dt>{teksty.szczegoly.uczestnicy}</dt>
        <dd>{teksty.uczestnicy(booking.participants)}</dd>

        <dt>{teksty.szczegoly.pozwolenie}</dt>
        <dd>
          {booking.hasPermit
            ? teksty.szczegoly.maPozwolenie
            : teksty.szczegoly.brakPozwolenia}
        </dd>

        <dt>{teksty.szczegoly.instruktor}</dt>
        <dd>{teksty.instruktorStan[instructorPresence(booking)]}</dd>

        <dt>{teksty.szczegoly.wypozyczenie}</dt>
        <dd>{opisZamowionych(booking.rentals, teksty.szczegoly.wlasnaBron)}</dd>

        <dt>{teksty.szczegoly.amunicja}</dt>
        <dd>{opisZamowionych(booking.ammunition, teksty.szczegoly.wlasnaAmunicja)}</dd>

        <dt>{teksty.szczegoly.imie}</dt>
        <dd>{booking.contact.name}</dd>

        <dt>{teksty.szczegoly.email}</dt>
        <dd>
          <a href={`mailto:${booking.contact.email}`}>{booking.contact.email}</a>
        </dd>

        <dt>{teksty.szczegoly.telefon}</dt>
        <dd>
          <a href={`tel:${booking.contact.phone.replace(/\s/g, '')}`}>
            {booking.contact.phone}
          </a>
        </dd>

        <dt>{teksty.szczegoly.kwota}</dt>
        <dd>{formatAmount(booking.amount)}</dd>
      </dl>

      <p className="komunikat">{teksty.szczegoly.kwotaUwaga}</p>

      {odpowiedz && <Odpowiedz wynik={odpowiedz} />}

      {/* Rezerwacja, której nie ma czego odwoływać, nie dostaje ani formularza,
          ani powodu odmowy: stan stoi wyżej i mówi wszystko, a „nie możesz
          odwołać odwołanej" byłoby zdaniem o niczym. Granicę zna
          `revocable` — ta sama, którą stawia warunek `revoke_booking`. */}
      {revocable(wpis.status) && (
        <Odwolanie client={client} bookingId={wpis.id} onWynik={wynikOdwolania} />
      )}

      <button type="button" className="przycisk" onClick={onWroc}>
        {teksty.szczegoly.wroc}
      </button>
    </section>
  )
}
