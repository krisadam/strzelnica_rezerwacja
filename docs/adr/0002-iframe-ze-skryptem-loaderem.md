# Osadzanie przez skrypt-loader tworzący iframe

Widget trafia na strony WWW, nad którymi nie mamy kontroli. Osadzamy go
w `<iframe>` tworzonym przez mały skrypt-loader (`<script src="…/embed.js"
data-facility="…">`), który przez `postMessage` synchronizuje wysokość ramki
i przewijanie przy zmianie kroku formularza.

Odrzucone: web component w Shadow DOM — brak twardej izolacji od CSS, `z-index`
i CSP strony gospodarza daje klasę błędów niereprodukowalnych lokalnie. Odrzucone
też gołe `<iframe>` ze sztywną wysokością — formularz zmienia wysokość między
krokami.

Konsekwencja: musimy utrzymywać listę dozwolonych domen per Strzelnica
i wystawiać zgodny z nią nagłówek `frame-ancestors`.
