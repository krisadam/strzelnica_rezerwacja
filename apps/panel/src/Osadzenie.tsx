import type { EmbeddingDraft, EmbeddingProblem, FacilityEmbedding } from '@strzelnica/shared'
import {
  embeddingProblems,
  embedSnippet,
  InvalidOriginError,
  MAX_TERMS_LENGTH,
  normalizeOrigin,
} from '@strzelnica/shared'
import { useCallback, useState } from 'react'
import { ustawOsadzenie } from './konfiguracja.js'
import type { PanelClient } from './supabase.js'
import { teksty } from './teksty.js'

/**
 * Znacznik do skopiowania. Niczego nie zapisuje: jest **odczytem**
 * konfiguracji platformy i identyfikatora Strzelnicy, a nie polem, które da się
 * zmienić. Stoi jednak na tym ekranie, a nie gdzie indziej, bo bez dozwolonej
 * domeny niżej nie pokaże u nikogo nic — a obsługa robi obie te rzeczy za
 * jednym posiedzeniem.
 */
function Znacznik({ widgetOrigin, slug }: { widgetOrigin: string; slug: string }) {
  const [skopiowane, setSkopiowane] = useState(false)

  // Znacznika nie da się złożyć bez adresu, spod którego podajemy Widget — a
  // ten jest naszą konfiguracją, nie jej. Pole z połową adresu byłoby gorsze
  // niż jego brak: wklejone u gospodarza nie wczytałoby niczego i nie
  // powiedziałoby dlaczego.
  let znacznik: string
  try {
    znacznik = embedSnippet({ widgetOrigin, facilitySlug: slug })
  } catch (powod) {
    console.error(powod)
    return (
      <p className="komunikat komunikat--blad" role="alert">
        {teksty.osadzenie.znacznik.brakZnacznika}
      </p>
    )
  }

  const kopiuj = () => {
    // Bez schowka zostaje zaznaczenie ręką — i tak ma być: pole jest widoczne
    // i czytelne, a przycisk jest wygodą, a nie jedyną drogą.
    navigator.clipboard
      ?.writeText(znacznik)
      .then(() => setSkopiowane(true))
      .catch((powod: unknown) => console.error(powod))
  }

  return (
    <>
      <div className="pole">
        <label htmlFor="znacznik-osadzenia">{teksty.osadzenie.znacznik.etykieta}</label>
        <textarea
          id="znacznik-osadzenia"
          className="osadzenie__znacznik"
          readOnly
          rows={2}
          value={znacznik}
        />
      </div>
      <div className="przyciski">
        <button type="button" className="przycisk" onClick={kopiuj}>
          {teksty.osadzenie.znacznik.kopiuj}
        </button>
        {skopiowane && (
          <p className="komunikat" role="status">
            {teksty.osadzenie.znacznik.skopiowano}
          </p>
        )}
      </div>
    </>
  )
}

/**
 * Lista dozwolonych domen: dopisanie i skasowanie. Wpis przechodzi przez
 * `normalizeOrigin` **w chwili dopisania**, a nie dopiero przy zapisie, i jest
 * to decyzja: lista jest tym, co obsługa ogląda, więc ma na niej stać dokładnie
 * to, co pojedzie do nagłówka — adres ze ścieżką poprawiony po cichu przy
 * zapisie byłby inną listą niż ta, którą przed chwilą przeczytała.
 *
 * Sama się nie zapisuje: przycisk jest jeden, na dole ekranu, wspólny
 * z dokumentami — bo jedno i drugie idzie jednym żądaniem.
 */
