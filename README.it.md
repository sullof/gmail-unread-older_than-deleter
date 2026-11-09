# GUOD - Gmail Unread Older_than Deleter

[English README](README.md)

Estensione per Chrome che, sulla ricerca Gmail già aperta, seleziona la pagina visibile, la sposta nel Cestino, aspetta e ripete. I messaggi restano nel Cestino per 30 giorni. La modalità veloce aspetta 5 secondi. La modalità lenta aspetta un tempo casuale fra 10 e 15 secondi, e prima di selezionare la pagina aspetta fra 0 e 3 secondi. È più gentile con Gmail quando inizia a rispondere con errori.

Il pannello e i messaggi seguono la lingua del browser: italiano se il browser è in italiano, inglese negli altri casi. Il nome resta **GUOD** in entrambe. Quando il pannello è ridotto, il pulsante dice **GUOD**. I pulsanti di Gmail vengono cercati sia in italiano sia in inglese.

## Requisiti della ricerca

Il pulsante **Avvia** resta disattivato finché l'indirizzo non è una ricerca (`#search/`) che contiene tutte e due queste condizioni:

- `is:unread`
- `older_than:` di almeno 90 giorni (`90d`, `3m`, `1y`; un mese vale 30 giorni, un anno 365)

Il resto della query può cambiare. Per esempio:

```text
is:unread older_than:90d in:forums
is:unread older_than:1y from:linkedin.com
```

Non parte se nella ricerca compare uno di questi operatori: `in:trash`, `in:spam`, `in:sent`, `in:draft`, `in:drafts`, `is:starred`, `is:important`. Non parte nemmeno dalle viste Cestino, Spam, Posta inviata, Bozze, Speciali o Importanti. Se la casella di ricerca è stata modificata e non coincide con l'indirizzo, va premuto Invio prima di avviare.

## Limiti

- Agisce solo su `https://mail.google.com/`.
- Ogni ciclo prende solo la pagina visibile, circa 50 righe, poi attende 5 secondi in modalità veloce. In modalità lenta la pausa è casuale fra 10 e 15 secondi, e la selezione della pagina aspetta fra 0 e 3 secondi.
- Riconosce il cestino dal nome **Delete** o **Elimina**, non dalla posizione dell'icona.
- Si ferma da solo quando l'elenco resta vuoto. Il pannello dice **Finito. Nessuna riga rimasta.** In inglese: **Done. No rows left.**
- Se un clic non ha effetto, riprova fino a tre volte e poi si ferma.
- Va in pausa se la scheda non è visibile. Continua se Gmail è la scheda davanti di una finestra aperta sullo schermo, anche mentre si lavora altrove. Si ferma se quella finestra è minimizzata, coperta del tutto o su uno spazio di macOS non visibile.
- Una sola finestra di Gmail. Più schede nella stessa finestra non lavorano insieme: quella dietro è in pausa.

## Installazione

1. Apri `chrome://extensions`.
2. Attiva la **modalità sviluppatore**.
3. Clicca **Carica estensione non pacchettizzata** e scegli questa cartella.
4. Ricarica Gmail. Il pannello GUOD compare in basso a destra.
5. Apri una ricerca che rispetta i requisiti sopra e premi **Avvia**.

Chrome avvisa che l'estensione può leggere e modificare i dati su `mail.google.com`: è il permesso con cui lo script gira dentro Gmail. Dopo una modifica al codice, in `chrome://extensions` premi **Ricarica** sull'estensione e aggiorna la scheda di Gmail.

Lo stesso caricamento vale per Edge, Brave e gli altri browser Chromium, dalla loro pagina delle estensioni.

## Licenza

Rilasciata sotto [licenza MIT](LICENSE).

L'estensione è stata provata solo con alcune configurazioni. Può avere bachi e può non funzionare come ti aspetti. La usi a tuo rischio. L'autore non si assume alcuna responsabilità se non funziona come previsto.

Copyright (c) 2026 Francesco Sullo
