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
  tierCounts: Record<string, number>
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
  const tierCounts: Record<string, number> = {}
  let big = 0
  const deltas: number[] = []
  for (const pu of team.purchases) {
    const pl = byId.get(pu.playerId)
    if (!pl) continue
    roleSpend[pl.ruolo] += pu.price
    rolePrices[pl.ruolo].push(pu.price)
    const tid = tiers[pu.playerId] ?? 'riempitivo'
    tierCounts[tid] = (tierCounts[tid] ?? 0) + 1
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
    if ((tierCounts['scommessa'] ?? 0) / n >= TRAIT_SCOMMESSA_PCT) traits.push('accumula scommesse')
    if (avgPriceDeltaPct !== null && avgPriceDeltaPct >= TRAIT_OVERPAY)
      traits.push(`strapaga (+${Math.round(avgPriceDeltaPct * 100)}% sul previsto)`)
    if (avgPriceDeltaPct !== null && avgPriceDeltaPct <= -TRAIT_OVERPAY)
      traits.push(`risparmia (${Math.round(avgPriceDeltaPct * 100)}% sul previsto)`)
  }
  return { teamIndex: team.teamIndex, roleSpendPct, bigClubPct, tierCounts, avgPriceDeltaPct, traits }
}
