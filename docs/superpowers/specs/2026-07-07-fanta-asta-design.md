# Fanta Asta — Design

**Data**: 2026-07-07
**Stato**: approvato a voce sezione per sezione; in attesa di review scritta

## Obiettivo

Web app per il fantacalcio (regole Classic, asta a chiamata + rilancio) in due fasi:

1. **Pre-asta**: studio del listone — fasce di valutazione per giocatore, previsione di spesa, individuazione di occasioni e trappole, piano di budget per ruolo.
2. **Asta live**: registrazione di ogni acquisto di ogni squadra della lega; budget e slot residui di tutti; **profilo strategia di ogni avversario dedotto dai suoi acquisti**; consigli su chi chiamare e quando.

L'obiettivo strategico: capire in tempo reale le strategie degli avversari mentre costruiscono la rosa (es. "compra solo dalle big", "accumula scommesse", "tutto sull'attacco", "porta low cost") e adattare la propria di conseguenza.

**Utenti**: Filippo + amici della lega, ognuno per conto proprio (nessuna collaborazione realtime). **Dispositivo**: portatile/PC durante l'asta.

## Non-obiettivi (per ora)

- Modalità collaborativa (un segretario inserisce, tutti vedono) — richiederebbe un backend; la separazione logica/UI la rende aggiungibile in futuro.
- Regole Mantra (i ruoli Mantra vengono importati e mostrati, ma slot e logiche sono Classic).
- Gestione stagionale post-asta (formazioni, voti settimanali).
- Machine learning: tutte le logiche sono euristiche trasparenti e spiegabili.

## Architettura

- **SPA React + Vite**, nessun backend. Deploy statico (GitHub Pages o Netlify): gli amici aprono un link.
- **SheetJS (xlsx)** per leggere i file Excel direttamente nel browser (drag & drop).
- **dnd-kit** per il drag-and-drop dei giocatori tra fasce.
- **Stato in localStorage** (schema versionato), con **export/import JSON** per backup e trasferimento tra PC.
- **Logica pura separata dalla UI**: i moduli di calcolo (previsione spesa, fasce automatiche, profili avversari, consigli) sono funzioni pure senza dipendenze React, testate con vitest. La UI li consuma soltanto.
- Funziona offline una volta caricata (nessuna chiamata di rete).

### Struttura moduli (indicativa)

```
src/
  logic/            # funzioni pure, testate
    parseListone.ts   # xlsx quotazioni -> Player[]
    parseStats.ts     # xlsx statistiche -> merge per Id
    tiering.ts        # proposta fasce automatiche
    pricing.ts        # previsione di spesa (range)
    auction.ts        # stato derivato: budget, slot, max rilancio
    profiles.ts       # profili strategia avversari
    advisor.ts        # consigli chi chiamare / timing / scarsità
    storage.ts        # (de)serializzazione, versioning, export/import
  ui/               # componenti React
  App.tsx
```

## Dati di input

Due file Excel ufficiali di Fantacalcio.it, uniti per **Id giocatore** (chiave stabile tra i due file e tra stagioni):

1. **Quotazioni** (obbligatorio) — foglio `Tutti`, header alla riga 2: `Id, R, RM, Nome, Squadra, Qt.A, Qt.I, Diff., Qt.A M, Qt.I M, Diff.M, FVM, FVM M`. Il foglio `Ceduti` viene ignorato. ~532 giocatori.
2. **Statistiche stagione precedente** (opzionale, raccomandato) — foglio `Tutti`: `Id, R, Rm, Nome, Squadra, Pv, Mv, Fm, Gf, Gs, Rp, Rc, R+, R-, Ass, Amm, Esp, Au`. Verificato: copre il 100% dei giocatori del listone 2025/26; i giocatori presenti solo nelle statistiche (usciti dalla Serie A) vengono ignorati.

**Re-import** (nuova stagione o listone aggiornato): le fasce assegnate si riagganciano per Id; i giocatori nuovi (senza fascia) e quelli spariti finiscono in una vista "da rivedere".

## Modello dati (un unico JSON serializzabile)

1. **Player**: id, nome, squadra, ruolo Classic (P/D/C/A), ruoli Mantra, Qt.A, Qt.I, FVM + statistiche opzionali (Pv, Mv, Fm, Gf, Ass, ...).
2. **LeagueConfig**: budget (default 500), squadre della lega (nomi, una è "io"), slot per ruolo (default 3P/8D/8C/6A). Tutto modificabile.
3. **Tiers**: mappa playerId → fascia. Fasce di default: **Top, Semitop, Scommessa, Titolare buono, Riempitivo, Non mi interessa** — rinominabili/estendibili. Flag "da rivedere" sui casi ambigui. Stella "target" indipendente dalla fascia.
4. **Auction**: lista cronologica di acquisti `{playerId, teamId, prezzo, timestamp-ordinale}` + note pre-asta per squadra avversaria. Budget residui, slot mancanti, massimo rilancio sono **sempre derivati**, mai memorizzati: correggere o cancellare un acquisto risistema tutto.

## Pre-asta

### Fasce automatiche (proposta iniziale, poi comanda il drag-and-drop)

Per ruolo, punteggio composito su fantamedia (Fm), titolarità (Pv) e valore di mercato (FVM), con soglie di taglio proposte:

