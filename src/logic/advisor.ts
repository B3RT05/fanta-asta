import { tierLabel, type LeagueConfig, type Player, type PriceRange, type Purchase, type Role, type TierDef, type TierId } from './types'
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

export interface LastBidderRole { role: Role; message: string }

/** Ruoli in cui nessun rivale può più rilanciare (slot pieni o crediti finiti):
 *  lì l'ultimo rimasto compra a 1 credito -> conviene aspettare e non rilanciare. */
export function lastBidderRoles(state: { league: LeagueConfig; teams: TeamState[] }): LastBidderRole[] {
  const { league, teams } = state
  const me = teams[league.myTeamIndex]
  const out: LastBidderRole[] = []
  for (const role of ['P', 'D', 'C', 'A'] as Role[]) {
    if (me.slotsLeft[role] <= 0) continue
    const rivalCanBid = teams.some((t, i) => i !== league.myTeamIndex && t.slotsLeft[role] > 0 && t.maxBid >= 2)
    if (!rivalCanBid)
      out.push({ role, message: `Sei l'unico a poter comprare in ${ROLE_NAMES[role]}: puoi prenderli a 1 credito, aspetta e non rilanciare.` })
  }
  return out
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
  tierDefs: TierDef[]; league: LeagueConfig; teams: TeamState[]
}): ScarcityAlert[] {
  const { purchases, players, tiers, tierDefs, league, teams } = state
  const sold = soldIds(purchases)
  const me = teams[league.myTeamIndex]
  const out: ScarcityAlert[] = []
  const watched: TierId[] = ['top', 'semitop', 'titolare'] // solo fasce default: le custom non sono sorvegliate
  for (const role of ['P', 'D', 'C', 'A'] as Role[]) {
    const myMissing = me.slotsLeft[role]
    if (myMissing <= 0) continue
    for (const tier of watched) {
      const remaining = players.filter(p => p.ruolo === role && !sold.has(p.id) && tiers[p.id] === tier).length
      if (remaining <= myMissing + SCARCITY_MARGIN) {
        out.push({
          role, tier, remaining, myMissing,
          message: `Restano ${remaining} "${tierLabel(tierDefs, tier)}" in ${ROLE_NAMES[role]} e a te mancano ${myMissing} ${ROLE_NAMES[role].slice(0, 3)}: valuta di muoverti`,
        })
      }
    }
  }
  return out
}