function Domeny({
  domeny,
  onZmien,
}: {
  domeny: readonly string[]
  onZmien: (domeny: string[]) => void
}) {
  const [wpis, setWpis] = useState('')
  const [zastrzezenie, setZastrzezenie] = useState<string | null>(null)

  const dodaj = () => {
    let domena: string
    try {
      domena = normalizeOrigin(wpis)
    } catch (powod) {
      // Reguła jest jedna — `normalizeOrigin`, ta sama, którą sprawdza serwer
      // — ale zdanie na ekran idzie ze słownika Panelu, tak jak każde inne
      // zdanie tego ekranu. Treść wyjątku zostaje w konsoli: mówi o zapisie,
      // a nie do obsługi.
      if (!(powod instanceof InvalidOriginError)) console.error(powod)
      setZastrzezenie(teksty.osadzenie.domeny.zlyZapis)
      return
    }

    setZastrzezenie(null)
    setWpis('')
    // Domena wpisana drugi raz nie dokłada się do listy: nagłówek i tak liczy
    // ją raz, a dwa wiersze kazałyby kasować ją dwukrotnie.
    if (!domeny.includes(domena)) onZmien([...domeny, domena])
  }

  return (
    <>
      {domeny.length === 0 ? (
        <p className="komunikat">{teksty.osadzenie.domeny.pusta}</p>
      ) : (
        <ul className="osadzenie__domeny">
          {domeny.map((domena) => (
            <li key={domena}>
              <span>{domena}</span>
              <button
                type="button"
                className="przycisk"
                onClick={() => onZmien(domeny.filter((wpisana) => wpisana !== domena))}
              >
                {teksty.osadzenie.domeny.usun(domena)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pole">
        <label htmlFor="nowa-domena">{teksty.osadzenie.domeny.etykieta}</label>
        <input
          id="nowa-domena"
          type="url"
          inputMode="url"
          value={wpis}
          onChange={(zdarzenie) => setWpis(zdarzenie.target.value)}
        />
        <span className="pole__opis">{teksty.osadzenie.domeny.opis}</span>
      </div>
      {zastrzezenie && (
        <p className="komunikat komunikat--blad" role="alert">
          {zastrzezenie}
        </p>
      )}
      <div className="przyciski">
        <button type="button" className="przycisk" onClick={dodaj}>
          {teksty.osadzenie.domeny.dodaj}
        </button>
      </div>
    </>
  )
}

/**
 * Osadzenie Widgetu i dokumenty Strzelnicy: gotowy znacznik do wklejenia,
 * lista domen, na których wolno go użyć, oraz regulamin i adres polityki
 * prywatności, na które klient godzi się przy Rezerwacji. Trzy rzeczy, jeden
 * przycisk i jedno żądanie — razem, bo są kolumnami jednego wiersza i jedną
 * odpowiedzią na pytanie „gdzie i na jakich warunkach się u mnie rezerwuje".
 *
 * Skasowanie domeny zabiera Widget z tamtej strony przy następnym wejściu —
 * nagłówek `frame-ancestors` liczy się z tej samej kolumny — ale nie rusza ani
 * jednej Rezerwacji, która już stamtąd przyszła. Tak samo jak wyłączenie Osi
 * czy wycofanie pozycji katalogu: mówi, czego Strzelnica nie sprzedaje, a nie
 * komu odbiera termin.
 */
export function Osadzenie({
  client,
  embedding,
  widgetOrigin,
  onZapisano,
}: {
  client: PanelClient
  /** Osadzenie zapisane w bazie; poprawiane żyje w stanie tego ekranu. */
  embedding: FacilityEmbedding
  /** Adres, spod którego podajemy Widget — konfiguracja platformy, nie Strzelnicy. */
  widgetOrigin: string
  onZapisano: () => void
}) {
  /**
   * Pól nie odświeżamy z danych przychodzących co minutę: obsługa bywa
   * w połowie wklejania regulaminu, a odczyt z bazy podmieniłby jej tekst
   * w trakcie. Ta sama decyzja, co w cenniku i w formularzu Osi.
   */
  const [domeny, setDomeny] = useState<string[]>([...embedding.allowedOrigins])
  const [regulamin, setRegulamin] = useState(embedding.terms)
  const [polityka, setPolityka] = useState(embedding.privacyUrl)
  const [wysylanie, setWysylanie] = useState(false)
  const [zastrzezenia, setZastrzezenia] = useState<readonly EmbeddingProblem[]>([])
  const [udane, setUdane] = useState(false)
  const [blad, setBlad] = useState(false)

  const zapisz = useCallback(
    (zamiar: EmbeddingDraft) => {
      // Zastrzeżenia liczone tą samą czystą funkcją, którą serwer sprawdza je
      // po raz drugi — walidacja w przeglądarce jest wygodą, a nie
      // zabezpieczeniem.
      const problemy = embeddingProblems(zamiar)
      if (problemy.length > 0) {
        setZastrzezenia(problemy)
        setUdane(false)
        return
      }

      setWysylanie(true)
      setBlad(false)
      setZastrzezenia([])
      setUdane(false)

      ustawOsadzenie(client, zamiar)
        .then((wynik) => {
          setZastrzezenia(wynik.ok ? [] : [wynik.problem])
          setUdane(wynik.ok)
          // Pola nie wracają do niczego: opisują dalej tę samą Strzelnicę.
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

  const draft: EmbeddingDraft = {
    allowedOrigins: domeny,
    terms: regulamin.trim(),
    privacyUrl: polityka.trim(),
  }

  return (
    <section className="konfiguracja">
      <h2>{teksty.osadzenie.naglowek}</h2>
      <p className="komunikat">{teksty.osadzenie.wstep}</p>

      <h3>{teksty.osadzenie.znacznik.naglowek}</h3>
      <p className="komunikat">{teksty.osadzenie.znacznik.wstep}</p>
      <Znacznik widgetOrigin={widgetOrigin} slug={embedding.slug} />

      <h3>{teksty.osadzenie.domeny.naglowek}</h3>
      <p className="komunikat">{teksty.osadzenie.domeny.wstep}</p>
      <Domeny domeny={domeny} onZmien={setDomeny} />

      <h3>{teksty.osadzenie.dokumenty.naglowek}</h3>
      <p className="komunikat">{teksty.osadzenie.dokumenty.wstep}</p>
      <div className="pole">
        <label htmlFor="regulamin-strzelnicy">{teksty.osadzenie.dokumenty.regulamin}</label>
        <textarea
          id="regulamin-strzelnicy"
          rows={8}
          maxLength={MAX_TERMS_LENGTH}
          value={regulamin}
          onChange={(zdarzenie) => setRegulamin(zdarzenie.target.value)}
        />
        <span className="pole__opis">{teksty.osadzenie.dokumenty.regulaminOpis}</span>
      </div>
      <div className="pole">
        <label htmlFor="polityka-strzelnicy">{teksty.osadzenie.dokumenty.polityka}</label>
        <input
          id="polityka-strzelnicy"
          type="url"
          inputMode="url"
          value={polityka}
          onChange={(zdarzenie) => setPolityka(zdarzenie.target.value)}
        />
        <span className="pole__opis">{teksty.osadzenie.dokumenty.politykaOpis}</span>
      </div>

      {zastrzezenia.map((problem) => (
        <p key={problem} className="komunikat komunikat--blad" role="alert">
          {teksty.osadzenie.problem[problem]}
        </p>
      ))}
      {udane && (
        <p className="komunikat" role="status">
          {teksty.osadzenie.zapisano}
        </p>
      )}
      {blad && (
        <p className="komunikat komunikat--blad" role="alert">
          {teksty.osadzenie.blad}
        </p>
      )}

      <div className="przyciski">
        <button
          type="button"
          className="przycisk"
          onClick={() => zapisz(draft)}
          disabled={wysylanie}
        >
          {wysylanie ? teksty.osadzenie.zapisywanie : teksty.osadzenie.zapisz}
        </button>
      </div>
    </section>
  )
}
