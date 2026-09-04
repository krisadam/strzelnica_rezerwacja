import type {
  BookingSummary,
  CancellationState,
  FacilityContact,
  ManagementView,
  SupabaseConfig,
} from '@strzelnica/shared'
import {
  formatDayLabel,
  formatMoment,
  formatTimeRange,
  instructorPresence,
  readManagementView,
} from '@strzelnica/shared'
import { useCallback, useEffect, useState } from 'react'
import { KwotaZapisana } from './Kwota.js'
import { opisZamowionych, teksty } from './teksty.js'
import { anulujRezerwacje, pokazRezerwacje } from './zarzadzanie.js'

/**
 * Ekran spod linku do zarządzania Rezerwacją. Widget staje tu samodzielnie —
 * bez kalendarza i bez grafiku — bo Osoba rezerwująca przychodzi wprost ze
 * skrzynki, czasem po tygodniach, i niczego z poprzedniej sesji nie ma przy
 * sobie. Wszystko, co widzi, przychodzi jednym odczytem po tokenie z adresu.
 *
 * Odrębny od ekranu potwierdzenia adresu, choć oba otwiera link z e-maila:
 * tamten działa raz i sam z siebie coś zmienia, ten wyłącznie pokazuje —
 * dopóki klient sam nie kliknie „Anuluj".
 */

/** Wszystkie szczegóły Rezerwacji — to, po co Osoba rezerwująca tu wraca. */
function Szczegoly({ booking }: { booking: BookingSummary }) {
  return (
    <dl className="wybrany">
      <dt>{teksty.formularz.termin}</dt>
      <dd>
        {formatDayLabel(booking.day)},{' '}
        {formatTimeRange(booking.startsAt, booking.endsAt, booking.timeZone)}
      </dd>
      <dt>{teksty.formularz.os}</dt>
      <dd>{booking.laneName}</dd>
      <dt>{teksty.formularz.liczbaUczestnikow}</dt>
      <dd>{teksty.podsumowanie.uczestnicy(booking.participants)}</dd>
      <dt>{teksty.pozwolenie.etykieta}</dt>
      <dd>{booking.hasPermit ? teksty.pozwolenie.mam : teksty.pozwolenie.nieMam}</dd>
      <dt>{teksty.instruktor.etykieta}</dt>
      <dd>{teksty.instruktor[instructorPresence(booking)]}</dd>
      <dt>{teksty.wypozyczenie.etykieta}</dt>
      <dd>{opisZamowionych(booking.rentals, teksty.wypozyczenie.wlasnaBron)}</dd>
      <dt>{teksty.amunicja.etykieta}</dt>
      <dd>{opisZamowionych(booking.ammunition, teksty.amunicja.wlasnaAmunicja)}</dd>
      <dt>{teksty.formularz.imie}</dt>
      <dd>{booking.contact.name}</dd>
      <dt>{teksty.formularz.email}</dt>
      <dd>{booking.contact.email}</dd>
      <dt>{teksty.formularz.telefon}</dt>
      <dd>{booking.contact.phone}</dd>
    </dl>
  )
}

/**
 * Kontakt do Strzelnicy. Stoi tam, gdzie klient nie może już sam — i mówi
 * wprost, gdy Strzelnica kontaktu nie podała: cisza w tym miejscu wyglądałaby
 * na usterkę ekranu, a nie na brak w konfiguracji.
 */
