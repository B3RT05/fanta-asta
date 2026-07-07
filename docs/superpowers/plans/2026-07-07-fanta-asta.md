# Fanta Asta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SPA React per l'asta del fantacalcio: studio pre-asta (fasce + previsione di spesa) e gestione asta live (tracking acquisti, profili strategia avversari, consigli di chiamata).

**Architecture:** Vite + React + TypeScript, nessun backend. Tutta la logica di dominio in `src/logic/` come funzioni pure testate con vitest; la UI consuma la logica via un reducer con autosave su localStorage. Deploy statico.

**Tech Stack:** React 18, Vite 5, TypeScript, vitest + @testing-library/react + jsdom, `xlsx` (SheetJS), `@dnd-kit/core`.

## Global Constraints

- Spec di riferimento: `docs/superpowers/specs/2026-07-07-fanta-asta-design.md` — vincola nomi fasce, formule e default.
- Fasce default (id → label): `top` → "Top", `semitop` → "Semitop", `scommessa` → "Scommessa", `titolare` → "Titolare buono", `riempitivo` → "Riempitivo", `skip` → "Non mi interessa".
- Default lega: budget 500, slot `{P:3, D:8, C:8, A:6}`, 8 squadre.
- `maxBid = crediti − (slotDaRiempireTotali − 1)`, mai sotto 0.
- Nessuno stato derivato persistito: budget/slot/profili si ricalcolano sempre dagli acquisti.
- Niente chiamate di rete a runtime. Lingua UI: italiano.
- Costanti euristiche (soglie fasce, moltiplicatori prezzo) = `export const` nominate nel modulo che le usa, commentate `// da calibrare`.
- Ogni modulo `src/logic/*.ts` NON importa nulla da React o da `src/ui/`.
- I due file xlsx reali sono in `tests/fixtures/` e fanno da fixture dei test di parsing.

## File Structure

```
fanta_asta/
  package.json, vite.config.ts, tsconfig.json, index.html
  tests/fixtures/quotazioni.xlsx        # copia del file reale 2025/26
  tests/fixtures/statistiche.xlsx       # copia del file reale 2025/26
  src/
    logic/
      types.ts          # tipi condivisi (Player, LeagueConfig, Purchase, AppState...)
      parseListone.ts   # xlsx quotazioni -> Player[]
      parseStats.ts     # xlsx statistiche -> merge in Player[]
      tiering.ts        # proposta fasce automatiche + flag "da rivedere"
      pricing.ts        # previsione di spesa a range
      auction.ts        # stato derivato: TeamState[] (crediti, slot, maxBid)
      profiles.ts       # profilo strategia per squadra avversaria
      advisor.ts        # contesa target, timing, allarmi scarsità
      storage.ts        # localStorage versionato + export/import JSON
    state/
      reducer.ts        # AppState + azioni; unico punto di mutazione
    ui/
      App.tsx           # shell a 3 tab: Setup / Studio / Asta
      SetupTab.tsx      # import xlsx + config lega + export/import JSON
      StudioTab.tsx     # tabella studio + occasioni/trappole + piano budget
      TierBoard.tsx     # colonne fasce con drag-and-drop (dnd-kit)
      AstaTab.tsx       # inserimento acquisti + cruscotto + profili + consigli
      styles.css
    main.tsx
  tests/
    logic/*.test.ts     # un file di test per modulo logic
    ui/*.test.tsx       # smoke test dei tab
```

---

### Task 1: Scaffold progetto + vitest

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`, `.gitignore`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: —
- Produces: comandi `npm test` (vitest run) e `npm run dev`; alias di import `@/` → `src/`.

- [ ] **Step 1: Scaffold Vite**

```bash
cd C:/Users/EvolveErasmus/Desktop/fanta_asta
npm create vite@latest . -- --template react-ts
npm install
npm install xlsx @dnd-kit/core
npm install -D vitest @testing-library/react @testing-library/user-event jsdom @testing-library/jest-dom
```

(Se `npm create` si lamenta della cartella non vuota — ci sono `docs/` e `.git` — scegliere "Ignore files and continue".)

- [ ] **Step 2: Configurare vitest e alias**

`vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: './', // deploy statico su GitHub Pages
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    setupFiles: ['tests/setup.ts'],
  },
})
```

`tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

In `package.json` aggiungere agli scripts: `"test": "vitest run", "test:watch": "vitest"`.
In `tsconfig.json` (compilerOptions): `"baseUrl": ".", "paths": { "@/*": ["src/*"] }`.

- [ ] **Step 3: App placeholder + smoke test**

`src/ui/App.tsx`:

```tsx
export default function App() {
  return <h1>Fanta Asta</h1>
}
```

`tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs', () => { expect(1 + 1).toBe(2) })
})
```

- [ ] **Step 4: Verifica**

Run: `npm test` → PASS (1 test). `npm run build` → build ok.

- [ ] **Step 5: Copiare le fixture**

```bash
mkdir -p tests/fixtures
cp "C:/Users/EvolveErasmus/Downloads/Quotazioni_Fantacalcio_Stagione_2025_26.xlsx" tests/fixtures/quotazioni.xlsx
cp "C:/Users/EvolveErasmus/Downloads/Statistiche_Fantacalcio_Stagione_2025_26.xlsx" tests/fixtures/statistiche.xlsx
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold vite+react+ts, vitest, fixture xlsx"
```

---

### Task 2: Tipi condivisi

**Files:**
- Create: `src/logic/types.ts`

**Interfaces:**
- Produces (usati da TUTTI i task successivi):

```ts
export type Role = 'P' | 'D' | 'C' | 'A'

export interface PlayerStats {
  pv: number; mv: number; fm: number
  gf: number; gs: number; rp: number; rc: number
  rPlus: number; rMinus: number; ass: number
  amm: number; esp: number; au: number
}

export interface Player {
  id: number
  nome: string
  squadra: string
  ruolo: Role
  ruoliMantra: string[]
  qtA: number
  qtI: number
  fvm: number
  stats?: PlayerStats
}

export type TierId = 'top' | 'semitop' | 'scommessa' | 'titolare' | 'riempitivo' | 'skip'

export const TIER_LABELS: Record<TierId, string> = {
  top: 'Top', semitop: 'Semitop', scommessa: 'Scommessa',
  titolare: 'Titolare buono', riempitivo: 'Riempitivo', skip: 'Non mi interessa',
}
export const TIER_ORDER: TierId[] = ['top', 'semitop', 'scommessa', 'titolare', 'riempitivo', 'skip']

export interface LeagueConfig {
  budget: number            // default 500
  teams: string[]           // nomi squadre della lega; teams[myTeamIndex] = io
  myTeamIndex: number
  slots: Record<Role, number> // default {P:3,D:8,C:8,A:6}
  bigClubs: string[]        // per il profilo club avversari
}

export interface Purchase {
  playerId: number
  teamIndex: number  // indice in league.teams
  price: number
  seq: number        // ordine cronologico, assegnato dal reducer
}

export interface PriceRange { base: number; min: number; max: number }

export interface AppState {
  version: number
  players: Player[]
  league: LeagueConfig
  tiers: Record<number, TierId>
  review: number[]            // playerId "da rivedere"
  targets: number[]           // playerId con stella
  rolePlan: Record<Role, number> // budget pianificato per ruolo (pre-asta)
  purchases: Purchase[]
  teamNotes: Record<number, string> // note pre-asta per teamIndex
}

export const DEFAULT_LEAGUE: LeagueConfig = {
  budget: 500,
  teams: ['Io', 'Squadra 2', 'Squadra 3', 'Squadra 4', 'Squadra 5', 'Squadra 6', 'Squadra 7', 'Squadra 8'],
  myTeamIndex: 0,
  slots: { P: 3, D: 8, C: 8, A: 6 },
  bigClubs: ['Inter', 'Napoli', 'Milan', 'Juventus', 'Atalanta', 'Roma', 'Lazio', 'Fiorentina', 'Bologna'],
}
```

