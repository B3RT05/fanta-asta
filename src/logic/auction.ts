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
