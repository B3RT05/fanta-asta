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