- [ ] **Step 1: Creare `src/logic/types.ts`** col contenuto sopra (è già l'implementazione completa; niente test: soli tipi/costanti).

- [ ] **Step 2: Verifica** — Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 3: Commit** — `git add src/logic/types.ts && git commit -m "feat: tipi di dominio condivisi"`

---

### Task 3: Parsing listone quotazioni

**Files:**
- Create: `src/logic/parseListone.ts`
- Test: `tests/logic/parseListone.test.ts`

**Interfaces:**
- Consumes: `Player`, `Role` da `@/logic/types`.
- Produces: `parseListone(data: ArrayBuffer | Uint8Array): Player[]` — lancia `Error` con messaggio italiano se il file non è il listone.

- [ ] **Step 1: Test fallente**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'

const buf = () => new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx'))

describe('parseListone', () => {
  it('legge tutti i giocatori dal foglio Tutti', () => {
    const players = parseListone(buf())
    expect(players.length).toBeGreaterThan(500)
    const carnesecchi = players.find(p => p.id === 4431)!
    expect(carnesecchi).toMatchObject({ nome: 'Carnesecchi', squadra: 'Atalanta', ruolo: 'P', qtA: 18, qtI: 14, fvm: 80 })
  })
  it('splitta i ruoli Mantra su ;', () => {
    const players = parseListone(buf())
    const paz = players.find(p => p.id === 6875)!
    expect(paz.ruoliMantra).toEqual(['T', 'A'])
  })
  it('rifiuta un file sbagliato con messaggio chiaro', () => {
    const stats = new Uint8Array(readFileSync('tests/fixtures/statistiche.xlsx'))
    expect(() => parseListone(stats)).toThrow(/Quotazioni/)
  })
})
```

- [ ] **Step 2: Run** `npm test -- parseListone` → FAIL (modulo inesistente).

- [ ] **Step 3: Implementazione**

```ts
import * as XLSX from 'xlsx'
import type { Player, Role } from './types'

export function parseListone(data: ArrayBuffer | Uint8Array): Player[] {
  const wb = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets['Tutti']
  if (!sheet) throw new Error('Foglio "Tutti" non trovato: hai caricato il file Quotazioni di Fantacalcio.it?')
  // header alla riga 2 del foglio (riga 1 = titolo)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 1 })
  if (rows.length === 0 || !('Qt.A' in rows[0]) || !('FVM' in rows[0]))
    throw new Error('Colonne inattese: questo non sembra il file Quotazioni (serve Qt.A/FVM).')
  return rows
    .filter(r => r['Id'] != null && r['Nome'] != null)
    .map(r => ({
      id: Number(r['Id']),
      nome: String(r['Nome']),
      squadra: String(r['Squadra']),
      ruolo: String(r['R']) as Role,
      ruoliMantra: String(r['RM'] ?? '').split(';').filter(Boolean),
      qtA: Number(r['Qt.A']),
      qtI: Number(r['Qt.I']),
      fvm: Number(r['FVM']),
    }))
}
```

Nota: il file Statistiche ha anch'esso un foglio `Tutti` ma senza colonna `Qt.A` → il check colonne lo rifiuta (è ciò che verifica il terzo test).

- [ ] **Step 4: Run** `npm test -- parseListone` → PASS (3 test).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: parsing listone quotazioni da xlsx"`

---

### Task 4: Parsing statistiche + merge

**Files:**
- Create: `src/logic/parseStats.ts`
- Test: `tests/logic/parseStats.test.ts`

**Interfaces:**
- Consumes: `Player`, `PlayerStats` da types; fixture xlsx.
- Produces:
  - `parseStats(data: ArrayBuffer | Uint8Array): Map<number, PlayerStats>` — lancia `Error` se il file non è quello statistiche.
  - `mergeStats(players: Player[], stats: Map<number, PlayerStats>): Player[]` — ritorna NUOVI oggetti (no mutazione), ignora id non presenti nel listone.

- [ ] **Step 1: Test fallente**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'
import { parseStats, mergeStats } from '@/logic/parseStats'

const statsBuf = () => new Uint8Array(readFileSync('tests/fixtures/statistiche.xlsx'))
const quotBuf = () => new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx'))

describe('parseStats + mergeStats', () => {
  it('legge le statistiche per Id', () => {
    const stats = parseStats(statsBuf())
    expect(stats.get(4431)).toMatchObject({ pv: 37, fm: 5.58, gs: 35 })
  })
  it('rifiuta il file quotazioni', () => {
    expect(() => parseStats(quotBuf())).toThrow(/statistiche/i)
  })
  it('merge: copre tutto il listone e non muta gli input', () => {
    const players = parseListone(quotBuf())
    const merged = mergeStats(players, parseStats(statsBuf()))
    expect(merged.every(p => p.stats !== undefined)).toBe(true)
    expect(players[0].stats).toBeUndefined() // no mutazione
  })
})
```

- [ ] **Step 2: Run** `npm test -- parseStats` → FAIL.

- [ ] **Step 3: Implementazione**

```ts
import * as XLSX from 'xlsx'
import type { Player, PlayerStats } from './types'

export function parseStats(data: ArrayBuffer | Uint8Array): Map<number, PlayerStats> {
  const wb = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets['Tutti']
  if (!sheet) throw new Error('Foglio "Tutti" non trovato: hai caricato il file Statistiche di Fantacalcio.it?')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 1 })
  if (rows.length === 0 || !('Fm' in rows[0]) || !('Pv' in rows[0]))
    throw new Error('Colonne inattese: questo non sembra il file statistiche (serve Pv/Fm).')
  const out = new Map<number, PlayerStats>()
  for (const r of rows) {
    if (r['Id'] == null) continue
    out.set(Number(r['Id']), {
      pv: Number(r['Pv']), mv: Number(r['Mv']), fm: Number(r['Fm']),
      gf: Number(r['Gf']), gs: Number(r['Gs']), rp: Number(r['Rp']), rc: Number(r['Rc']),
      rPlus: Number(r['R+']), rMinus: Number(r['R-']), ass: Number(r['Ass']),
      amm: Number(r['Amm']), esp: Number(r['Esp']), au: Number(r['Au']),
    })
  }
  return out
}

export function mergeStats(players: Player[], stats: Map<number, PlayerStats>): Player[] {
  return players.map(p => stats.has(p.id) ? { ...p, stats: stats.get(p.id) } : { ...p })
}
```

- [ ] **Step 4: Run** `npm test -- parseStats` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: parsing statistiche e merge per Id"`

---

### Task 5: Fasce automatiche (tiering)

**Files:**
- Create: `src/logic/tiering.ts`
- Test: `tests/logic/tiering.test.ts`

**Interfaces:**
- Consumes: `Player`, `TierId`.
- Produces: `proposeTiers(players: Player[]): { tiers: Record<number, TierId>; review: number[] }` + costanti soglia esportate.

**Euristica (per ruolo, come da spec):** rank percentile FVM dentro il ruolo; poi:
- niente stats o `pv < PV_TITOLARE(=15)` → `scommessa` se FVM ≥ mediana ruolo o `diff = qtA−qtI ≥ DIFF_ASCESA(=8)`, altrimenti `riempitivo`
- `top`: fvmPct ≥ 0.95 e pv ≥ 25
- `semitop`: fvmPct ≥ 0.85
- `titolare`: pv ≥ 25 e fm ≥ FM_TITOLARE per ruolo (`{P:5.4, D:6.0, C:6.3, A:6.5}` — i P si valutano su fm da portiere)
- altrimenti `riempitivo`
- **review**: fvmPct entro ±0.03 da un taglio (0.95/0.85), oppure qtA ≥ 15 con pv < 15 (nome pesante senza storia).

- [ ] **Step 1: Test fallente**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'
import { parseStats, mergeStats } from '@/logic/parseStats'
import { proposeTiers } from '@/logic/tiering'

