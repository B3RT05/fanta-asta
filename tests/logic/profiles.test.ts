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
