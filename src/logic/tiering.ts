import type { Player, Role, TierId } from './types'

// ---- soglie (da calibrare) ----
export const PV_TITOLARE = 15   // presenze minime per essere valutato sul rendimento
export const PV_SOLIDO = 25     // presenze da titolare pieno (richieste per la fascia "titolare")
export const DIFF_ASCESA = 8    // Qt.A - Qt.I: giocatore "in ascesa" per i quotisti
// un non-valutabile è "scommessa" solo se ha vero potenziale: FVM nel quartile
// alto del ruolo, oppure in ascesa con FVM sopra la media. Altrimenti riempitivo.
export const SCOMMESSA_FVM_PCT = 0.80
export const REVIEW_BAND = 0.03
export const SCORE_PCT_TOP = 0.90
export const SCORE_PCT_SEMITOP = 0.70
export const SCORE_PCT_TITOLARE = 0.35
// fallback FVM (quando il file statistiche NON è caricato): fasce dal valore di mercato
export const FVM_PCT_TOP = 0.90
export const FVM_PCT_SEMITOP = 0.72
export const FVM_PCT_TITOLARE = 0.45

// usato da StudioTab per i badge occasione/trappola
export const FM_TITOLARE: Record<Role, number> = { P: 5.4, D: 6.0, C: 6.3, A: 6.5 }

// ---- clusterizzazione per RUOLO ----
// Ogni ruolo pesa metriche diverse (da calibrare). Le metriche vengono
// normalizzate min-max dentro il pool di ruolo, poi combinate col peso.
//   gol        = gol fatti (Gf)
//   fm         = fantamedia (Fm)
//   pv         = presenze a voto (Pv)
//   mv         = media voto base (Mv)
//   bonus      = gol + assist (Gf + Ass)  -> difensori/centrocampisti da bonus
//   cleansheet = -(gol subiti / presenze)  proxy dei clean sheet: nel file
//                Fantacalcio.it NON c'è il conteggio delle porte imbattute,
//                solo i gol subiti totali; meno gol/gara = meglio.
type MetricKey = 'gol' | 'fm' | 'pv' | 'mv' | 'bonus' | 'cleansheet'

export const ROLE_WEIGHTS: Record<Role, Partial<Record<MetricKey, number>>> = {
  A: { gol: 0.40, fm: 0.40, pv: 0.20 },
  C: { fm: 0.60, pv: 0.40 },
  D: { fm: 0.30, mv: 0.28, pv: 0.17, bonus: 0.25 },
  P: { fm: 0.32, mv: 0.30, cleansheet: 0.23, pv: 0.15 },
}

function metric(p: Player, key: MetricKey): number {
  const s = p.stats!
  switch (key) {
    case 'gol': return s.gf
    case 'fm': return s.fm
    case 'pv': return s.pv
    case 'mv': return s.mv
    case 'bonus': return s.gf + s.ass
    case 'cleansheet': return s.pv > 0 ? -(s.gs / s.pv) : 0
  }
  return 0
}

const ROLES: Role[] = ['P', 'D', 'C', 'A']

export function proposeTiers(players: Player[]): { tiers: Record<number, TierId>; review: number[] } {
  // Le fasce da rendimento richiedono il file statistiche. Se non è stato
  // caricato (nessun giocatore ha statistiche) ripieghiamo sulle fasce da FVM,
  // altrimenti collasserebbe tutto in "scommessa"/"riempitivo".
  return players.some(p => p.stats) ? tiersByRendimento(players) : tiersByFvm(players)
}

