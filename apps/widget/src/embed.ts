/**
 * Skrypt-loader osadzający Widget na obcej stronie. Właściciel strony wkleja
 * jeden znacznik:
 *
 *     <script src="https://…/embed.js" data-strzelnica="strzelnica-demo"></script>
 *
 * i dostaje ramkę z kalendarzem w miejscu tego znacznika. Skrypt jest budowany
 * osobno (`vite.embed.config.ts`) jako pojedynczy plik bez modułów — trafia na
 * strony, o których nic nie wiemy, więc nie zakłada po nich niczego.
 *
 * Zobacz ADR 0002: ramka zamiast web componentu.
 */
import { readWidgetMessage, TYTUL_RAMKI, widgetFrameUrl } from '@strzelnica/shared'

/**
 * Wysokość do pierwszego komunikatu z ramki. Ramka nie może startować od zera,
 * bo Widget, który się nie wczyta, byłby wtedy niewidoczny — łącznie z własnym
 * komunikatem o błędzie.
 */
const WYSOKOSC_POCZATKOWA = 600

/**
 * Kształt ramki: promień i **wyłącznie poziomy** margines, w pikselach.
 * Ciemny Widget na jasnej stronie gospodarza ma się czytać jako celowa ciemna
 * karta, a nie jak dziura w jego layoucie (ADR 0014) — a że do wnętrza ramki
 * nie wchodzi nic ze stylów gospodarza, krawędź ramki jest jedynym miejscem,
 * w którym da się to powiedzieć.
 *
 * Piksele, a nie `rem` spod tokenów modułu: `rem` na cudzej stronie mierzy się
 * jej korzeniem, więc ta sama liczba dawałaby inny kształt na każdej stronie,
 * na której nas ktoś osadzi. Osiem pikseli to `--promien` (0,5 rem) przy
 * korzeniu domyślnym.
 *
 * Marginesu pionowego nie ma świadomie: wysokość ramki niesie protokół
 * `postMessage`, więc odstęp w pionie wchodziłby w ten sam wymiar, o którym
 * ten protokół mówi.
 */
const PROMIEN_RAMKI = 8
const MARGINES_POZIOMY = 16

function osadz(skrypt: HTMLScriptElement): void {
  const adres = widgetFrameUrl({
    loaderSrc: skrypt.src,
    facilitySlug: skrypt.dataset.strzelnica ?? '',
    hostOrigin: window.location.origin,
  })
  const zrodloWidgetu = new URL(adres).origin

  const ramka = document.createElement('iframe')
  ramka.src = adres
  ramka.title = TYTUL_RAMKI
  ramka.style.display = 'block'
  // Margines dokłada się do szerokości, więc ramka rozciągnięta na stoprocentową
  // szerokość wystawałaby o niego poza kolumnę gospodarza.
  ramka.style.width = `calc(100% - ${2 * MARGINES_POZIOMY}px)`
  ramka.style.margin = `0 ${MARGINES_POZIOMY}px`
  ramka.style.border = '0'
  ramka.style.borderRadius = `${PROMIEN_RAMKI}px`
  ramka.style.height = `${WYSOKOSC_POCZATKOWA}px`
  skrypt.insertAdjacentElement('afterend', ramka)

  window.addEventListener('message', (zdarzenie: MessageEvent) => {
    // Do okna gospodarza pisze każdy skrypt na jego stronie. Bierzemy pod
    // uwagę wyłącznie to, co przyszło z naszej ramki i z naszej domeny.
    if (zdarzenie.source !== ramka.contentWindow) return
    if (zdarzenie.origin !== zrodloWidgetu) return

    const komunikat = readWidgetMessage(zdarzenie.data)
    if (!komunikat) return

    if (komunikat.kind === 'height') ramka.style.height = `${komunikat.height}px`
    if (komunikat.kind === 'scrollToTop') przewinDoRamki(ramka)
  })
}

/**
 * Przewinięcie do góry ramki tylko wtedy, gdy ta góra wyszła ponad ekran.
 * Widoczny formularz, który sam skacze pod palcami, jest gorszy od formularza,
 * który nie skacze wcale.
 */
function przewinDoRamki(ramka: HTMLIFrameElement): void {
  const polozenie = ramka.getBoundingClientRect()
  if (polozenie.top >= 0) return
  window.scrollTo({ top: polozenie.top + window.scrollY, behavior: 'smooth' })
}

const skrypt = document.currentScript
if (skrypt instanceof HTMLScriptElement) {
  try {
    osadz(skrypt)
  } catch (powod) {
    // Strona gospodarza ma działać dalej; wiadomość zostaje w konsoli tego,
    // kto osadza, bo to on ma ją naprawić.
    console.error('Nie udało się osadzić Widgetu rezerwacji.', powod)
  }
}
