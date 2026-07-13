import { tierLabel, type LeagueConfig, type Player, type PriceRange, type Purchase, type Role, type TierDef, type TierId } from './types'
import { soldIds, type TeamState } from './auction'
import { LOWCOST_PRICE, TRAIT_BIG_PCT, TRAIT_ROLE_PCT, type TeamProfile } from './profiles'

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
    out.push({ playerId: id, ...contesaFor(pl, { prices, league, teams, profiles }) })
  }
  return out
}

/** Contesa su UN giocatore qualsiasi: chi può ancora contenderlo, quanto è
 *  affollato, e se conviene chiamarlo ora o aspettare. */
export function contesaFor(pl: Player, ctx: {
  prices: Map<number, PriceRange>; league: LeagueConfig; teams: TeamState[]; profiles: TeamProfile[]
}): { rivals: { teamIndex: number; reason: string }[]; level: 'bassa' | 'media' | 'alta'; callNow: boolean; why: string } {
  const { prices, league, teams, profiles } = ctx
  const minPrice = prices.get(pl.id)?.min ?? 2
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
  return { rivals, level, callNow, why }
}

// Metodo CarmySpecial — chiamate strategiche (bluff): nomina profili
// desiderati dagli avversari (idoli locali, big) al solo scopo di prosciugarne
// la liquidità, tenendo al sicuro i tuoi veri obiettivi.
export const BLUFF_MIN_PREDICTED = 8
export interface BluffCall { playerId: number; teamIndex: number; drain: number; message: string }

export function bluffSuggestions(state: {
  targets: number[]; purchases: Purchase[]; players: Player[]
  tiers: Record<number, TierId>; prices: Map<number, PriceRange>
  league: LeagueConfig; teams: TeamState[]; profiles: TeamProfile[]
}, limit = 4): BluffCall[] {
  const { targets, purchases, players, tiers, prices, league, teams, profiles } = state
  const sold = soldIds(purchases)
  const mine = new Set(targets)
  const cand: (BluffCall & { score: number })[] = []

  for (const pl of players) {
    if (sold.has(pl.id) || mine.has(pl.id)) continue // solo giocatori che NON voglio
    const tier = tiers[pl.id]
    if (tier !== 'top' && tier !== 'semitop') continue // il bluff drena solo su profili appetibili
    const pr = prices.get(pl.id)
    if (!pr || pr.base < BLUFF_MIN_PREDICTED) continue
    const minPrice = pr.min ?? 2

    // trova il rivale che più lo desidera e ha crediti veri da bruciare
    let best: { t: TeamState; score: number; reason: string } | null = null
    for (const t of teams) {
      if (t.teamIndex === league.myTeamIndex) continue
      if (t.slotsLeft[pl.ruolo] <= 0) continue
      if (t.maxBid < Math.max(2 * minPrice, BLUFF_MIN_PREDICTED)) continue // deve poter rilanciare sul serio
      const prof = profiles[t.teamIndex]
      const reliable = t.purchases.length >= PROFILE_MIN_PURCHASES
      const bigAff = league.bigClubs.includes(pl.squadra) ? (reliable ? prof.bigClubPct : 0.5) : 0
      const roleAff = reliable ? prof.roleSpendPct[pl.ruolo] : 0.25
      const score = t.maxBid * (1 + bigAff + roleAff)
      const reason = bigAff >= TRAIT_BIG_PCT ? 'compra dalle big'
        : roleAff >= TRAIT_ROLE_PCT ? `carica su ${ROLE_NAMES[pl.ruolo]}`
          : `ha ${t.maxBid} cr da spendere`
      if (!best || score > best.score) best = { t, score, reason }
    }
    if (!best) continue
    cand.push({
      playerId: pl.id, teamIndex: best.t.teamIndex, drain: best.t.maxBid, score: best.score,
      message: `Chiama ${pl.nome} (${pl.squadra}): lo insegue ${best.t.name} — ${best.reason} (${best.t.maxBid} cr). Prosciugalo, non è un tuo obiettivo.`,
    })
  }
  cand.sort((a, b) => b.score - a.score)
  return cand.slice(0, limit).map(c => ({ playerId: c.playerId, teamIndex: c.teamIndex, drain: c.drain, message: c.message }))
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
