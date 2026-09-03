import type { PanelBooking } from '@strzelnica/shared'
import {
  formatAmount,
  formatDayLabel,
  formatTimeRange,
  instructorPresence,
} from '@strzelnica/shared'
import { opisZamowionych, teksty } from './teksty.js'

/**
 * Pełne szczegóły jednej Rezerwacji — to, z czego obsługa przygotowuje
 * stanowisko. Wszystko naraz i bez rozwijania: kontakt, Uczestnicy, deklaracja
 * Pozwolenia, Wypożyczenia, Zapotrzebowanie na amunicję, Instruktor i Kwota.
 *
 * Ten sam opis, który klient dostał na piśmie, powiększony o to, czego jemu nie
 * pokazujemy: stan Rezerwacji widziany od strony Strzelnicy. Kwota jest tą
 * zapisaną w chwili złożenia, a nie policzoną teraz z cennika — klient płaci to,
 * co zobaczył.
 */

export function Szczegoly({
  wpis,
  onWroc,
}: {
  wpis: PanelBooking
  onWroc: () => void
}) {
  const { booking } = wpis

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

      <button type="button" className="przycisk" onClick={onWroc}>
        {teksty.szczegoly.wroc}
      </button>
    </section>
  )
}