- **Top**: FVM alto + Fm alta + Pv alto.
- **Semitop**: un gradino sotto per FVM o Fm.
- **Scommessa**: FVM/Qt alti ma Pv basso o statistiche assenti (nuovi acquisti, giovani), oppure `Diff = Qt.A − Qt.I` fortemente positiva (giocatore in ascesa per i quotisti).
- **Titolare buono**: Pv alto, Fm discreta, FVM medio-basso.
- **Riempitivo**: il resto con un minimo di presenze.
- **Non mi interessa**: assegnabile solo a mano.

I casi ambigui (punteggi a cavallo di due fasce, statistiche mancanti con FVM rilevante) sono marcati "da rivedere". Le soglie sono costanti nominate in `tiering.ts`, facilmente ritoccabili.

### Previsione di spesa (range, non numero secco)

- Crediti totali della lega: `budget × n_squadre` (es. 500 × 8 = 4000).
- **Pool acquistabili per ruolo**: i migliori `slot_ruolo × n_squadre` per FVM (es. 64 D in una lega da 8).
- Budget di ruolo: quota dei crediti totali proporzionale alla somma FVM del pool di ruolo, corretta da **moltiplicatori di inflazione per ruolo** (gli attaccanti si pagano sopra il valore teorico; default dichiarati in `pricing.ts`, marcati "da calibrare").
- Prezzo base giocatore: `FVM / ΣFVM_pool_ruolo × budget_ruolo`, corretto da **moltiplicatori di fascia** (i Top si strapagano; i Riempitivi hanno floor a 1).
- Output: **range** (± percentuale, più largo per le Scommesse), es. "Lautaro: 180–220".
- **Calibrazione futura**: i prezzi reali registrati durante le aste diventano lo storico per tarare moltiplicatori di ruolo e fascia dalle stagioni successive.

### Vista di studio

- Tabella filtrabile/ordinabile per ruolo, squadra, fascia, con ricerca.
- Evidenza **occasioni** (rendimento reale sopra il valore percepito: Fm alta, FVM basso) e **trappole** (l'opposto).
- Pannello **"la mia strategia"**: allocazione di budget per ruolo decisa dall'utente + lista target (stelle).

## Asta live

### Inserimento acquisti (≤ 3 secondi a operazione)

Ricerca con autocompletamento → giocatore → squadra acquirente → prezzo → invio. Undo/modifica dell'ultimo acquisto sempre visibile; correzione di qualsiasi acquisto dalla cronologia. I venduti spariscono dalle liste.

### Cruscotto lega (sempre visibile)

Una riga per squadra: crediti residui, slot mancanti per ruolo, **massimo rilancio possibile** = `crediti − (slot_ancora_da_riempire − 1)` (ogni slot costa almeno 1), spesa media.

### Profili strategia avversari (dedotti dagli acquisti)

Per squadra, aggiornati a ogni acquisto e confrontati con la media lega:

- **Distribuzione spesa per ruolo** ("70% sull'attacco", "centrocampo sovrapesato").
- **Profilo club**: quota acquisti da squadre big vs minori (lista big configurabile, default: le partecipanti alle coppe europee).
- **Profilo fascia** (usa le fasce dell'utente): quota Top / Scommesse / Titolari buoni acquistati.
- **Profilo prezzo**: scostamento medio dal range previsto ("strapaga i top del +20%", "porta low cost → mai oltre 5 crediti su un portiere").
- **Note pre-asta** scritte dall'utente per ogni avversario; l'app affianca i dati che confermano o smentiscono.

### Consigli "chi chiamare"

Motore a euristiche trasparenti; ogni consiglio mostra il perché:

- **Contesa stimata** per ogni target: avversari con slot liberi nel ruolo ∧ crediti sufficienti ∧ profilo compatibile con quel tipo di giocatore.
- **Timing**: "chiama ora X: 3 dei 4 potenziali rivali hanno il ruolo pieno" / "aspetta su Y: l'Amico 4 ha 300 crediti e 2 slot in attacco".
- **Allarmi scarsità**: "restano 3 Titolari buoni in difesa non venduti e ti mancano 4 difensori".
- **Piano adattivo**: budget residuo per ruolo vs piano pre-asta, ricalcolato a ogni acquisto.

## Gestione errori

- **Import**: validazione colonne attese e conteggio righe; messaggi chiari ("questo sembra il file statistiche, non il listone"); file malformati non toccano lo stato esistente.
- **localStorage**: schema versionato con migrazioni; se corrotto, si riparte dall'ultimo export JSON (l'app ricorda periodicamente di esportare, e propone l'export a fine asta).
- **Asta**: nessuno stato derivato memorizzato → ogni errore di inserimento si corregge editando la cronologia; guardie sui vincoli (prezzo > max rilancio della squadra, ruolo con slot pieni) con warning ma **override consentito** (la realtà dell'asta vince sull'app).

## Testing

- **vitest sui moduli `logic/`**: parsing (file reali come fixture), pricing (proprietà: la somma dei prezzi previsti ≈ crediti totali; floor a 1), auction (budget/slot/max rilancio dopo sequenze di acquisti + correzioni), profiles e advisor (scenari sintetici tipo gli "Amici 1-5").
- UI: smoke test dei flussi principali; verifica manuale con una simulazione d'asta completa prima dell'asta vera.

## Deploy e distribuzione

- Build statica Vite → GitHub Pages (o Netlify). Un URL da girare agli amici.
- Nessun dato condiviso: ognuno ha il suo localStorage.

## Roadmap futura (fuori scope, annotata)

1. Calibrazione previsione prezzi dallo storico aste registrate.
2. Modalità collaborativa con backend leggero (la logica pura si riusa).
3. Layout mobile.
4. Supporto regole Mantra.
