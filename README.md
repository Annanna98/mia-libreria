# La mia libreria — MVP PWA

Una piccola web app installabile sul telefono per catalogare libri tramite ISBN.

## Funzioni incluse

- Scansione ISBN/EAN dalla fotocamera
- Modalità rapida per catalogare uno scaffale senza uscire dallo scanner
- Rilevamento immediato dei doppioni per ISBN
- Avviso per possibile altra edizione dello stesso titolo
- Recupero automatico di titolo, autore, editore, anno e copertina da Open Library
- Aggiunta e modifica manuale
- Stato: Da leggere / In lettura / Letto
- Posizione fisica e note
- Ricerca, filtri e ordinamento
- Statistiche di base
- Database locale IndexedDB
- Backup JSON ed importazione
- Installabile come PWA
- Service worker per l'interfaccia offline

## Come provarla

La fotocamera del browser richiede un contesto sicuro: HTTPS oppure localhost.

### Metodo più semplice sul telefono

1. Pubblica il repository con GitHub Pages.
2. Apri l'URL dal telefono.
3. Consenti l'accesso alla fotocamera.
4. Dal menu del browser scegli “Aggiungi a schermata Home” / “Installa app”.

### Test da computer

Dalla cartella del progetto:

```bash
python3 -m http.server 8080
```

Poi apri `http://localhost:8080`.

## Note tecniche

- Lo scanner prova prima la Barcode Detection API nativa, quando disponibile.
- Se non è disponibile carica `@zxing/browser` come fallback.
- I dati dei libri vengono richiesti in tempo reale all'API ISBN di Open Library.
- I dati personali della libreria restano in IndexedDB sul dispositivo.

## Step successivo consigliato

Aggiungere Supabase per login e sincronizzazione cloud multi-dispositivo mantenendo l'app local-first.
