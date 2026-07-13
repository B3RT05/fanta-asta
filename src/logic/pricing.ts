import type { LeagueConfig, Player, PriceRange, Role, TierId } from './types'

// da calibrare con i prezzi reali registrati durante le aste
export const ROLE_INFLATION: Record<Role, number> = { P: 0.9, D: 0.95, C: 1.0, A: 1.15 }
export const TIER_MULT: Record<string, number> = { top: 1.15, semitop: 1.05, scommessa: 1.0, titolare: 0.95, riempitivo: 1.0, skip: 1.0 } // fasce custom non elencate -> 1.0
export const SPREAD = 0.15
export const SPREAD_SCOMMESSA = 0.30

const ROLE_LONG: Record<Role, string> = { P: 'portieri', D: 'difensori', C: 'centrocampo', A: 'attacco' }

/** Spiega COME nasce il prezzo previsto di un giocatore (fascia + FVM + ruolo,
 *  più il rendimento se disponibile). Usato nei tooltip "Perché questo prezzo?". */
export function priceExplanation(
  p: Player, tier: TierId, pr: PriceRange | undefined, fasciaLabel?: string, rendimento?: 'basso' | 'medio' | 'alto',
): string {
  const mult = TIER_MULT[tier] ?? 1
  const fascia = fasciaLabel ?? tier
  const fasciaTxt = mult > 1 ? `fascia ${fascia} (+${Math.round((mult - 1) * 100)}%)` : mult < 1 ? `fascia ${fascia} (${Math.round((mult - 1) * 100)}%)` : `fascia ${fascia}`
  const roleTxt = ROLE_INFLATION[p.ruolo] > 1 ? `${ROLE_LONG[p.ruolo]} (reparto caro +${Math.round((ROLE_INFLATION[p.ruolo] - 1) * 100)}%)`
    : ROLE_INFLATION[p.ruolo] < 1 ? `${ROLE_LONG[p.ruolo]} (reparto economico ${Math.round((ROLE_INFLATION[p.ruolo] - 1) * 100)}%)`
      : ROLE_LONG[p.ruolo]
  const range = pr ? `${pr.min}–${pr.max} (base ${pr.base})` : '≈ 1'
  const rendTxt = rendimento ? ` · rendimento ${rendimento}` : ''
  return `Prezzo previsto ${range}. Deriva da: FVM ${p.fvm}${rendTxt}, ${fasciaTxt}, ${roleTxt}. Più alto è l'FVM rispetto agli altri del ruolo, più sale.`
}

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
