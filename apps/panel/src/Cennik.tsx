import type {
  Facility,
  FacilityConfigDraft,
  FacilityConfigProblem,
  PanelBooking,
} from '@strzelnica/shared'
import {
  facilityConfigProblems,
  instructorOverruns,
  MAX_INSTRUCTOR_POOL,
  MAX_TIME_RULE,
  parseAmount,
  writeAmount,
} from '@strzelnica/shared'
import { useCallback, useState } from 'react'
import { Kolizje } from './Kolizje.js'
import { ustawKonfiguracje } from './konfiguracja.js'
import { czytajLiczbe, PoleKwoty, PoleLiczby } from './Pola.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'

/**
 * Cennik wspólny dla całej Strzelnicy, Pula instruktorów i reguły czasowe —
 * sześć wartości, jeden przycisk i jedno żądanie. Razem, bo są kolumnami
 * jednego wiersza i jedną odpowiedzią na pytanie „jak u mnie się rezerwuje":
 * zapisane osobno dałyby chwilę, w której Strzelnica ma nową Pulę i stary
 * horyzont.
 *
 * Stawki za Blok tu nie ma i nie jest to przeoczenie: należy do Osi, bo to na
 * niej kiedyś stanie cennik zależny od pory dnia — ustawia się ją więc na
 * ekranie Osi, razem z ich nazwami i pojemnością.
 *
 * Rezerwacji złożonych wcześniej żadna z tych zmian nie rusza i nie ma czym:
 * każda niesie własną Kwotę wraz ze stawkami, z których się policzyła, własny
 * termin i własną obecność Instruktora. Te, którym po zmniejszeniu Puli
 * nadzoru już nie starcza, ekran **wskazuje** — rozstrzyga je człowiek.
 */
