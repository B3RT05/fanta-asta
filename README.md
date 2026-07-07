# Fanta Asta

Applicazione web per gestire l'asta del fantacalcio: studio pre-asta con fasce di prezzo e previsione della spesa, più gestione live dell'asta con profili degli avversari e consigli in tempo reale.

## Funzionalità

### Studio Pre-Asta
- **Importa quotazioni e statistiche** dai file Excel scaricati da fantacalcio.it
- **Fasce di prezzo** personalizzabili per categoria (portiere, difensore, centrocampista, attaccante)
- **Previsione spesa** a livello di ruolo per pianificare il budget
- **Analisi occasioni e trappole** per identificare affare e rischi

### Gestione Asta Live
- **Profili avversari** (Amici 1-5) per tracciare le strategie
- **Consigli in tempo reale** basati su scarsità, timing e budget rimanente
- **Cruscotto di asta** con budget, giocatori selezionati e raccomandazioni

### Storage e Export
- **Backup automatico** nello storage locale del browser
- **Export/Import JSON**: salva il backup a fine asta via Setup → Esporta JSON

## Come iniziare

### 1. Scaricare i file Excel
Vai su [fantacalcio.it](https://www.fantacalcio.it), sezione **Quotazioni**, e scarica:
- **Quotazioni.xlsx** — quotazioni attuali dei giocatori
- **Statistiche.xlsx** — statistiche della stagione

### 2. Installazione e avvio locale

```bash
npm install
npm run dev
```

L'app sarà disponibile su `http://localhost:5173`.

### 3. Test

```bash
npm test
```

### 4. Build per produzione

```bash
npm run build
```

Il build viene automaticamente deployato su GitHub Pages quando effettui il push al branch `main`.

## Promemoria

- **Non dimenticare il backup a fine asta**: vai su Setup → Esporta JSON e salva il file sul tuo computer.

## Documentazione

- [Specifiche di design](docs/superpowers/specs/2026-07-07-fanta-asta-design.md)
- [Piano di sviluppo](docs/superpowers/plans/2026-07-07-fanta-asta.md)

## Deploy

L'app è deployata automaticamente su GitHub Pages tramite il workflow `.github/workflows/deploy.yml`. Ogni push al branch `main` avvia il build, i test e il deploy.