function tiersByRendimento(players: Player[]): { tiers: Record<number, TierId>; review: number[] } {
  const tiers: Record<number, TierId> = {}
  const review: number[] = []
  const roles = ROLES

  for (const role of roles) {
    const pool = players.filter(p => p.ruolo === role)

    // percentile FVM nel ruolo: distingue le vere scommesse (mercato alto) dai riempitivi
    const sortedFvm = [...pool].sort((a, b) => a.fvm - b.fvm)
    const fvmPctOf = new Map<number, number>()
    sortedFvm.forEach((p, i) => fvmPctOf.set(p.id, sortedFvm.length > 1 ? i / (sortedFvm.length - 1) : 1))

    // valutabili sul rendimento: hanno statistiche e presenze sufficienti
    const evaluable = pool.filter(p => p.stats && p.stats.pv >= PV_TITOLARE)
    const weights = ROLE_WEIGHTS[role]
    const keys = Object.keys(weights) as MetricKey[]

    // range per metrica (per la normalizzazione min-max)
    const range = new Map<MetricKey, { min: number; max: number }>()
    for (const k of keys) {
      const vals = evaluable.map(p => metric(p, k))
      range.set(k, { min: Math.min(...vals), max: Math.max(...vals) })
    }
    const norm = (v: number, k: MetricKey) => {
      const r = range.get(k)!
      return r.max === r.min ? 0.5 : (v - r.min) / (r.max - r.min)
    }
    const score = (p: Player) => keys.reduce((s, k) => s + weights[k]! * norm(metric(p, k), k), 0)

    // percentile dello score dentro i valutabili del ruolo
    const scored = evaluable.map(p => ({ id: p.id, s: score(p) })).sort((a, b) => a.s - b.s)
    const pctOf = new Map<number, number>()
    scored.forEach((e, i) => pctOf.set(e.id, scored.length > 1 ? i / (scored.length - 1) : 1))

    for (const p of pool) {
      const pv = p.stats?.pv ?? 0
      const pct = pctOf.get(p.id)
      let tier: TierId
      if (pct === undefined) {
        // pochi/zero dati: scommessa solo se ha vero potenziale (FVM alto nel
        // ruolo, o in ascesa con FVM sopra la media), altrimenti riempitivo
        const fp = fvmPctOf.get(p.id)!
        const inAscesa = p.qtA - p.qtI >= DIFF_ASCESA
        tier = (fp >= SCOMMESSA_FVM_PCT || (inAscesa && fp >= 0.5)) ? 'scommessa' : 'riempitivo'
      } else if (pct >= SCORE_PCT_TOP) {
        tier = 'top'
      } else if (pct >= SCORE_PCT_SEMITOP) {
        tier = 'semitop'
      } else if (pct >= SCORE_PCT_TITOLARE && pv >= PV_SOLIDO) {
        tier = 'titolare'
      } else {
        tier = 'riempitivo'
      }
      tiers[p.id] = tier

      const nearCut = pct !== undefined &&
        (Math.abs(pct - SCORE_PCT_TOP) <= REVIEW_BAND || Math.abs(pct - SCORE_PCT_SEMITOP) <= REVIEW_BAND)
      const heavyNoHistory = p.qtA >= 15 && pv < PV_TITOLARE
      if (nearCut || heavyNoHistory) review.push(p.id)
    }
  }
  return { tiers, review }
}

// Fallback: solo listone, niente statistiche -> fasce per percentile di FVM.
function tiersByFvm(players: Player[]): { tiers: Record<number, TierId>; review: number[] } {
  const tiers: Record<number, TierId> = {}
  const review: number[] = []
  for (const role of ROLES) {
    const pool = players.filter(p => p.ruolo === role).sort((a, b) => a.fvm - b.fvm)
    pool.forEach((p, i) => {
      const pct = pool.length > 1 ? i / (pool.length - 1) : 1
      let tier: TierId
      if (pct >= FVM_PCT_TOP) tier = 'top'
      else if (pct >= FVM_PCT_SEMITOP) tier = 'semitop'
      else if (pct >= FVM_PCT_TITOLARE) tier = 'titolare'
      else tier = 'riempitivo'
      tiers[p.id] = tier
      const nearCut = Math.abs(pct - FVM_PCT_TOP) <= REVIEW_BAND || Math.abs(pct - FVM_PCT_SEMITOP) <= REVIEW_BAND
      const inAscesa = p.qtA - p.qtI >= DIFF_ASCESA
      if (nearCut || inAscesa) review.push(p.id)
    })
  }
  return { tiers, review }
}
