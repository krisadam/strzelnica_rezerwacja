import type { AmountBreakdown } from '@strzelnica/shared'
import { formatAmount, splitFigure } from '@strzelnica/shared'
import { teksty } from './teksty.js'

/**
 * Kwota do zapłaty wraz z rozbiciem na składniki. Liczy ją `priceBooking`
 * z `@strzelnica/shared` — ta sama czysta funkcja, którą Edge Function liczy
 * Kwotę zapisywaną przy Rezerwacji. Widget nie ma własnego rachunku: miałby
 * wtedy szansę pokazać inną Kwotę, niż Osoba rezerwująca zapłaci na miejscu.
 *
 * Rozbicie jest tu treścią, nie ozdobą. Kwota złożona z pięciu stawek bez
 * wyjaśnienia każe się jej domyślać, a najczęstsze pytanie — „dlaczego tyle" —
 * ma znaleźć odpowiedź w tym samym miejscu, w którym powstaje.
 *
 * Zapłata następuje na miejscu w Strzelnicy i mówimy o tym przy każdej Kwocie,
 * a nie raz na początku ścieżki: nikt nie ma szukać na końcu formularza pola
 * karty, którego nie ma.
 */
type Skladnik = { etykieta: string; wartosc: number }

/**
 * Kwota wybita wielkością, z walutą przy niej drobną i przygaszoną. Chwyt
 * stoi w Widgecie w tym jednym miejscu — Kwota jest tu jedyną liczbą, po którą
 * Osoba rezerwująca schodzi wzrokiem na dół formularza — i w Panelu w sumach
 * dziennego Zestawienia. Nigdzie indziej: wybite wszystko nie wybija już nic.
 *
 * Napis przychodzi gotowy z `formatAmount`, a dzieli go `splitFigure`
 * z `@strzelnica/shared` — ta sama funkcja, którą dzieli swoje sumy Panel.
 * Podział jest przepołowieniem napisu, a nie złożeniem go z kawałków, więc
 * to, co czyta czytnik ekranu, zostaje co do znaku takie jak przedtem, razem
 * z odstępem nierozdzielającym przed walutą.
 */
function DuzaLiczba({ napis }: { napis: string }) {
  const podzial = splitFigure(napis)
  // Kwota bez cyfry nie istnieje, ale nie ma powodu, żeby ten warunek kosztował
  // pusty ekran, jeśli kiedyś zaistnieje.
  if (podzial === null) return <>{napis}</>

  return (
    <>
      {podzial.before}
      <span className="duza-liczba">{podzial.figure}</span>
      {/* Jednostki nie ma przy liczbie, która kończy napis — pusty element
          wyglądałby w drzewie jak jednostka, której nie widać. */}
      {podzial.after && <span className="duza-liczba__jednostka">{podzial.after}</span>}
    </>
  )
}

function Rachunek({
  skladniki,
  total,
  uwaga,
}: {
  skladniki?: readonly Skladnik[]
  total: number
  /** Zdanie dokładane pod tym o płatności na miejscu; jedno albo żadne. */
  uwaga?: string
}) {
  return (
    // Zmiana Kwoty jest odpowiedzią na to, co Osoba rezerwująca właśnie
    // zmieniła w formularzu — więc czytający ekranem ma ją usłyszeć, a nie
    // znaleźć, cofając się kursorem.
    <section className="kwota" aria-live="polite">
      <h3>{teksty.kwota.naglowek}</h3>

      {skladniki && (
        <dl className="kwota__rozbicie">
          {skladniki.map((skladnik) => (
            <div key={skladnik.etykieta}>
              <dt>{skladnik.etykieta}</dt>
              <dd>{formatAmount(skladnik.wartosc)}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="kwota__razem">
        <span>{teksty.kwota.razem}</span>
        <strong>
          <DuzaLiczba napis={formatAmount(total)} />
        </strong>
      </p>
      <p className="kwota__uwaga">{teksty.kwota.naMiejscu}</p>
      {uwaga && <p className="kwota__uwaga">{uwaga}</p>}
    </section>
  )
}

/**
 * Kwota wyliczona z cennika dla tego, co stoi w formularzu. Aktualizuje się
 * przy każdej zmianie, bo jest wyliczana przy każdym renderze — nie ma tu
 * czego odświeżać ani zapamiętywać.
 *
 * Składniki zerowe nie mają wiersza: „Amunicja — 0,00 zł" mówi Osobie
 * rezerwującej wyłącznie to, że czegoś nie zamówiła, i wie o tym sama. Stawka
 * za Blok zostaje zawsze, także zerowa — jest jedynym składnikiem, którego nie
 * da się nie mieć, a jej brak w rozbiciu wyglądałby na pomyłkę rachunku.
 */
export function Kwota({ amount }: { amount: AmountBreakdown }) {
  const zamowione = [
    { etykieta: teksty.kwota.uczestnictwo, wartosc: amount.participation },
    { etykieta: teksty.kwota.instruktor, wartosc: amount.instructor },
    { etykieta: teksty.kwota.bron, wartosc: amount.rentals },
    { etykieta: teksty.kwota.amunicja, wartosc: amount.ammunition },
  ].filter((skladnik) => skladnik.wartosc > 0)

  const skladniki = [{ etykieta: teksty.kwota.blok, wartosc: amount.block }, ...zamowione]

  return <Rachunek skladniki={skladniki} total={amount.total} />
}

/**
 * Kwota zapisanej Rezerwacji — ta, którą odesłała Edge Function, a nie
 * policzona u klienta po raz drugi. Bez rozbicia: po złożeniu Rezerwacji nie
 * ma już czego rozważać, a jest jedna liczba, którą Osoba rezerwująca zapłaci
 * na miejscu, choćby Strzelnica zmieniła nazajutrz cennik.
 */
export function KwotaZapisana({ amount }: { amount: number }) {
  return <Rachunek total={amount} uwaga={teksty.potwierdzenie.kwotaZamrozona} />
}