function Kontakt({ facility }: { facility: FacilityContact }) {
  const { email, phone } = facility

  return (
    <section className="kontakt">
      <h3>{teksty.zarzadzanie.kontakt.naglowek}</h3>
      {!email && !phone ? (
        <p className="komunikat">{teksty.zarzadzanie.kontakt.brak}</p>
      ) : (
        <dl className="wybrany">
          {phone && (
            <>
              <dt>{teksty.zarzadzanie.kontakt.telefon}</dt>
              <dd>
                <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
              </dd>
            </>
          )}
          {email && (
            <>
              <dt>{teksty.zarzadzanie.kontakt.email}</dt>
              <dd>
                <a href={`mailto:${email}`}>{email}</a>
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  )
}

/**
 * Anulowanie: przycisk, pytanie i odpowiedź. Pytanie jest tu treścią, nie
 * uprzejmością — zwolniony termin bierze pierwszy chętny, więc nie ma jak go
 * odkliknąć.
 */
function Anulowanie({
  cancellation,
  timeZone,
  wysylanie,
  blad,
  onAnuluj,
}: {
  cancellation: CancellationState
  /** Strefa Strzelnicy: granicę okna czyta człowiek, który liczy swoje godziny. */
  timeZone: string
  wysylanie: boolean
  blad: string | null
  onAnuluj: () => void
}) {
  const [pyta, setPyta] = useState(false)

  // Rezerwacja, której nie ma czego anulować, nie dostaje ani przycisku, ani
  // powodu: stan Rezerwacji stoi wyżej i mówi wszystko, a „nie możesz anulować
  // Rezerwacji anulowanej" byłoby zdaniem o niczym.
  if (!cancellation.possible && cancellation.reason === 'nie-do-anulowania') return null

  if (!cancellation.possible) {
    return (
      <p className="komunikat" role="status">
        {teksty.zarzadzanie.poOknie(formatMoment(cancellation.deadline, timeZone))}
      </p>
    )
  }

  return (
    <>
      <p className="komunikat">
        {teksty.zarzadzanie.doKiedy(formatMoment(cancellation.deadline, timeZone))}
      </p>
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {blad}
        </p>
      )}
      {pyta ? (
        <>
          <p>{teksty.zarzadzanie.pewnie}</p>
          <div className="przyciski">
            <button type="button" className="przycisk" onClick={() => setPyta(false)}>
              {teksty.zarzadzanie.nie}
            </button>
            <button type="button" className="przycisk" onClick={onAnuluj} disabled={wysylanie}>
              {wysylanie ? teksty.zarzadzanie.anulowanie : teksty.zarzadzanie.tak}
            </button>
          </div>
        </>
      ) : (
        <div className="przyciski">
          <button type="button" className="przycisk" onClick={() => setPyta(true)}>
            {teksty.zarzadzanie.anuluj}
          </button>
        </div>
      )}
    </>
  )
}

type Stan =
  | { faza: 'wczytywanie' }
  | { faza: 'gotowe'; widok: ManagementView; anulowano: boolean }
  | { faza: 'nieznany' }
  | { faza: 'blad' }

export function MojaRezerwacja({ config, token }: { config: SupabaseConfig; token: string }) {
  const [stan, setStan] = useState<Stan>({ faza: 'wczytywanie' })
  const [anulowanie, setAnulowanie] = useState(false)
  const [bladAnulowania, setBladAnulowania] = useState<string | null>(null)

  const wczytaj = useCallback(
    (anulowano: boolean): Promise<Stan> =>
      pokazRezerwacje(config, token).then((wynik) =>
        wynik.ok
          ? { faza: 'gotowe', widok: readManagementView(wynik.view), anulowano }
          : { faza: 'nieznany' },
      ),
    [config, token],
  )

  useEffect(() => {
    let aktualne = true
    wczytaj(false)
      .then((nowy) => {
        if (aktualne) setStan(nowy)
      })
      .catch((powod: unknown) => {
        console.error(powod)
        if (aktualne) setStan({ faza: 'blad' })
      })
    return () => {
      aktualne = false
    }
  }, [wczytaj])

  /**
   * Anulowanie i ponowny odczyt. Stanu nie przepisujemy u siebie, choć byłoby
   * to o jedno żądanie taniej: ekran po anulowaniu ma pokazywać to, co stoi
   * w bazie, a nie to, co przeglądarka policzyła sobie z odpowiedzi „udało
   * się". Odmowa przychodzi tą samą drogą — o granicy okna rozstrzyga zegar
   * bazy, a nie zegar przeglądarki, w której ekran stoi otwarty od godziny.
   *
   * I dlatego odmowa nie dostaje osobnego komunikatu: odczytany na nowo widok
   * mówi o niej dokładniej, niż powiedziałoby zdanie napisane tutaj — „Okno
   * anulowania minęło" albo wprost „Strzelnica odwołała tę Rezerwację". Zdanie
   * własne musiałoby zgadywać, co zaszło, i stanęłoby obok prawdziwego.
   *
   * Własny komunikat zostaje wyłącznie dla wyjątku: żądanie, które nie doszło,
   * nie zmienia ekranu, więc bez tego zdania kliknięcie wyglądałoby na
   * zignorowane.
   */
  const anuluj = useCallback(() => {
    setAnulowanie(true)
    setBladAnulowania(null)

    anulujRezerwacje(config, token)
      // Tylko pierwsze anulowanie cokolwiek zmieniło — i tylko o nim wolno
      // powiedzieć „anulowaliśmy". Drugie kliknięcie, choćby z drugiej karty,
      // zostawia zdanie o stanie: Rezerwacja jest anulowana i tyle.
      .then(async (wynik) => setStan(await wczytaj(wynik.ok && !wynik.alreadyCancelled)))
      .catch((powod: unknown) => {
        console.error(powod)
        setBladAnulowania(teksty.zarzadzanie.bladAnulowania)
      })
      .finally(() => setAnulowanie(false))
  }, [config, token, wczytaj])

  if (stan.faza === 'wczytywanie') {
    return <p className="komunikat">{teksty.zarzadzanie.wczytywanie}</p>
  }

  // Token, którego baza nie zna: link ucięty przez klienta poczty albo
  // podstawiony z palca. Jedna odpowiedź na oba przypadki — rozróżnienie
  // mówiłoby zgadującemu, jak blisko był.
  if (stan.faza === 'nieznany') {
    return (
      <p className="komunikat komunikat--blad" role="alert">
        {teksty.zarzadzanie.linkNieznany}
      </p>
    )
  }

  // Błąd sieci albo serwera to nie odpowiedź o Rezerwacji: nie wiemy o niej
  // nic, więc nie wolno powiedzieć ani „jest", ani „nie ma jej".
  if (stan.faza === 'blad') {
    return (
      <p className="komunikat komunikat--blad" role="alert">
        {teksty.zarzadzanie.blad}
      </p>
    )
  }

  const { widok } = stan

  return (
    <section className="krok">
      <h2>{teksty.zarzadzanie.naglowek}</h2>
      {/* Jedno zdanie o stanie, nie dwa: zaraz po kliknięciu mówi się
          o skutku („anulowaliśmy"), a przy każdym późniejszym wejściu — o tym,
          co jest („jest anulowana"). Oba naraz powtarzałyby to samo. */}
      {stan.anulowano ? (
        <p role="status">{teksty.zarzadzanie.anulowano}</p>
      ) : (
        <p>{teksty.zarzadzanie.stan[widok.status]}</p>
      )}

      {/* Powód odwołania zaraz pod stanem, bo tłumaczy właśnie jego. Ma go
          wyłącznie Rezerwacja odwołana przez Strzelnicę — pozostałe stany nie
          mają czego tłumaczyć, a klient anulujący sam wie, dlaczego. */}
      {widok.revocationReason && (
        <p>{teksty.zarzadzanie.powodOdwolania(widok.revocationReason)}</p>
      )}

      <Szczegoly booking={widok.booking} />
      <KwotaZapisana amount={widok.booking.amount} />

      <Anulowanie
        cancellation={widok.cancellation}
        timeZone={widok.booking.timeZone}
        wysylanie={anulowanie}
        blad={bladAnulowania}
        onAnuluj={anuluj}
      />

      {/* Kontakt zawsze, nie tylko po upływie okna: Osoba rezerwująca wraca tu
          także z pytaniem, na które ekran nie odpowiada. */}
      <Kontakt facility={widok.facility} />
    </section>
  )
}
