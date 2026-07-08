import type { LeagueConfig, Player, PriceRange, Role, TierId } from './types'

// da calibrare con i prezzi reali registrati durante le aste
export const ROLE_INFLATION: Record<Role, number> = { P: 0.9, D: 0.95, C: 1.0, A: 1.15 }
export const TIER_MULT: Record<string, number> = { top: 1.15, semitop: 1.05, scommessa: 1.0, titolare: 0.95, riempitivo: 1.0, skip: 1.0 } // fasce custom non elencate -> 1.0
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
    const sumFvm = pool.reduce((s, p) => s + p.fvm, 0) || 1
    const roleBudget = totalCredits * weight(role) / totalWeight
    // prezzo grezzo (proporzionale a FVM, corretto per fascia)
    const raw = pool.map(p => {
      const tier = tiers[p.id] ?? 'riempitivo'
      return { p, tier, v: (p.fvm / sumFvm) * roleBudget * (TIER_MULT[tier] ?? 1) }
    })
    // normalizza: la somma dei prezzi del ruolo torna al budget di ruolo
    // (i moltiplicatori di fascia non devono gonfiare il totale della lega)
    const rawSum = raw.reduce((s, r) => s + r.v, 0) || 1
    const norm = roleBudget / rawSum
    for (const { p, tier, v } of raw) {
      const base = Math.max(1, Math.round(v * norm))
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