export function Cennik({
  client,
  facility,
  bookings,
  teraz,
  onZapisano,
  onWybierz,
}: {
  client: PanelClient
  /** Konfiguracja zapisana w bazie; poprawiana żyje w stanie tego ekranu. */
  facility: Facility
  /** Rezerwacje okna Panelu — z nich biorą się przekroczenia Puli instruktorów. */
  bookings: readonly PanelBooking[]
  /** Chwila odczytu danych; mierzy się nią, co da się jeszcze rozstrzygnąć. */
  teraz: Date
  onZapisano: () => void
  /** Przekroczenie rozstrzygnięte przez człowieka: przejście do Rezerwacji. */
  onWybierz: (booking: PanelBooking) => void
}) {
  /**
   * Pól nie odświeżamy z danych przychodzących co minutę: obsługa bywa
   * w połowie wpisywania stawki, a odczyt z bazy podmieniłby jej cyfrę
   * w trakcie. Ta sama decyzja, co w formularzu Osi i pozycji katalogu.
   */
  const [pula, setPula] = useState(String(facility.instructorPool))
  const [uczestnictwo, setUczestnictwo] = useState(writeAmount(facility.participationRate))
  const [instruktor, setInstruktor] = useState(writeAmount(facility.instructorRate))
  const [horyzont, setHoryzont] = useState(String(facility.timeRules.horizonDays))
  const [wyprzedzenie, setWyprzedzenie] = useState(String(facility.timeRules.minLeadMinutes))
  const [okno, setOkno] = useState(String(facility.timeRules.cancellationWindowHours))
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly FacilityConfigProblem[]>([])
  const [udane, setUdane] = useState(false)
  const [blad, setBlad] = useState(false)

  // Pola nie do odczytania jadą do zastrzeżeń jako nie-liczby, zamiast zamieniać
  // się po cichu w zero: zero jest na tym ekranie odpowiedzią — Strzelnicą bez
  // nadzoru, stawką w cenie, horyzontem sięgającym wyłącznie dzisiaj — więc
  // nadane za czyjeś skasowanie cyfry byłoby konfiguracją, o której nikt nie
  // zdecydował.
  const pulaLiczba = czytajLiczbe(pula)
  const draft: FacilityConfigDraft = {
    instructorPool: pulaLiczba,
    participationRate: parseAmount(uczestnictwo) ?? Number.NaN,
    instructorRate: parseAmount(instruktor) ?? Number.NaN,
    timeRules: {
      horizonDays: czytajLiczbe(horyzont),
      minLeadMinutes: czytajLiczbe(wyprzedzenie),
      cancellationWindowHours: czytajLiczbe(okno),
    },
  }

  const zapisz = useCallback(
    (zamiar: FacilityConfigDraft) => {
      // Zastrzeżenia liczone tą samą czystą funkcją, którą serwer sprawdza je
      // po raz drugi — walidacja w przeglądarce jest wygodą, a nie
      // zabezpieczeniem.
      const problemy = facilityConfigProblems(zamiar)
      if (problemy.length > 0) {
        setZastrzezenia(problemy)
        setUdane(false)
        return
      }

      setWysylanie(true)
      setBlad(false)
      setZastrzezenia([])
      setUdane(false)

      ustawKonfiguracje(client, zamiar)
        .then((wynik) => {
          setZastrzezenia(wynik.ok ? [] : [wynik.problem])
          setUdane(wynik.ok)
          // Pola nie wracają do niczego: opisują dalej tę samą Strzelnicę, więc
          // czyszczenie zostawiłoby na ekranie pustkę zamiast tego, co właśnie
          // zapisano. Inaczej niż w formularzu nowej Osi czy nowej pozycji.
          if (wynik.ok) onZapisano()
        })
        .catch((przyczyna: unknown) => {
          console.error(przyczyna)
          setBlad(true)
        })
        .finally(() => setWysylanie(false))
    },
    [client, onZapisano],
  )

  /**
   * Rezerwacje, którym po zmniejszeniu Puli Instruktorów już nie starczy —
   * liczone dla Puli **z pola**, a nie z bazy: obsługa ma je zobaczyć, zanim
   * naciśnie przycisk.
   *
   * Liczone z Rezerwacji **trzymających termin** i jeszcze nieskończonych:
   * anulowana nie zajmuje nikogo, a wczorajszego nadzoru nie da się
   * rozstrzygnąć niczym — na liście „do rozstrzygnięcia" byłby wyłącznie
   * szumem. Ta sama granica, co przy godzinach otwarcia i przy pulach sztuk.
   *
   * Pula niedokończona — ułamek w trakcie wpisywania — nie jest żadną Pulą,
   * więc lista mówi wtedy o tej zapisanej; liczba z pola i liczba w dopisku są
   * **jedną** liczbą, bo dwie rozjechałyby się dokładnie w tej chwili.
   */
  const pulaOsadu = pulaLiczba >= 0 ? pulaLiczba : facility.instructorPool
  const doRozstrzygniecia = bookings.filter(
    (wpis) => wpis.holdsTerm && wpis.booking.withInstructor && wpis.booking.endsAt > teraz,
  )
  const przekroczenia = instructorOverruns({
    pool: pulaOsadu,
    attendances: doRozstrzygniecia.map((wpis) => ({
      bookingId: wpis.id,
      startsAt: wpis.booking.startsAt,
      endsAt: wpis.booking.endsAt,
    })),
  })
  const wPrzekroczeniu = new Map(przekroczenia.map((wpis) => [wpis.bookingId, wpis.attended]))

  return (
    <section className="konfiguracja">
      <h2>{teksty.cennik.naglowek}</h2>
      <p className="komunikat">{teksty.cennik.wstep}</p>

      <h3>{teksty.cennik.stawki.naglowek}</h3>
      <p className="komunikat">{teksty.cennik.stawki.wstep}</p>
      <div className="filtry">
        <PoleKwoty
          etykieta={teksty.cennik.stawki.uczestnictwo}
          opis={teksty.cennik.stawki.uczestnictwoOpis}
          podglad={teksty.cennik.stawkaPodglad}
          wartosc={uczestnictwo}
          onZmien={setUczestnictwo}
        />
        <PoleKwoty
          etykieta={teksty.cennik.stawki.instruktor}
          opis={teksty.cennik.stawki.instruktorOpis}
          podglad={teksty.cennik.stawkaPodglad}
          wartosc={instruktor}
          onZmien={setInstruktor}
        />
      </div>

      <h3>{teksty.cennik.pula.naglowek}</h3>
      <p className="komunikat">{teksty.cennik.pula.wstep}</p>
      <div className="filtry">
        <PoleLiczby
          etykieta={teksty.cennik.pula.etykieta}
          opis={teksty.cennik.pula.opis}
          max={MAX_INSTRUCTOR_POOL}
          wartosc={pula}
          onZmien={setPula}
        />
      </div>

      <Kolizje
        naglowek={teksty.cennik.przekroczenia.naglowek}
        wstep={teksty.cennik.przekroczenia.wstep}
        bookings={doRozstrzygniecia.filter((wpis) => wPrzekroczeniu.has(wpis.id))}
        dopisek={(wpis) =>
          teksty.cennik.przekroczenia.nadzor(wPrzekroczeniu.get(wpis.id) ?? 0, pulaOsadu)
        }
        onWybierz={onWybierz}
      />

      <h3>{teksty.cennik.reguly.naglowek}</h3>
      <p className="komunikat">{teksty.cennik.reguly.wstep}</p>
      <div className="filtry">
        <PoleLiczby
          etykieta={teksty.cennik.reguly.horyzont}
          opis={teksty.cennik.reguly.horyzontOpis}
          max={MAX_TIME_RULE}
          wartosc={horyzont}
          onZmien={setHoryzont}
        />
        <PoleLiczby
          etykieta={teksty.cennik.reguly.wyprzedzenie}
          opis={teksty.cennik.reguly.wyprzedzenieOpis}
          max={MAX_TIME_RULE}
          wartosc={wyprzedzenie}
          onZmien={setWyprzedzenie}
        />
        <PoleLiczby
          etykieta={teksty.cennik.reguly.okno}
          opis={teksty.cennik.reguly.oknoOpis}
          max={MAX_TIME_RULE}
          wartosc={okno}
          onZmien={setOkno}
        />
      </div>

      {zastrzezenia.map((problem) => (
        <p key={problem} className="komunikat komunikat--blad" role="alert">
          {teksty.cennik.problem[problem]}
        </p>
      ))}
      {udane && (
        <p className="komunikat" role="status">
          {teksty.cennik.zapisano}
        </p>
      )}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.cennik.blad}
        </p>
      )}

      <div className="przyciski">
        <button
          type="button"
          className="przycisk"
          onClick={() => zapisz(draft)}
          disabled={wysylanie}
        >
          {wysylanie ? teksty.cennik.zapisywanie : teksty.cennik.zapisz}
        </button>
      </div>
    </section>
  )
}
