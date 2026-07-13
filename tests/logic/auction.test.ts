import { describe, it, expect } from 'vitest'
import { deriveTeams, soldIds, canFieldFormation, rosterCompare } from '@/logic/auction'
import { DEFAULT_LEAGUE, type Player } from '@/logic/types'

const mk = (id: number, ruolo: Player['ruolo']): Player =>
  ({ id, nome: `G${id}`, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })
const players = [mk(1, 'A'), mk(2, 'A'), mk(3, 'P'), mk(4, 'D')]

describe('deriveTeams', () => {
  it('parte da budget pieno e slot pieni', () => {
    const t = deriveTeams([], DEFAULT_LEAGUE, players)
    expect(t).toHaveLength(8)
    expect(t[0]).toMatchObject({ credits: 500, totalSlotsLeft: 25, maxBid: 476 }) // 500-(25-1)
  })
  it('scala crediti e slot dopo gli acquisti', () => {
    const t = deriveTeams([
      { playerId: 1, teamIndex: 0, price: 200, seq: 1 },
      { playerId: 3, teamIndex: 0, price: 1, seq: 2 },
      { playerId: 2, teamIndex: 1, price: 50, seq: 3 },
    ], DEFAULT_LEAGUE, players)
    expect(t[0].credits).toBe(299)
    expect(t[0].slotsLeft.A).toBe(5)
    expect(t[0].slotsLeft.P).toBe(2)
    expect(t[0].maxBid).toBe(299 - (23 - 1))
    expect(t[1].credits).toBe(450)
  })
  it('maxBid mai negativo', () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ playerId: 100 + i, teamIndex: 0, price: 20, seq: i }))
    const ps = many.map(x => mk(x.playerId, 'D'))
    const t = deriveTeams(many, DEFAULT_LEAGUE, ps)
    expect(t[0].maxBid).toBeGreaterThanOrEqual(0)
  })
  it('soldIds', () => {
    expect(soldIds([{ playerId: 7, teamIndex: 2, price: 3, seq: 1 }]).has(7)).toBe(true)
  })
})

describe('canFieldFormation', () => {
  it('rosa valida per un modulo -> true', () => {
    expect(canFieldFormation({ P: 1, D: 3, C: 4, A: 3 })).toBe(true)   // 3-4-3
    expect(canFieldFormation({ P: 1, D: 5, C: 3, A: 2 })).toBe(true)   // 5-3-2
  })
  it('senza portiere o senza abbastanza per reparto -> false', () => {
    expect(canFieldFormation({ P: 0, D: 5, C: 5, A: 3 })).toBe(false) // niente portiere
    expect(canFieldFormation({ P: 1, D: 8, C: 1, A: 1 })).toBe(false) // solo 1 centrocampista
    expect(canFieldFormation({ P: 1, D: 2, C: 2, A: 1 })).toBe(false) // troppo pochi outfield
  })
})

describe('rosterCompare', () => {
  it('confronta la mia spesa/numero per reparto con la media della lega', () => {
    // io (team 0) spendo 200 su un attaccante; il team 1 ne spende 50
    const purchases = [
      { playerId: 1, teamIndex: 0, price: 200, seq: 1 },
      { playerId: 2, teamIndex: 1, price: 50, seq: 2 },
    ]
    const league = { ...DEFAULT_LEAGUE, myTeamIndex: 0 }
    const teams = deriveTeams(purchases, league, players)
    const cmp = rosterCompare(teams, players, league)
    const a = cmp.find(x => x.role === 'A')!
    expect(a.mySpent).toBe(200)
    expect(a.myCount).toBe(1)
    // media lega su 8 squadre: (200+50)/8 ≈ 31
    expect(a.avgSpent).toBe(Math.round(250 / 8))
    // reparti senza acquisti: tutto a 0
    expect(cmp.find(x => x.role === 'P')!.mySpent).toBe(0)
  })
})