const players = mergeStats(
  parseListone(new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx'))),
  parseStats(new Uint8Array(readFileSync('tests/fixtures/statistiche.xlsx'))),
)

describe('proposeTiers', () => {
  const { tiers, review } = proposeTiers(players)
  it('assegna una fascia a ogni giocatore', () => {
    expect(Object.keys(tiers).length).toBe(players.length)
  })
  it('i big sono top', () => {
    expect(tiers[2764]).toBe('top') // Lautaro: FVM 315, titolare
  })
  it('senza statistiche con FVM alto -> scommessa', () => {
    const fake = players.map(p => p.id === 7126 ? { ...p, stats: undefined } : p)
    const t = proposeTiers(fake).tiers
    expect(t[7126]).toBe('scommessa') // Baturina, FVM 95
  })
  it('segnala casi da rivedere', () => {
    expect(review.length).toBeGreaterThan(0)
    expect(review.every(id => tiers[id] !== undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run** `npm test -- tiering` → FAIL.

- [ ] **Step 3: Implementazione**

```ts
import type { Player, Role, TierId } from './types'

// da calibrare
export const PV_TITOLARE = 15
export const PV_SOLIDO = 25
export const DIFF_ASCESA = 8
export const FVM_PCT_TOP = 0.95
export const FVM_PCT_SEMITOP = 0.85
export const REVIEW_BAND = 0.03
export const FM_TITOLARE: Record<Role, number> = { P: 5.4, D: 6.0, C: 6.3, A: 6.5 }

export function proposeTiers(players: Player[]): { tiers: Record<number, TierId>; review: number[] } {
  const tiers: Record<number, TierId> = {}
  const review: number[] = []
  const roles: Role[] = ['P', 'D', 'C', 'A']
  for (const role of roles) {
    const pool = players.filter(p => p.ruolo === role).sort((a, b) => a.fvm - b.fvm)
    const median = pool[Math.floor(pool.length / 2)]?.fvm ?? 0
    pool.forEach((p, i) => {
      const pct = pool.length > 1 ? i / (pool.length - 1) : 1
      const pv = p.stats?.pv ?? 0
      const fm = p.stats?.fm ?? 0
      let tier: TierId
      if (!p.stats || pv < PV_TITOLARE) {
        tier = (p.fvm >= median || p.qtA - p.qtI >= DIFF_ASCESA) ? 'scommessa' : 'riempitivo'
      } else if (pct >= FVM_PCT_TOP && pv >= PV_SOLIDO) {
        tier = 'top'
      } else if (pct >= FVM_PCT_SEMITOP) {
        tier = 'semitop'
      } else if (pv >= PV_SOLIDO && fm >= FM_TITOLARE[role]) {
        tier = 'titolare'
      } else {
        tier = 'riempitivo'
      }
      tiers[p.id] = tier
      const nearCut = Math.abs(pct - FVM_PCT_TOP) <= REVIEW_BAND || Math.abs(pct - FVM_PCT_SEMITOP) <= REVIEW_BAND
      const heavyNoHistory = p.qtA >= 15 && pv < PV_TITOLARE
      if (nearCut || heavyNoHistory) review.push(p.id)
    })
  }
  return { tiers, review }
}
```

- [ ] **Step 4: Run** `npm test -- tiering` → PASS. Se "i big sono top" fallisse perché Lautaro non supera il taglio percentile, ispezionare con un `console.log` il pct e correggere la SOGLIA (non il test) entro i valori spec.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: proposta fasce automatiche con flag da-rivedere"`

---

### Task 6: Previsione di spesa (pricing)

**Files:**
- Create: `src/logic/pricing.ts`
- Test: `tests/logic/pricing.test.ts`

**Interfaces:**
- Consumes: `Player`, `TierId`, `LeagueConfig`, `PriceRange`, `Role`.
- Produces: `predictPrices(players: Player[], tiers: Record<number, TierId>, league: LeagueConfig): Map<number, PriceRange>` — SOLO i giocatori nel pool acquistabile hanno un range; gli altri non sono nella mappa (UI mostra "1").

**Formula (da spec):** pool per ruolo = migliori `slots[r] × teams.length` per FVM. `roleBudget = totalCredits × (ΣFVM_pool_r × INFLATION[r]) / Σ_ruoli(ΣFVM_pool × INFLATION)`. `base = max(1, round(fvm/ΣFVM_pool_r × roleBudget × TIER_MULT[tier]))`. Range: ±15% (`SPREAD=0.15`), ±30% per `scommessa` (`SPREAD_SCOMMESSA=0.30`), min ≥ 1.

- [ ] **Step 1: Test fallente**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'
import { proposeTiers } from '@/logic/tiering'
import { predictPrices } from '@/logic/pricing'
import { DEFAULT_LEAGUE } from '@/logic/types'

const players = parseListone(new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx')))
const { tiers } = proposeTiers(players)
const prices = predictPrices(players, tiers, DEFAULT_LEAGUE)

describe('predictPrices', () => {
  it('dimensione pool = slot x squadre per ruolo', () => {
    const pooled = players.filter(p => prices.has(p.id))
    const att = pooled.filter(p => p.ruolo === 'A').length
    expect(att).toBe(6 * 8)
  })
  it('la somma dei prezzi base ~ crediti totali (entro 10%)', () => {
    const total = [...prices.values()].reduce((s, r) => s + r.base, 0)
    expect(total).toBeGreaterThan(4000 * 0.9)
    expect(total).toBeLessThan(4000 * 1.1)
  })
  it('range valido: 1 <= min <= base <= max', () => {
    for (const r of prices.values()) {
      expect(r.min).toBeGreaterThanOrEqual(1)
      expect(r.min).toBeLessThanOrEqual(r.base)
      expect(r.base).toBeLessThanOrEqual(r.max)
    }
  })
  it('il top attaccante costa piu del top portiere', () => {
    const best = (role: string) => Math.max(...players.filter(p => p.ruolo === role && prices.has(p.id)).map(p => prices.get(p.id)!.max))
    expect(best('A')).toBeGreaterThan(best('P'))
  })
})
```

- [ ] **Step 2: Run** `npm test -- pricing` → FAIL.

- [ ] **Step 3: Implementazione**

```ts
import type { LeagueConfig, Player, PriceRange, Role, TierId } from './types'

// da calibrare con i prezzi reali registrati durante le aste
export const ROLE_INFLATION: Record<Role, number> = { P: 0.9, D: 0.95, C: 1.0, A: 1.15 }
export const TIER_MULT: Record<TierId, number> = { top: 1.15, semitop: 1.05, scommessa: 1.0, titolare: 0.95, riempitivo: 1.0, skip: 1.0 }
export const SPREAD = 0.15
export const SPREAD_SCOMMESSA = 0.30

export function predictPrices(players: Player[], tiers: Record<number, TierId>, league: LeagueConfig): Map<number, PriceRange> {
  const roles: Role[] = ['P', 'D', 'C', 'A']
  const totalCredits = league.budget * league.teams.length
  const pools = new Map<Role, Player[]>()
  for (const role of roles) {
    const pool = players
      .filter(p => p.ruolo === role)
      .sort((a, b) => b.fvm - a.fvm)
      .slice(0, league.slots[role] * league.teams.length)
    pools.set(role, pool)
  }
  const weight = (role: Role) => (pools.get(role)!.reduce((s, p) => s + p.fvm, 0)) * ROLE_INFLATION[role]
  const totalWeight = roles.reduce((s, r) => s + weight(r), 0)
  const out = new Map<number, PriceRange>()
  for (const role of roles) {
    const pool = pools.get(role)!
    const sumFvm = pool.reduce((s, p) => s + p.fvm, 0)
    const roleBudget = totalCredits * weight(role) / totalWeight
    for (const p of pool) {
      const tier = tiers[p.id] ?? 'riempitivo'
      const base = Math.max(1, Math.round((p.fvm / sumFvm) * roleBudget * TIER_MULT[tier]))
      const spread = tier === 'scommessa' ? SPREAD_SCOMMESSA : SPREAD
      out.set(p.id, {
        base,
        min: Math.max(1, Math.floor(base * (1 - spread))),
        max: Math.max(1, Math.ceil(base * (1 + spread))),
      })
    }
  }
  return out
}
```

- [ ] **Step 4: Run** `npm test -- pricing` → PASS. (Il test di somma può scostarsi per i TIER_MULT: se esce dal ±10%, normalizzare i base per ruolo moltiplicando per `roleBudget / Σbase_ruolo` prima del range.)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: previsione di spesa a range con moltiplicatori dichiarati"`

---

### Task 7: Stato asta derivato (auction)

**Files:**
- Create: `src/logic/auction.ts`
- Test: `tests/logic/auction.test.ts`

**Interfaces:**
- Consumes: `Purchase`, `LeagueConfig`, `Player`, `Role`.
- Produces:

```ts
export interface TeamState {
  teamIndex: number
  name: string
  spent: number
  credits: number
  slotsLeft: Record<Role, number>
  totalSlotsLeft: number
  maxBid: number
  purchases: Purchase[]
}
export function deriveTeams(purchases: Purchase[], league: LeagueConfig, players: Player[]): TeamState[]
export function soldIds(purchases: Purchase[]): Set<number>
```

- [ ] **Step 1: Test fallente**

```ts
import { describe, it, expect } from 'vitest'
import { deriveTeams, soldIds } from '@/logic/auction'
import { DEFAULT_LEAGUE, type Player } from '@/logic/types'

const mk = (id: number, ruolo: Player['ruolo']): Player =>
  ({ id, nome: `G${id}`, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })
const players = [mk(1, 'A'), mk(2, 'A'), mk(3, 'P'), mk(4, 'D')]

describe('deriveTeams', () => {
  it('parte da budget pieno e slot pieni', () => {
    const t = deriveTeams([], DEFAULT_LEAGUE, players)
    expect(t).toHaveLength(8)
    expect(t[0]).toMatchObject({ credits: 500, totalSlotsLeft: 25, maxBid: 476 }) // 500-(25-1)
  })
  it('scala crediti e slot dopo gli acquisti', () => {
    const t = deriveTeams([
      { playerId: 1, teamIndex: 0, price: 200, seq: 1 },
      { playerId: 3, teamIndex: 0, price: 1, seq: 2 },
      { playerId: 2, teamIndex: 1, price: 50, seq: 3 },
    ], DEFAULT_LEAGUE, players)
    expect(t[0].credits).toBe(299)
    expect(t[0].slotsLeft.A).toBe(5)
    expect(t[0].slotsLeft.P).toBe(2)
    expect(t[0].maxBid).toBe(299 - (23 - 1))
    expect(t[1].credits).toBe(450)
  })
  it('maxBid mai negativo', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ playerId: 100 + i, teamIndex: 0, price: 20, seq: i }))
    const ps = many.map(x => mk(x.playerId, 'D'))
    const t = deriveTeams(many, DEFAULT_LEAGUE, ps)
    expect(t[0].maxBid).toBeGreaterThanOrEqual(0)
  })
  it('soldIds', () => {
    expect(soldIds([{ playerId: 7, teamIndex: 2, price: 3, seq: 1 }]).has(7)).toBe(true)
  })
})
```

- [ ] **Step 2: Run** `npm test -- auction` → FAIL.

- [ ] **Step 3: Implementazione**

```ts
import type { LeagueConfig, Player, Purchase, Role } from './types'

export interface TeamState {
  teamIndex: number
  name: string
  spent: number
  credits: number
  slotsLeft: Record<Role, number>
  totalSlotsLeft: number
  maxBid: number
  purchases: Purchase[]
}

export function soldIds(purchases: Purchase[]): Set<number> {
  return new Set(purchases.map(p => p.playerId))
}

export function deriveTeams(purchases: Purchase[], league: LeagueConfig, players: Player[]): TeamState[] {
  const byId = new Map(players.map(p => [p.id, p]))
  return league.teams.map((name, teamIndex) => {
    const mine = purchases.filter(p => p.teamIndex === teamIndex).sort((a, b) => a.seq - b.seq)
    const spent = mine.reduce((s, p) => s + p.price, 0)
    const slotsLeft: Record<Role, number> = { ...league.slots }
    for (const pu of mine) {
      const role = byId.get(pu.playerId)?.ruolo
      if (role && slotsLeft[role] > 0) slotsLeft[role] -= 1
    }
    const totalSlotsLeft = (Object.values(slotsLeft) as number[]).reduce((a, b) => a + b, 0)
    const credits = league.budget - spent
    const maxBid = Math.max(0, totalSlotsLeft === 0 ? 0 : credits - (totalSlotsLeft - 1))
    return { teamIndex, name, spent, credits, slotsLeft, totalSlotsLeft, maxBid, purchases: mine }
  })
}
```

- [ ] **Step 4: Run** `npm test -- auction` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: stato asta derivato (crediti, slot, max rilancio)"`

---

### Task 8: Profili strategia avversari

**Files:**
- Create: `src/logic/profiles.ts`
- Test: `tests/logic/profiles.test.ts`

**Interfaces:**
- Consumes: `TeamState` da `@/logic/auction`; `Player`, `TierId`, `PriceRange`, `LeagueConfig`.
- Produces:

```ts
export interface TeamProfile {
  teamIndex: number
  roleSpendPct: Record<Role, number>   // 0..1 sulla spesa totale (0 se nessuna spesa)
  bigClubPct: number                    // 0..1 sugli acquisti
  tierCounts: Record<TierId, number>
  avgPriceDeltaPct: number | null       // scostamento medio % dal base previsto; null se nessun prezzo previsto
  traits: string[]                      // frasi in italiano, es. "70% del budget sull'attacco"
}
export function profileTeam(team: TeamState, players: Player[], tiers: Record<number, TierId>, prices: Map<number, PriceRange>, league: LeagueConfig): TeamProfile
```

**Soglie traits (da calibrare, esportate):** `TRAIT_ROLE_PCT=0.5` ("punta su <ruolo>" se un ruolo > 50% spesa), `TRAIT_BIG_PCT=0.75` ("compra solo dalle big"), `TRAIT_SCOMMESSA_PCT=0.5` ("accumula scommesse"), `TRAIT_OVERPAY=0.15` ("strapaga (+15%)") / `-0.15` ("risparmia"). Trait ruolo low-cost: per ogni ruolo con ≥2 acquisti tutti a prezzo ≤ 5 → "<ruolo> low cost".

- [ ] **Step 1: Test fallente** (scenari "Amici"):

```ts
import { describe, it, expect } from 'vitest'
import { deriveTeams } from '@/logic/auction'
import { profileTeam } from '@/logic/profiles'
import { DEFAULT_LEAGUE, type Player, type TierId, type PriceRange } from '@/logic/types'

const mk = (id: number, ruolo: Player['ruolo'], squadra: string): Player =>
  ({ id, nome: `G${id}`, squadra, ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })
const players = [mk(1, 'A', 'Inter'), mk(2, 'A', 'Juventus'), mk(3, 'C', 'Lecce'), mk(4, 'P', 'Verona'), mk(5, 'D', 'Inter')]
const tiers: Record<number, TierId> = { 1: 'top', 2: 'semitop', 3: 'scommessa', 4: 'riempitivo', 5: 'titolare' }
const prices = new Map<number, PriceRange>([[1, { base: 100, min: 85, max: 115 }], [2, { base: 50, min: 43, max: 58 }]])

describe('profileTeam', () => {
  it('Amico 4: tutto sull attacco', () => {
    const teams = deriveTeams([
      { playerId: 1, teamIndex: 1, price: 200, seq: 1 },
      { playerId: 2, teamIndex: 1, price: 100, seq: 2 },
      { playerId: 4, teamIndex: 1, price: 1, seq: 3 },
    ], DEFAULT_LEAGUE, players)
    const prof = profileTeam(teams[1], players, tiers, prices, DEFAULT_LEAGUE)
    expect(prof.roleSpendPct.A).toBeGreaterThan(0.9)
    expect(prof.traits.join(' ')).toMatch(/attacco/i)
  })
  it('Amico 1: compra solo dalle big', () => {
    const teams = deriveTeams([
      { playerId: 1, teamIndex: 2, price: 90, seq: 1 },
      { playerId: 5, teamIndex: 2, price: 30, seq: 2 },
    ], DEFAULT_LEAGUE, players)
    const prof = profileTeam(teams[2], players, tiers, prices, DEFAULT_LEAGUE)
    expect(prof.bigClubPct).toBe(1)
  })
  it('strapaga: delta positivo', () => {
    const teams = deriveTeams([{ playerId: 1, teamIndex: 3, price: 130, seq: 1 }], DEFAULT_LEAGUE, players)
    const prof = profileTeam(teams[3], players, tiers, prices, DEFAULT_LEAGUE)
    expect(prof.avgPriceDeltaPct).toBeGreaterThan(0.25)
  })
  it('squadra senza acquisti: profilo neutro', () => {
    const teams = deriveTeams([], DEFAULT_LEAGUE, players)
    const prof = profileTeam(teams[0], players, tiers, prices, DEFAULT_LEAGUE)
    expect(prof.avgPriceDeltaPct).toBeNull()
    expect(prof.traits).toEqual([])
  })
})
```

- [ ] **Step 2: Run** `npm test -- profiles` → FAIL.

- [ ] **Step 3: Implementazione**

```ts
import type { LeagueConfig, Player, PriceRange, Role, TierId } from './types'
import type { TeamState } from './auction'

// da calibrare
export const TRAIT_ROLE_PCT = 0.5
export const TRAIT_BIG_PCT = 0.75
export const TRAIT_SCOMMESSA_PCT = 0.5
export const TRAIT_OVERPAY = 0.15
export const LOWCOST_PRICE = 5

const ROLE_NAMES: Record<Role, string> = { P: 'porta', D: 'difesa', C: 'centrocampo', A: 'attacco' }

export interface TeamProfile {
  teamIndex: number
  roleSpendPct: Record<Role, number>
  bigClubPct: number
  tierCounts: Record<TierId, number>
  avgPriceDeltaPct: number | null
  traits: string[]
}

export function profileTeam(
  team: TeamState, players: Player[], tiers: Record<number, TierId>,
  prices: Map<number, PriceRange>, league: LeagueConfig,
): TeamProfile {
  const byId = new Map(players.map(p => [p.id, p]))
  const roleSpend: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 }
  const rolePrices: Record<Role, number[]> = { P: [], D: [], C: [], A: [] }
  const tierCounts: Record<TierId, number> = { top: 0, semitop: 0, scommessa: 0, titolare: 0, riempitivo: 0, skip: 0 }
  let big = 0
  const deltas: number[] = []
  for (const pu of team.purchases) {
    const pl = byId.get(pu.playerId)
    if (!pl) continue
    roleSpend[pl.ruolo] += pu.price
    rolePrices[pl.ruolo].push(pu.price)
    tierCounts[tiers[pu.playerId] ?? 'riempitivo'] += 1
    if (league.bigClubs.includes(pl.squadra)) big += 1
    const pred = prices.get(pu.playerId)
    if (pred) deltas.push((pu.price - pred.base) / pred.base)
  }
  const n = team.purchases.length
  const roleSpendPct: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 }
  for (const r of ['P', 'D', 'C', 'A'] as Role[]) roleSpendPct[r] = team.spent > 0 ? roleSpend[r] / team.spent : 0
  const bigClubPct = n > 0 ? big / n : 0
  const avgPriceDeltaPct = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null

  const traits: string[] = []
  if (n >= 2) {
    for (const r of ['P', 'D', 'C', 'A'] as Role[]) {
      if (roleSpendPct[r] > TRAIT_ROLE_PCT)
        traits.push(`${Math.round(roleSpendPct[r] * 100)}% del budget su ${ROLE_NAMES[r]}`)
      if (rolePrices[r].length >= 2 && rolePrices[r].every(x => x <= LOWCOST_PRICE))
        traits.push(`${ROLE_NAMES[r]} low cost`)
    }
    if (bigClubPct >= TRAIT_BIG_PCT) traits.push('compra quasi solo dalle big')
    if (tierCounts.scommessa / n >= TRAIT_SCOMMESSA_PCT) traits.push('accumula scommesse')
    if (avgPriceDeltaPct !== null && avgPriceDeltaPct >= TRAIT_OVERPAY)
      traits.push(`strapaga (+${Math.round(avgPriceDeltaPct * 100)}% sul previsto)`)
    if (avgPriceDeltaPct !== null && avgPriceDeltaPct <= -TRAIT_OVERPAY)
      traits.push(`risparmia (${Math.round(avgPriceDeltaPct * 100)}% sul previsto)`)
  }
  return { teamIndex: team.teamIndex, roleSpendPct, bigClubPct, tierCounts, avgPriceDeltaPct, traits }
}
```

Nota: il test "Amico 4" ha 3 acquisti (n≥2) → il trait ruolo scatta. Il test "strapaga" ha n=1 → nessun trait, ma `avgPriceDeltaPct` è comunque calcolato: il test verifica solo il delta.

- [ ] **Step 4: Run** `npm test -- profiles` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: profili strategia avversari con traits in italiano"`

---

### Task 9: Advisor (contesa, timing, scarsità)

**Files:**
- Create: `src/logic/advisor.ts`
- Test: `tests/logic/advisor.test.ts`

**Interfaces:**
- Consumes: `TeamState`, `TeamProfile`, tipi base.
- Produces:

```ts
export interface TargetAdvice {
  playerId: number
  rivals: { teamIndex: number; reason: string }[]  // chi può ancora contenderlo e perché
  level: 'bassa' | 'media' | 'alta'                 // 0 rivali / 1-2 / 3+
  callNow: boolean                                  // level bassa o media
  why: string                                       // spiegazione leggibile
}
export function adviseTargets(state: {
  targets: number[]; purchases: Purchase[]; players: Player[]
  tiers: Record<number, TierId>; prices: Map<number, PriceRange>
  league: LeagueConfig; teams: TeamState[]; profiles: TeamProfile[]
}): TargetAdvice[]

export interface ScarcityAlert { role: Role; tier: TierId; remaining: number; myMissing: number; message: string }
export function scarcityAlerts(state: {
  purchases: Purchase[]; players: Player[]; tiers: Record<number, TierId>
  league: LeagueConfig; teams: TeamState[]
}): ScarcityAlert[]
```

**Euristica rivali** — un avversario è rivale su un target se TUTTE:
1. `slotsLeft[ruolo] > 0`
2. `maxBid >= prices.get(id).min` (se il prezzo non è previsto: `maxBid >= 2`)
3. profilo compatibile: se `bigClubPct >= TRAIT_BIG_PCT` (con ≥3 acquisti) e il target NON è di una big → non rivale; se ha un trait "<ruolo> low cost" e il target di quel ruolo ha `min > LOWCOST_PRICE` → non rivale.

**Scarsità**: per ogni ruolo dove mi mancano slot, conta gli invenduti per fascia (solo top/semitop/titolare); alert se `remaining <= myMissing + SCARCITY_MARGIN (=2)`.

- [ ] **Step 1: Test fallente**

```ts
import { describe, it, expect } from 'vitest'
import { deriveTeams } from '@/logic/auction'
import { profileTeam } from '@/logic/profiles'
import { adviseTargets, scarcityAlerts } from '@/logic/advisor'
import { DEFAULT_LEAGUE, type Player, type PriceRange, type TierId } from '@/logic/types'

const mk = (id: number, ruolo: Player['ruolo'], squadra = 'Inter'): Player =>
  ({ id, nome: `G${id}`, squadra, ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })

function setup(purchases: Parameters<typeof deriveTeams>[0], players: Player[], tiers: Record<number, TierId>, prices: Map<number, PriceRange>) {
  const teams = deriveTeams(purchases, DEFAULT_LEAGUE, players)
  const profiles = teams.map(t => profileTeam(t, players, tiers, prices, DEFAULT_LEAGUE))
  return { purchases, players, tiers, prices, league: DEFAULT_LEAGUE, teams, profiles }
}

describe('adviseTargets', () => {
  it('rivale senza crediti non conta -> chiama ora', () => {
    const players = [mk(1, 'A'), ...Array.from({ length: 24 }, (_, i) => mk(100 + i, 'D'))]
    const tiers: Record<number, TierId> = { 1: 'top' }
    const prices = new Map<number, PriceRange>([[1, { base: 100, min: 85, max: 115 }]])
    // le squadre 1..7 hanno speso quasi tutto
    const purchases = Array.from({ length: 7 }, (_, t) => ({ playerId: 100 + t, teamIndex: t + 1, price: 480, seq: t + 1 }))
    const s = setup(purchases, players, tiers, prices)
    const advice = adviseTargets({ ...s, targets: [1] })
    expect(advice[0].rivals).toHaveLength(0)
    expect(advice[0].level).toBe('bassa')
    expect(advice[0].callNow).toBe(true)
  })
  it('molti rivali con crediti -> aspetta', () => {
    const players = [mk(1, 'A')]
    const tiers: Record<number, TierId> = { 1: 'top' }
    const prices = new Map<number, PriceRange>([[1, { base: 100, min: 85, max: 115 }]])
    const s = setup([], players, tiers, prices)
    const advice = adviseTargets({ ...s, targets: [1] })
    expect(advice[0].level).toBe('alta')
    expect(advice[0].callNow).toBe(false)
    expect(advice[0].rivals.length).toBe(7)
  })
  it('target gia venduto sparisce dai consigli', () => {
    const players = [mk(1, 'A')]
    const tiers: Record<number, TierId> = { 1: 'top' }
    const prices = new Map<number, PriceRange>()
    const s = setup([{ playerId: 1, teamIndex: 2, price: 50, seq: 1 }], players, tiers, prices)
    expect(adviseTargets({ ...s, targets: [1] })).toHaveLength(0)
  })
})

describe('scarcityAlerts', () => {
  it('avvisa quando i titolari invenduti bastano appena', () => {
    const players = Array.from({ length: 5 }, (_, i) => mk(i + 1, 'D'))
    const tiers: Record<number, TierId> = { 1: 'titolare', 2: 'titolare', 3: 'titolare', 4: 'riempitivo', 5: 'riempitivo' }
    const s = setup([], players, tiers, new Map())
    const alerts = scarcityAlerts(s)
    const d = alerts.find(a => a.role === 'D' && a.tier === 'titolare')
    expect(d).toBeDefined()
    expect(d!.remaining).toBe(3)
    expect(d!.myMissing).toBe(8)
  })
})
```

- [ ] **Step 2: Run** `npm test -- advisor` → FAIL.

- [ ] **Step 3: Implementazione**

```ts
import type { LeagueConfig, Player, PriceRange, Purchase, Role, TierId } from './types'
import { soldIds, type TeamState } from './auction'
import { LOWCOST_PRICE, TRAIT_BIG_PCT, type TeamProfile } from './profiles'

// da calibrare
export const SCARCITY_MARGIN = 2
export const PROFILE_MIN_PURCHASES = 3
const ROLE_NAMES: Record<Role, string> = { P: 'porta', D: 'difesa', C: 'centrocampo', A: 'attacco' }

export interface TargetAdvice {
  playerId: number
  rivals: { teamIndex: number; reason: string }[]
  level: 'bassa' | 'media' | 'alta'
  callNow: boolean
  why: string
}

export function adviseTargets(state: {
  targets: number[]; purchases: Purchase[]; players: Player[]
  tiers: Record<number, TierId>; prices: Map<number, PriceRange>
  league: LeagueConfig; teams: TeamState[]; profiles: TeamProfile[]
}): TargetAdvice[] {
  const { targets, purchases, players, prices, league, teams, profiles } = state
  const sold = soldIds(purchases)
  const byId = new Map(players.map(p => [p.id, p]))
  const out: TargetAdvice[] = []
  for (const id of targets) {
    if (sold.has(id)) continue
    const pl = byId.get(id)
    if (!pl) continue
    const minPrice = prices.get(id)?.min ?? 2
    const rivals: { teamIndex: number; reason: string }[] = []
    for (const t of teams) {
      if (t.teamIndex === league.myTeamIndex) continue
      if (t.slotsLeft[pl.ruolo] <= 0) continue
      if (t.maxBid < minPrice) continue
      const prof = profiles[t.teamIndex]
      const n = t.purchases.length
      if (n >= PROFILE_MIN_PURCHASES) {
        if (prof.bigClubPct >= TRAIT_BIG_PCT && !league.bigClubs.includes(pl.squadra)) continue
        const lowcost = prof.traits.some(tr => tr === `${ROLE_NAMES[pl.ruolo]} low cost`)
        if (lowcost && minPrice > LOWCOST_PRICE) continue
      }
      rivals.push({ teamIndex: t.teamIndex, reason: `${t.name}: ${t.slotsLeft[pl.ruolo]} slot ${pl.ruolo}, max rilancio ${t.maxBid}` })
    }
    const level = rivals.length === 0 ? 'bassa' : rivals.length <= 2 ? 'media' : 'alta'
    const callNow = level !== 'alta'
    const why = rivals.length === 0
      ? 'nessun avversario può più contenderlo: chiamalo ora'
      : callNow
        ? `solo ${rivals.length} rivali possibili: buon momento per chiamarlo`
        : `${rivals.length} avversari con slot e crediti: aspetta che si riempiano`
    out.push({ playerId: id, rivals, level, callNow, why })
  }
  return out
}

export interface ScarcityAlert { role: Role; tier: TierId; remaining: number; myMissing: number; message: string }

export function scarcityAlerts(state: {
  purchases: Purchase[]; players: Player[]; tiers: Record<number, TierId>
  league: LeagueConfig; teams: TeamState[]
}): ScarcityAlert[] {
  const { purchases, players, tiers, league, teams } = state
  const sold = soldIds(purchases)
  const me = teams[league.myTeamIndex]
  const out: ScarcityAlert[] = []
  const watched: TierId[] = ['top', 'semitop', 'titolare']
  for (const role of ['P', 'D', 'C', 'A'] as Role[]) {
    const myMissing = me.slotsLeft[role]
    if (myMissing <= 0) continue
    for (const tier of watched) {
      const remaining = players.filter(p => p.ruolo === role && !sold.has(p.id) && tiers[p.id] === tier).length
      if (remaining <= myMissing + SCARCITY_MARGIN) {
        out.push({
          role, tier, remaining, myMissing,
          message: `Restano ${remaining} "${tier}" in ${ROLE_NAMES[role]} e a te mancano ${myMissing} ${ROLE_NAMES[role].slice(0, 3)}: valuta di muoverti`,
        })
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run** `npm test -- advisor` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: advisor contesa target e allarmi scarsita"`

---

### Task 10: Storage e reducer

**Files:**
- Create: `src/logic/storage.ts`, `src/state/reducer.ts`
- Test: `tests/logic/storage.test.ts`, `tests/logic/reducer.test.ts`

**Interfaces:**
- Consumes: `AppState`, `DEFAULT_LEAGUE`, tipi base.
- Produces:

```ts
// storage.ts
export const STORAGE_KEY = 'fanta-asta-state'
export const SCHEMA_VERSION = 1
export function initialState(): AppState
export function saveState(s: AppState, store?: Pick<Storage,'setItem'>): void
export function loadState(store?: Pick<Storage,'getItem'>): AppState | null  // null se assente/corrotto/versione ignota
export function exportJson(s: AppState): string
export function importJson(text: string): AppState                            // throw se invalido

// reducer.ts
export type Action =
  | { type: 'importListone'; players: Player[] }        // riaggancia tiers/targets per Id, popola review
  | { type: 'importStats'; stats: Map<number, PlayerStats> }
  | { type: 'setLeague'; league: LeagueConfig }
  | { type: 'setTier'; playerId: number; tier: TierId }  // toglie anche il flag review
  | { type: 'toggleTarget'; playerId: number }
  | { type: 'setRolePlan'; plan: Record<Role, number> }
  | { type: 'addPurchase'; playerId: number; teamIndex: number; price: number }
  | { type: 'editPurchase'; seq: number; price: number; teamIndex: number }
  | { type: 'removePurchase'; seq: number }
  | { type: 'setTeamNote'; teamIndex: number; note: string }
  | { type: 'replaceState'; state: AppState }            // per importJson
export function reducer(state: AppState, action: Action): AppState
```

- [ ] **Step 1: Test fallente**

```ts
// tests/logic/storage.test.ts
import { describe, it, expect } from 'vitest'
import { initialState, saveState, loadState, exportJson, importJson, STORAGE_KEY } from '@/logic/storage'

const memStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v) }
}

describe('storage', () => {
  it('round-trip su store', () => {
    const store = memStore()
    const s = initialState()
    s.league.budget = 650
    saveState(s, store)
    expect(loadState(store)!.league.budget).toBe(650)
  })
  it('corrotto -> null', () => {
    const store = memStore()
    store.setItem(STORAGE_KEY, '{non-json')
    expect(loadState(store)).toBeNull()
  })
  it('export/import JSON round-trip', () => {
    const s = initialState()
    s.targets = [42]
    expect(importJson(exportJson(s)).targets).toEqual([42])
  })
  it('import invalido -> throw', () => {
    expect(() => importJson('{"pippo":1}')).toThrow()
  })
})
```

```ts
// tests/logic/reducer.test.ts
import { describe, it, expect } from 'vitest'
import { reducer } from '@/state/reducer'
import { initialState } from '@/logic/storage'
import type { Player } from '@/logic/types'

const mk = (id: number): Player => ({ id, nome: `G${id}`, squadra: 'Inter', ruolo: 'A', ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })

describe('reducer', () => {
  it('importListone conserva fasce esistenti per Id e mette i nuovi in review', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(2)] })
    s = reducer(s, { type: 'setTier', playerId: 1, tier: 'top' })
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(3)] })
    expect(s.tiers[1]).toBe('top')
    expect(s.review).toContain(3)
  })
  it('addPurchase assegna seq crescente; removePurchase toglie', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(2)] })
    s = reducer(s, { type: 'addPurchase', playerId: 1, teamIndex: 0, price: 10 })
    s = reducer(s, { type: 'addPurchase', playerId: 2, teamIndex: 1, price: 20 })
    expect(s.purchases.map(p => p.seq)).toEqual([1, 2])
    s = reducer(s, { type: 'removePurchase', seq: 1 })
    expect(s.purchases).toHaveLength(1)
    expect(s.purchases[0].playerId).toBe(2)
  })
  it('setTier toglie il flag review', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(9)] })
    expect(s.review).toContain(9)
    s = reducer(s, { type: 'setTier', playerId: 9, tier: 'scommessa' })
    expect(s.review).not.toContain(9)
  })
})
```

- [ ] **Step 2: Run** `npm test -- storage reducer` → FAIL.

- [ ] **Step 3: Implementazione**

```ts
// src/logic/storage.ts
import { DEFAULT_LEAGUE, type AppState } from './types'

export const STORAGE_KEY = 'fanta-asta-state'
export const SCHEMA_VERSION = 1

export function initialState(): AppState {
  return {
    version: SCHEMA_VERSION,
    players: [],
    league: structuredClone(DEFAULT_LEAGUE),
    tiers: {},
    review: [],
    targets: [],
    rolePlan: { P: 0, D: 0, C: 0, A: 0 },
    purchases: [],
    teamNotes: {},
  }
}

function isValid(s: unknown): s is AppState {
  if (typeof s !== 'object' || s === null) return false
  const o = s as Record<string, unknown>
  return o.version === SCHEMA_VERSION && Array.isArray(o.players) && Array.isArray(o.purchases)
    && typeof o.league === 'object' && o.league !== null
}

export function saveState(s: AppState, store: Pick<Storage, 'setItem'> = localStorage): void {
  store.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function loadState(store: Pick<Storage, 'getItem'> = localStorage): AppState | null {
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function exportJson(s: AppState): string {
  return JSON.stringify(s, null, 2)
}

export function importJson(text: string): AppState {
  const parsed = JSON.parse(text)
  if (!isValid(parsed)) throw new Error('File di backup non riconosciuto (versione o struttura sbagliata).')
  return parsed
}
```

```ts
// src/state/reducer.ts
import type { AppState, LeagueConfig, Player, PlayerStats, Role, TierId } from '@/logic/types'
import { proposeTiers } from '@/logic/tiering'
import { mergeStats } from '@/logic/parseStats'

export type Action =
  | { type: 'importListone'; players: Player[] }
  | { type: 'importStats'; stats: Map<number, PlayerStats> }
  | { type: 'setLeague'; league: LeagueConfig }
  | { type: 'setTier'; playerId: number; tier: TierId }
  | { type: 'toggleTarget'; playerId: number }
  | { type: 'setRolePlan'; plan: Record<Role, number> }
  | { type: 'addPurchase'; playerId: number; teamIndex: number; price: number }
  | { type: 'editPurchase'; seq: number; price: number; teamIndex: number }
  | { type: 'removePurchase'; seq: number }
  | { type: 'setTeamNote'; teamIndex: number; note: string }
  | { type: 'replaceState'; state: AppState }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'importListone': {
      const proposed = proposeTiers(action.players)
      const tiers: Record<number, TierId> = {}
      const review: number[] = []
      for (const p of action.players) {
        if (state.tiers[p.id] !== undefined) {
          tiers[p.id] = state.tiers[p.id] // fascia già decisa: si riaggancia per Id
        } else {
          tiers[p.id] = proposed.tiers[p.id]
          review.push(p.id) // nuovo giocatore: da rivedere
        }
      }
      const ids = new Set(action.players.map(p => p.id))
      return {
        ...state,
        players: action.players,
        tiers,
        review,
        targets: state.targets.filter(id => ids.has(id)),
      }
    }
    case 'importStats':
      return { ...state, players: mergeStats(state.players, action.stats) }
    case 'setLeague':
      return { ...state, league: action.league }
    case 'setTier':
      return {
        ...state,
        tiers: { ...state.tiers, [action.playerId]: action.tier },
        review: state.review.filter(id => id !== action.playerId),
      }
    case 'toggleTarget':
      return {
        ...state,
        targets: state.targets.includes(action.playerId)
          ? state.targets.filter(id => id !== action.playerId)
          : [...state.targets, action.playerId],
      }
    case 'setRolePlan':
      return { ...state, rolePlan: action.plan }
    case 'addPurchase': {
      const seq = state.purchases.reduce((m, p) => Math.max(m, p.seq), 0) + 1
      return { ...state, purchases: [...state.purchases, { playerId: action.playerId, teamIndex: action.teamIndex, price: action.price, seq }] }
    }
    case 'editPurchase':
      return {
        ...state,
        purchases: state.purchases.map(p => p.seq === action.seq ? { ...p, price: action.price, teamIndex: action.teamIndex } : p),
      }
    case 'removePurchase':
      return { ...state, purchases: state.purchases.filter(p => p.seq !== action.seq) }
    case 'setTeamNote':
      return { ...state, teamNotes: { ...state.teamNotes, [action.teamIndex]: action.note } }
    case 'replaceState':
      return action.state
  }
}
```

- [ ] **Step 4: Run** `npm test -- storage reducer` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: storage versionato e reducer con re-import per Id"`

---

### Task 11: UI — shell App + SetupTab

**Files:**
- Create/Modify: `src/ui/App.tsx` (sostituisce il placeholder), `src/ui/SetupTab.tsx`, `src/ui/styles.css`, `src/main.tsx`
- Test: `tests/ui/setup.test.tsx`

**Interfaces:**
- Consumes: `reducer`, `initialState/loadState/saveState/exportJson/importJson`, `parseListone`, `parseStats`.
- Produces: contesto `AppCtx = createContext<{ state: AppState; dispatch: Dispatch<Action> }>` esportato da `App.tsx` e usato da StudioTab/AstaTab.

- [ ] **Step 1: Test fallente (smoke)**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/ui/App'

describe('App shell', () => {
  it('mostra i 3 tab e parte dal Setup', async () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Studio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Asta' })).toBeInTheDocument()
    expect(screen.getByText(/listone/i)).toBeInTheDocument()
  })
  it('config lega: modifica budget', async () => {
    render(<App />)
    const input = screen.getByLabelText('Budget')
    await userEvent.clear(input)
    await userEvent.type(input, '650')
    expect((input as HTMLInputElement).value).toBe('650')
  })
})
```

- [ ] **Step 2: Run** `npm test -- tests/ui/setup` → FAIL.

- [ ] **Step 3: Implementazione**

`src/ui/App.tsx`:

```tsx
import { createContext, useEffect, useReducer, useState, type Dispatch } from 'react'
import { reducer, type Action } from '@/state/reducer'
import { initialState, loadState, saveState } from '@/logic/storage'
import type { AppState } from '@/logic/types'
import SetupTab from './SetupTab'
import StudioTab from './StudioTab'
import AstaTab from './AstaTab'
import './styles.css'

export const AppCtx = createContext<{ state: AppState; dispatch: Dispatch<Action> }>(null!)

type Tab = 'setup' | 'studio' | 'asta'

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? initialState())
  const [tab, setTab] = useState<Tab>('setup')
  useEffect(() => { saveState(state) }, [state])
  return (
    <AppCtx.Provider value={{ state, dispatch }}>
      <header className="topbar">
        <h1>Fanta Asta</h1>
        <nav>
          {(['setup', 'studio', 'asta'] as Tab[]).map(t => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'setup' ? 'Setup' : t === 'studio' ? 'Studio' : 'Asta'}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'setup' && <SetupTab />}
      {tab === 'studio' && <StudioTab />}
      {tab === 'asta' && <AstaTab />}
    </AppCtx.Provider>
  )
}
```

Nota: nei test jsdom `localStorage` esiste; `loadState()` senza dati salvati torna `null` → `initialState()`.

`src/ui/SetupTab.tsx` (import file + config lega + backup):

```tsx
import { useContext, useRef, useState } from 'react'
import { AppCtx } from './App'
import { parseListone } from '@/logic/parseListone'
import { parseStats } from '@/logic/parseStats'
import { exportJson, importJson } from '@/logic/storage'
import { DEFAULT_LEAGUE, type Role } from '@/logic/types'

async function readFile(f: File): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer())
}

export default function SetupTab() {
  const { state, dispatch } = useContext(AppCtx)
  const [error, setError] = useState('')
  const jsonInput = useRef<HTMLInputElement>(null)

  const onListone = async (f: File | undefined) => {
    if (!f) return
    try { dispatch({ type: 'importListone', players: parseListone(await readFile(f)) }); setError('') }
    catch (e) { setError((e as Error).message) }
  }
  const onStats = async (f: File | undefined) => {
    if (!f) return
    try { dispatch({ type: 'importStats', stats: parseStats(await readFile(f)) }); setError('') }
    catch (e) { setError((e as Error).message) }
  }
  const setLeague = (patch: Partial<typeof state.league>) =>
    dispatch({ type: 'setLeague', league: { ...state.league, ...patch } })

  const withStats = state.players.filter(p => p.stats).length
  return (
    <main className="setup">
      {error && <p className="error" role="alert">{error}</p>}
      <section>
        <h2>1. Listone quotazioni</h2>
        <input type="file" accept=".xlsx" aria-label="File listone" onChange={e => onListone(e.target.files?.[0])} />
        <p>{state.players.length > 0 ? `${state.players.length} giocatori caricati` : 'Carica il file Quotazioni di Fantacalcio.it (obbligatorio)'}</p>
        <h2>2. Statistiche stagione precedente (opzionale)</h2>
        <input type="file" accept=".xlsx" aria-label="File statistiche" onChange={e => onStats(e.target.files?.[0])} />
        <p>{withStats > 0 ? `Statistiche per ${withStats} giocatori` : 'Migliora fasce e previsioni'}</p>
      </section>
      <section>
        <h2>Lega</h2>
        <label>Budget <input type="number" aria-label="Budget" value={state.league.budget}
          onChange={e => setLeague({ budget: Number(e.target.value) })} /></label>
        {(['P', 'D', 'C', 'A'] as Role[]).map(r => (
          <label key={r}>Slot {r} <input type="number" value={state.league.slots[r]}
            onChange={e => setLeague({ slots: { ...state.league.slots, [r]: Number(e.target.value) } })} /></label>
        ))}
        <h3>Squadre</h3>
        {state.league.teams.map((name, i) => (
          <div key={i}>
            <input value={name} aria-label={`Nome squadra ${i + 1}`}
              onChange={e => setLeague({ teams: state.league.teams.map((n, j) => j === i ? e.target.value : n) })} />
            <label><input type="radio" name="me" checked={state.league.myTeamIndex === i}
              onChange={() => setLeague({ myTeamIndex: i })} /> io</label>
          </div>
        ))}
        <button onClick={() => setLeague({ teams: [...state.league.teams, `Squadra ${state.league.teams.length + 1}`] })}>+ squadra</button>
        <button disabled={state.league.teams.length <= 2}
          onClick={() => setLeague({ teams: state.league.teams.slice(0, -1), myTeamIndex: Math.min(state.league.myTeamIndex, state.league.teams.length - 2) })}>− squadra</button>
        <button onClick={() => setLeague(structuredClone(DEFAULT_LEAGUE))}>Ripristina default</button>
      </section>
      <section>
        <h2>Backup</h2>
        <button onClick={() => {
          const blob = new Blob([exportJson(state)], { type: 'application/json' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `fanta-asta-${new Date().toISOString().slice(0, 10)}.json`
          a.click()
          URL.revokeObjectURL(a.href)
        }}>Esporta JSON</button>
        <input ref={jsonInput} type="file" accept=".json" style={{ display: 'none' }} onChange={async e => {
          const f = e.target.files?.[0]
          if (!f) return
          try { dispatch({ type: 'replaceState', state: importJson(await f.text()) }); setError('') }
          catch (err) { setError((err as Error).message) }
        }} />
        <button onClick={() => jsonInput.current?.click()}>Importa JSON</button>
      </section>
    </main>
  )
}
```

`src/ui/styles.css` (base, poi si rifinisce):

```css
:root { font-family: system-ui, sans-serif; color-scheme: light dark; }
body { margin: 0; }
.topbar { display: flex; gap: 1rem; align-items: center; padding: .5rem 1rem; border-bottom: 1px solid #8884; }
.topbar h1 { font-size: 1.1rem; margin: 0; }
.topbar button { margin-right: .5rem; }
.topbar button.active { font-weight: bold; text-decoration: underline; }
main { padding: 1rem; }
.error { color: #c00; font-weight: bold; }
table { border-collapse: collapse; }
th, td { padding: .25rem .5rem; border-bottom: 1px solid #8883; text-align: left; }
.tierboard { display: grid; grid-auto-flow: column; gap: .5rem; align-items: start; }
.tiercol { background: #8881; border-radius: 8px; padding: .5rem; min-width: 11rem; min-height: 8rem; }
.card { background: #fff2; border: 1px solid #8884; border-radius: 6px; padding: .25rem .5rem; margin: .25rem 0; cursor: grab; }
.dashboard tr.me { font-weight: bold; }
.advice-bassa { color: #2a2; } .advice-media { color: #a80; } .advice-alta { color: #c33; }
```

Creare inoltre `src/ui/StudioTab.tsx` e `src/ui/AstaTab.tsx` come placeholder minimi (verranno implementati nei Task 12-13) così il progetto compila:

```tsx
export default function StudioTab() { return <main>Studio: carica prima il listone nel Setup.</main> }
```

```tsx
export default function AstaTab() { return <main>Asta: carica prima il listone nel Setup.</main> }
```

- [ ] **Step 4: Run** `npm test -- tests/ui/setup` → PASS; `npm run build` → ok.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: shell app, setup tab con import xlsx e config lega"`

---

### Task 12: UI — StudioTab + TierBoard (drag-and-drop)

**Files:**
- Create: `src/ui/TierBoard.tsx`
- Modify: `src/ui/StudioTab.tsx` (sostituisce il placeholder)
- Test: `tests/ui/studio.test.tsx`

**Interfaces:**
- Consumes: `AppCtx`, `predictPrices`, `TIER_LABELS`, `TIER_ORDER`, azioni `setTier`/`toggleTarget`/`setRolePlan`.
- Produces: —

**Comportamento StudioTab:**
- Filtri: ruolo (P/D/C/A/tutti), fascia, testo di ricerca, checkbox "solo da rivedere".
- Tabella: nome, squadra, ruolo, fascia (select rapida), FVM, Qt.A, Fm, Pv, prezzo previsto "min–max", stella target, badge "occasione"/"trappola".
  - **Occasione**: `fm ≥ FM_TITOLARE[ruolo]` ∧ `pv ≥ PV_SOLIDO` ∧ fascia ∉ {top, semitop} (rendimento da titolare, prezzo da comprimario). **Trappola**: fascia ∈ {top, semitop} ∧ `pv < PV_TITOLARE` (prezzo alto, storia corta). Riusa le costanti di `tiering.ts`.
- TierBoard: colonne = TIER_ORDER, card trascinabili (dnd-kit `useDraggable`/`useDroppable`); drop su colonna → `dispatch setTier`. Mostrata SOLO per il ruolo filtrato (con "tutti" il board è nascosto: 500 card sono ingestibili).
- Piano budget: input numerico per ruolo (`setRolePlan`) + somma vs budget con warning se sfora.

- [ ] **Step 1: Test fallente**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppCtx } from '@/ui/App'
import StudioTab from '@/ui/StudioTab'
import { initialState } from '@/logic/storage'
import { reducer, type Action } from '@/state/reducer'
import type { AppState, Player } from '@/logic/types'
import { useReducer } from 'react'

const mk = (id: number, nome: string, ruolo: Player['ruolo'], fvm: number): Player =>
  ({ id, nome, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm, stats: { pv: 30, mv: 6.5, fm: 7, gf: 10, gs: 0, rp: 0, rc: 0, rPlus: 0, rMinus: 0, ass: 5, amm: 1, esp: 0, au: 0 } })

function Harness({ init }: { init: AppState }) {
  const [state, dispatch] = useReducer(reducer, init)
  return <AppCtx.Provider value={{ state, dispatch }}><StudioTab /></AppCtx.Provider>
}

const init = reducer(initialState(), { type: 'importListone', players: [mk(1, 'Lautaro', 'A', 300), mk(2, 'Rrahmani', 'D', 40)] } as Action)

describe('StudioTab', () => {
  it('lista i giocatori con prezzo previsto', () => {
    render(<Harness init={init} />)
    expect(screen.getByText('Lautaro')).toBeInTheDocument()
    expect(screen.getByText('Rrahmani')).toBeInTheDocument()
  })
  it('filtro per ruolo', async () => {
    render(<Harness init={init} />)
    await userEvent.selectOptions(screen.getByLabelText('Ruolo'), 'A')
    expect(screen.getByText('Lautaro')).toBeInTheDocument()
    expect(screen.queryByText('Rrahmani')).not.toBeInTheDocument()
  })
  it('cambio fascia dalla select di riga', async () => {
    render(<Harness init={init} />)
    const row = screen.getByText('Lautaro').closest('tr')!
    await userEvent.selectOptions(within(row).getByLabelText('Fascia'), 'scommessa')
    expect((within(row).getByLabelText('Fascia') as HTMLSelectElement).value).toBe('scommessa')
  })
  it('stella target', async () => {
    render(<Harness init={init} />)
    const row = screen.getByText('Lautaro').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: /target/i }))
    expect(within(row).getByRole('button', { name: /target/i })).toHaveTextContent('★')
  })
})
```

- [ ] **Step 2: Run** `npm test -- tests/ui/studio` → FAIL.

- [ ] **Step 3: Implementazione**

`src/ui/TierBoard.tsx`:

```tsx
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useContext } from 'react'
import { AppCtx } from './App'
import { TIER_LABELS, TIER_ORDER, type Player, type TierId } from '@/logic/types'

function Card({ player }: { player: Player }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: player.id })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  return (
    <div ref={setNodeRef} style={style} className="card" {...listeners} {...attributes}>
      {player.nome} <small>{player.squadra} · FVM {player.fvm}</small>
    </div>
  )
}

function Column({ tier, players }: { tier: TierId; players: Player[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: tier })
  return (
    <div ref={setNodeRef} className="tiercol" style={isOver ? { outline: '2px solid #48f' } : undefined}>
      <h3>{TIER_LABELS[tier]} ({players.length})</h3>
      {players.map(p => <Card key={p.id} player={p} />)}
    </div>
  )
}

export default function TierBoard({ players }: { players: Player[] }) {
  const { state, dispatch } = useContext(AppCtx)
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && TIER_ORDER.includes(e.over.id as TierId))
      dispatch({ type: 'setTier', playerId: Number(e.active.id), tier: e.over.id as TierId })
  }
  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="tierboard">
        {TIER_ORDER.map(t => (
          <Column key={t} tier={t} players={players.filter(p => state.tiers[p.id] === t)} />
        ))}
      </div>
    </DndContext>
  )
}
```

`src/ui/StudioTab.tsx`:

```tsx
import { useContext, useMemo, useState } from 'react'
import { AppCtx } from './App'
import TierBoard from './TierBoard'
import { predictPrices } from '@/logic/pricing'
import { FM_TITOLARE, PV_SOLIDO, PV_TITOLARE } from '@/logic/tiering'
import { TIER_LABELS, TIER_ORDER, type Role, type TierId } from '@/logic/types'

export default function StudioTab() {
  const { state, dispatch } = useContext(AppCtx)
  const [role, setRole] = useState<Role | 'tutti'>('tutti')
  const [tierFilter, setTierFilter] = useState<TierId | 'tutte'>('tutte')
  const [q, setQ] = useState('')
  const [onlyReview, setOnlyReview] = useState(false)

  const prices = useMemo(() => predictPrices(state.players, state.tiers, state.league), [state.players, state.tiers, state.league])
  if (state.players.length === 0) return <main>Studio: carica prima il listone nel Setup.</main>

  const review = new Set(state.review)
  const shown = state.players.filter(p =>
    (role === 'tutti' || p.ruolo === role) &&
    (tierFilter === 'tutte' || state.tiers[p.id] === tierFilter) &&
    (!onlyReview || review.has(p.id)) &&
    p.nome.toLowerCase().includes(q.toLowerCase()),
  ).sort((a, b) => b.fvm - a.fvm)

  const isOccasione = (p: typeof shown[0]) => !!p.stats && p.stats.fm >= FM_TITOLARE[p.ruolo] && p.stats.pv >= PV_SOLIDO
    && state.tiers[p.id] !== 'top' && state.tiers[p.id] !== 'semitop'
  const isTrappola = (p: typeof shown[0]) => (state.tiers[p.id] === 'top' || state.tiers[p.id] === 'semitop')
    && (p.stats?.pv ?? 0) < PV_TITOLARE

  const planTotal = (Object.values(state.rolePlan) as number[]).reduce((a, b) => a + b, 0)

  return (
    <main>
      <section>
        <h2>Piano budget per ruolo</h2>
        {(['P', 'D', 'C', 'A'] as Role[]).map(r => (
          <label key={r}> {r} <input type="number" style={{ width: '5rem' }} value={state.rolePlan[r]}
            onChange={e => dispatch({ type: 'setRolePlan', plan: { ...state.rolePlan, [r]: Number(e.target.value) } })} /></label>
        ))}
        <span> Totale {planTotal}/{state.league.budget} {planTotal > state.league.budget && <strong className="error">sfori!</strong>}</span>
      </section>

      <section>
        <label>Ruolo <select aria-label="Ruolo" value={role} onChange={e => setRole(e.target.value as Role | 'tutti')}>
          <option value="tutti">tutti</option><option>P</option><option>D</option><option>C</option><option>A</option>
        </select></label>
        <label> Fascia <select value={tierFilter} onChange={e => setTierFilter(e.target.value as TierId | 'tutte')}>
          <option value="tutte">tutte</option>
          {TIER_ORDER.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
        </select></label>
        <label> Cerca <input value={q} onChange={e => setQ(e.target.value)} /></label>
        <label> <input type="checkbox" checked={onlyReview} onChange={e => setOnlyReview(e.target.checked)} /> solo da rivedere ({state.review.length})</label>
      </section>

      {role !== 'tutti' && <TierBoard players={state.players.filter(p => p.ruolo === role)} />}

      <table>
        <thead><tr><th></th><th>Nome</th><th>Squadra</th><th>R</th><th>Fascia</th><th>FVM</th><th>Qt.A</th><th>Fm</th><th>Pv</th><th>Prev.</th><th></th></tr></thead>
        <tbody>
          {shown.map(p => {
            const pr = prices.get(p.id)
            return (
              <tr key={p.id}>
                <td><button aria-label={`target ${p.nome}`} onClick={() => dispatch({ type: 'toggleTarget', playerId: p.id })}>
                  {state.targets.includes(p.id) ? '★' : '☆'}</button></td>
                <td>{p.nome}{review.has(p.id) ? ' ⚠' : ''}</td>
                <td>{p.squadra}</td>
                <td>{p.ruolo}</td>
                <td><select aria-label="Fascia" value={state.tiers[p.id]}
                  onChange={e => dispatch({ type: 'setTier', playerId: p.id, tier: e.target.value as TierId })}>
                  {TIER_ORDER.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                </select></td>
                <td>{p.fvm}</td><td>{p.qtA}</td>
                <td>{p.stats?.fm ?? '—'}</td><td>{p.stats?.pv ?? '—'}</td>
                <td>{pr ? `${pr.min}–${pr.max}` : '1'}</td>
                <td>{isOccasione(p) ? '💎 occasione' : isTrappola(p) ? '🪤 trappola' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 4: Run** `npm test -- tests/ui/studio` → PASS; `npm run build` → ok.

- [ ] **Step 5: Verifica manuale** — `npm run dev`, caricare i due xlsx reali dal Setup, aprire Studio: fasce popolate, drag di una card tra colonne funziona, filtri ok.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: studio tab con tabella, occasioni/trappole e tier board dnd"`

---

### Task 13: UI — AstaTab (inserimento, cruscotto, profili, consigli)

**Files:**
- Modify: `src/ui/AstaTab.tsx` (sostituisce il placeholder)
- Test: `tests/ui/asta.test.tsx`

**Interfaces:**
- Consumes: `deriveTeams`, `soldIds`, `profileTeam`, `adviseTargets`, `scarcityAlerts`, `predictPrices`, azioni `addPurchase`/`removePurchase`/`editPurchase`/`setTeamNote`.
- Produces: —

**Comportamento:**
- **Form acquisto**: input ricerca (datalist con soli invenduti, formato "Nome (Squadra, R)"), select squadra lega, input prezzo, bottone "Registra". Warning non bloccante sotto il form se `prezzo > maxBid` della squadra o `slotsLeft[ruolo] === 0` ("fuori regola, registro comunque").
- **Cronologia**: ultimi acquisti in cima, ogni riga con prezzo/squadra editabili inline + bottone elimina.
- **Cruscotto**: tabella squadre (righe evidenziata la mia): crediti, slot P/D/C/A, max rilancio, spesa media; sotto ogni squadra i traits del profilo + textarea nota pre-asta.
- **Consigli**: card per ogni target invenduto con `level` colorato e `why`; sezione allarmi scarsità.

- [ ] **Step 1: Test fallente**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { AppCtx } from '@/ui/App'
import AstaTab from '@/ui/AstaTab'
import { initialState } from '@/logic/storage'
import { reducer, type Action } from '@/state/reducer'
import type { AppState, Player } from '@/logic/types'

const mk = (id: number, nome: string, ruolo: Player['ruolo']): Player =>
  ({ id, nome, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })

function Harness({ init }: { init: AppState }) {
  const [state, dispatch] = useReducer(reducer, init)
  return <AppCtx.Provider value={{ state, dispatch }}><AstaTab /></AppCtx.Provider>
}

let init = reducer(initialState(), { type: 'importListone', players: [mk(1, 'Lautaro', 'A'), mk(2, 'Thuram', 'A')] } as Action)
init = reducer(init, { type: 'toggleTarget', playerId: 2 })

describe('AstaTab', () => {
  it('registra un acquisto e aggiorna il cruscotto', async () => {
    render(<Harness init={init} />)
    await userEvent.type(screen.getByLabelText('Giocatore'), 'Lautaro (Inter, A)')
    await userEvent.selectOptions(screen.getByLabelText('Squadra acquirente'), '1')
    await userEvent.clear(screen.getByLabelText('Prezzo'))
    await userEvent.type(screen.getByLabelText('Prezzo'), '200')
    await userEvent.click(screen.getByRole('button', { name: 'Registra' }))
    const row = screen.getByText('Squadra 2').closest('tr')!
    expect(within(row).getByText('300')).toBeInTheDocument() // crediti residui
  })
  it('elimina un acquisto dalla cronologia', async () => {
    let s = reducer(init, { type: 'addPurchase', playerId: 1, teamIndex: 1, price: 200 })
    render(<Harness init={s} />)
    await userEvent.click(screen.getByRole('button', { name: /elimina/i }))
    const row = screen.getByText('Squadra 2').closest('tr')!
    expect(within(row).getByText('500')).toBeInTheDocument()
  })
  it('mostra consiglio per il target', () => {
    render(<Harness init={init} />)
    expect(screen.getByText('Thuram')).toBeInTheDocument()
    expect(screen.getByText(/rivali|chiamalo|aspetta/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run** `npm test -- tests/ui/asta` → FAIL.

- [ ] **Step 3: Implementazione**

```tsx
import { useContext, useMemo, useState } from 'react'
import { AppCtx } from './App'
import { deriveTeams, soldIds } from '@/logic/auction'
import { profileTeam } from '@/logic/profiles'
import { adviseTargets, scarcityAlerts } from '@/logic/advisor'
import { predictPrices } from '@/logic/pricing'
import type { Role } from '@/logic/types'

export default function AstaTab() {
  const { state, dispatch } = useContext(AppCtx)
  const [playerText, setPlayerText] = useState('')
  const [teamIndex, setTeamIndex] = useState(0)
  const [price, setPrice] = useState(1)

  const prices = useMemo(() => predictPrices(state.players, state.tiers, state.league), [state.players, state.tiers, state.league])
  const teams = useMemo(() => deriveTeams(state.purchases, state.league, state.players), [state.purchases, state.league, state.players])
  const profiles = useMemo(() => teams.map(t => profileTeam(t, state.players, state.tiers, prices, state.league)), [teams, state.players, state.tiers, prices, state.league])
  if (state.players.length === 0) return <main>Asta: carica prima il listone nel Setup.</main>

  const sold = soldIds(state.purchases)
  const unsold = state.players.filter(p => !sold.has(p.id))
  const label = (p: typeof unsold[0]) => `${p.nome} (${p.squadra}, ${p.ruolo})`
  const selected = unsold.find(p => label(p) === playerText)
  const byId = new Map(state.players.map(p => [p.id, p]))

  const warning = selected && (() => {
    const t = teams[teamIndex]
    if (price > t.maxBid) return `${t.name} supera il suo max rilancio (${t.maxBid}): fuori regola, registro comunque`
    if (t.slotsLeft[selected.ruolo] === 0) return `${t.name} non ha più slot ${selected.ruolo}: fuori regola, registro comunque`
    return ''
  })()

  const register = () => {
    if (!selected) return
    dispatch({ type: 'addPurchase', playerId: selected.id, teamIndex, price })
    setPlayerText(''); setPrice(1)
  }

  const advice = adviseTargets({ targets: state.targets, purchases: state.purchases, players: state.players, tiers: state.tiers, prices, league: state.league, teams, profiles })
  const alerts = scarcityAlerts({ purchases: state.purchases, players: state.players, tiers: state.tiers, league: state.league, teams })
  const history = [...state.purchases].sort((a, b) => b.seq - a.seq)

  return (
    <main>
      <section>
        <h2>Registra acquisto</h2>
        <input list="unsold" aria-label="Giocatore" placeholder="cerca giocatore..." value={playerText} onChange={e => setPlayerText(e.target.value)} />
        <datalist id="unsold">{unsold.map(p => <option key={p.id} value={label(p)} />)}</datalist>
        <select aria-label="Squadra acquirente" value={teamIndex} onChange={e => setTeamIndex(Number(e.target.value))}>
          {state.league.teams.map((n, i) => <option key={i} value={i}>{n}</option>)}
        </select>
        <input type="number" aria-label="Prezzo" min={1} value={price} onChange={e => setPrice(Number(e.target.value))} />
        <button onClick={register} disabled={!selected}>Registra</button>
        {selected && prices.get(selected.id) && <span> previsto {prices.get(selected.id)!.min}–{prices.get(selected.id)!.max}</span>}
        {warning && <p className="error">{warning}</p>}
      </section>

      <section className="dashboard">
        <h2>Cruscotto lega</h2>
        <table>
          <thead><tr><th>Squadra</th><th>Crediti</th><th>P</th><th>D</th><th>C</th><th>A</th><th>Max rilancio</th><th>Spesa media</th></tr></thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.teamIndex} className={t.teamIndex === state.league.myTeamIndex ? 'me' : ''}>
                <td>{t.name}</td><td>{t.credits}</td>
                {(['P', 'D', 'C', 'A'] as Role[]).map(r => <td key={r}>{t.slotsLeft[r]}</td>)}
                <td>{t.maxBid}</td>
                <td>{t.purchases.length > 0 ? Math.round(t.spent / t.purchases.length) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Profili avversari</h3>
        {teams.filter(t => t.teamIndex !== state.league.myTeamIndex).map(t => (
          <div key={t.teamIndex}>
            <strong>{t.name}</strong>: {profiles[t.teamIndex].traits.join(' · ') || 'ancora nessun pattern'}
            <br /><textarea placeholder="note pre-asta" value={state.teamNotes[t.teamIndex] ?? ''}
              onChange={e => dispatch({ type: 'setTeamNote', teamIndex: t.teamIndex, note: e.target.value })} />
          </div>
        ))}
      </section>

      <section>
        <h2>Consigli</h2>
        {alerts.map((a, i) => <p key={i} className="advice-alta">⚠ {a.message}</p>)}
        {advice.map(a => (
          <p key={a.playerId} className={`advice-${a.level}`}>
            <strong>{byId.get(a.playerId)?.nome}</strong> — contesa {a.level}: {a.why}
            {a.rivals.length > 0 && <small><br />{a.rivals.map(r => r.reason).join(' · ')}</small>}
          </p>
        ))}
        {advice.length === 0 && <p>Nessun target ancora da comprare (le stelle si mettono nello Studio).</p>}
      </section>

      <section>
        <h2>Cronologia</h2>
        {history.map(pu => (
          <div key={pu.seq}>
            {byId.get(pu.playerId)?.nome} →
            <select value={pu.teamIndex} onChange={e => dispatch({ type: 'editPurchase', seq: pu.seq, price: pu.price, teamIndex: Number(e.target.value) })}>
              {state.league.teams.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
            <input type="number" value={pu.price} style={{ width: '4rem' }}
              onChange={e => dispatch({ type: 'editPurchase', seq: pu.seq, price: Number(e.target.value), teamIndex: pu.teamIndex })} />
            <button aria-label={`elimina acquisto ${pu.seq}`} onClick={() => dispatch({ type: 'removePurchase', seq: pu.seq })}>elimina</button>
          </div>
        ))}
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Run** `npm test -- tests/ui/asta` → PASS; `npm test` (tutta la suite) → PASS; `npm run build` → ok.

- [ ] **Step 5: Verifica manuale (simulazione d'asta)** — `npm run dev`: caricare i file reali, mettere 3-4 stelle nello Studio, registrare ~10 acquisti distribuiti tra squadre nel tab Asta e verificare: crediti/slot scalano, un profilo tipo "Amico 4" emerge comprando 3 attaccanti cari con una squadra, i consigli cambiano livello, undo funziona.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: asta tab con cruscotto, profili avversari e consigli"`

---

### Task 14: Deploy + README

**Files:**
- Create: `README.md`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: build Vite (`base: './'` già impostato nel Task 1).
- Produces: URL pubblico GitHub Pages.

- [ ] **Step 1: Workflow Pages**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: README** con: cosa fa l'app, dove scaricare i due xlsx (fantacalcio.it → sezione quotazioni), avvio locale (`npm install && npm run dev`), promemoria backup JSON a fine asta, link spec/piano.

- [ ] **Step 3: Pubblicazione** — creare il repo GitHub (`gh repo create fanta-asta --public --source . --push`), abilitare Pages (Settings → Pages → Source: GitHub Actions; via CLI: `gh api repos/{owner}/fanta-asta/pages -X POST -f build_type=workflow` — se fallisce, farlo dalla UI), attendere il workflow verde e aprire l'URL.

- [ ] **Step 4: Verifica** — dall'URL pubblico: caricare i due xlsx reali, controllare Studio e Asta funzionanti. Girare il link agli amici.

- [ ] **Step 5: Commit finale** — `git add -A && git commit -m "chore: deploy GitHub Pages e README" && git push`

---

## Self-Review (eseguita)

1. **Copertura spec**: import 2 file ✓ (T3-4), re-import per Id ✓ (T10 reducer), fasce auto + review + drag ✓ (T5, T12), previsione a range con costanti "da calibrare" ✓ (T6), cruscotto/maxBid ✓ (T7, T13), profili "Amici 1-5" ✓ (T8, test omonimi), note pre-asta ✓ (T10, T13), consigli+timing+scarsità ✓ (T9, T13), piano budget per ruolo ✓ (T12), storage versionato + export/import ✓ (T10-11), warning fuori-regola con override ✓ (T13), deploy statico ✓ (T14). Fascia rinominabile/estendibile: rimandata (i TierId sono fissi in questa versione) — semplificazione YAGNI consapevole rispetto alla spec, da annotare nel commit del Task 2.
2. **Placeholder**: nessun TBD; ogni step con codice ha il codice.
3. **Coerenza tipi**: firme di `deriveTeams`/`profileTeam`/`adviseTargets`/`predictPrices` identiche tra Task 7-9 e i consumer UI (T12-13); `TeamProfile.traits` è la sola interfaccia usata dal matching low-cost in advisor (stringa esatta `"<ruolo> low cost"`), documentata in entrambi i task.
