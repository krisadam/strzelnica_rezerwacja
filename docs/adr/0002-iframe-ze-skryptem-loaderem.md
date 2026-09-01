# Osadzanie przez skrypt-loader tworzący iframe

Widget trafia na strony WWW, nad którymi nie mamy kontroli. Osadzamy go
w `<iframe>` tworzonym przez mały skrypt-loader (`<script src="…/embed.js"
data-strzelnica="…">`), który przez `postMessage` synchronizuje wysokość ramki
i przewijanie przy zmianie kroku formularza.

Odrzucone: web component w Shadow DOM — brak twardej izolacji od CSS, `z-index`
i CSP strony gospodarza daje klasę błędów niereprodukowalnych lokalnie. Odrzucone
też gołe `<iframe>` ze sztywną wysokością — formularz zmienia wysokość między
krokami.

Konsekwencja: musimy utrzymywać listę dozwolonych domen per Strzelnica
i wystawiać zgodny z nią nagłówek `frame-ancestors`.

Konsekwencja dla hostingu: nagłówek musi być liczony **na żądanie**, z listy
czytanej z bazy — czyli funkcją brzegową, nie statyczną listą nagłówków
(`_headers` w Cloudflare Pages). Statyczna lista jest zapiekana w budowaniu,
więc zamroziłaby dozwolone domeny na moment wdrożenia: zmiana listy w Panelu
i każda nowa Strzelnica wymagałyby wtedy ponownego wdrożenia Widgetu, co
przeczy wielodostępności z ADR 0001. Slug Strzelnicy zostaje w parametrze
adresu ramki; jego przeniesienie do ścieżki nie zdejmuje tego wymagania,
a funkcja brzegowa czyta parametr równie łatwo. Adresu ramki nie ma w kodzie
wklejonym na stronie gospodarza — składa go `embed.js` — więc jego kształt
wolno zmienić później bez ruszania czegokolwiek u Strzelnic.
