import { describe, it, expect } from 'vitest'
import { deriveTeams, soldIds } from '@/logic/auction'
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
