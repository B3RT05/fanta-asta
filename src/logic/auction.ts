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

/** Puoi schierare un 11 valido? Servono 1 portiere e un modulo di reparto
 *  ammesso (D 3-5, C 3-5, A 1-3, somma 10) coi giocatori che hai. */
export function canFieldFormation(bought: Record<Role, number>): boolean {
  if ((bought.P ?? 0) < 1) return false
  for (let d = 3; d <= 5; d++)
    for (let c = 3; c <= 5; c++)
      for (let a = 1; a <= 3; a++)
        if (d + c + a === 10 && d <= (bought.D ?? 0) && c <= (bought.C ?? 0) && a <= (bought.A ?? 0)) return true
  return false
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
