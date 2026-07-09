import { describe, it, expect } from 'vitest'
import { deriveTeams } from '@/logic/auction'
import { profileTeam } from '@/logic/profiles'
import { adviseTargets, scarcityAlerts, lastBidderRoles } from '@/logic/advisor'
import type { TeamState } from '@/logic/auction'
import { DEFAULT_LEAGUE, DEFAULT_TIER_DEFS, type Player, type PriceRange, type Role, type TierId } from '@/logic/types'

const mk = (id: number, ruolo: Player['ruolo'], squadra = 'Inter'): Player =>
  ({ id, nome: `G${id}`, squadra, ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })

function setup(purchases: Parameters<typeof deriveTeams>[0], players: Player[], tiers: Record<number, TierId>, prices: Map<number, PriceRange>) {
  const teams = deriveTeams(purchases, DEFAULT_LEAGUE, players)
  const profiles = teams.map(t => profileTeam(t, players, tiers, prices, DEFAULT_LEAGUE))
  return { purchases, players, tiers, prices, league: DEFAULT_LEAGUE, teams, profiles }
}

describe('adviseTargets', () => {
  it('rivale senza crediti non conta -> chiama ora', () => {
    const players = [mk(1, 'A'), ...Array.from({ length: 24 }, (_, i) => mk(100 + i, 'D'))]
    const tiers: Record<number, TierId> = { 1: 'top' }
    const prices = new Map<number, PriceRange>([[1, { base: 100, min: 85, max: 115 }]])
    // le squadre 1..7 hanno speso quasi tutto
    const purchases = Array.from({ length: 7 }, (_, t) => ({ playerId: 100 + t, teamIndex: t + 1, price: 480, seq: t + 1 }))
    const s = setup(purchases, players, tiers, prices)
    const advice = adviseTargets({ ...s, targets: [1] })
    expect(advice[0].rivals).toHaveLength(0)
    expect(advice[0].level).toBe('bassa')
    expect(advice[0].callNow).toBe(true)
  })
  it('molti rivali con crediti -> aspetta', () => {
    const players = [mk(1, 'A')]
    const tiers: Record<number, TierId> = { 1: 'top' }
    const prices = new Map<number, PriceRange>([[1, { base: 100, min: 85, max: 115 }]])
    const s = setup([], players, tiers, prices)
    const advice = adviseTargets({ ...s, targets: [1] })
    expect(advice[0].level).toBe('alta')
    expect(advice[0].callNow).toBe(false)
    expect(advice[0].rivals.length).toBe(7)
  })
  it('target gia venduto sparisce dai consigli', () => {
    const players = [mk(1, 'A')]
    const tiers: Record<number, TierId> = { 1: 'top' }
    const prices = new Map<number, PriceRange>()
    const s = setup([{ playerId: 1, teamIndex: 2, price: 50, seq: 1 }], players, tiers, prices)
    expect(adviseTargets({ ...s, targets: [1] })).toHaveLength(0)
  })
})

describe('scarcityAlerts', () => {
  it('avvisa quando i titolari invenduti bastano appena', () => {
    const players = Array.from({ length: 5 }, (_, i) => mk(i + 1, 'D'))
    const tiers: Record<number, TierId> = { 1: 'titolare', 2: 'titolare', 3: 'titolare', 4: 'riempitivo', 5: 'riempitivo' }
    const s = setup([], players, tiers, new Map())
    const alerts = scarcityAlerts({ ...s, tierDefs: DEFAULT_TIER_DEFS })
    const d = alerts.find(a => a.role === 'D' && a.tier === 'titolare')
    expect(d).toBeDefined()
    expect(d!.remaining).toBe(3)
    expect(d!.myMissing).toBe(8)
  })
})

describe('lastBidderRoles', () => {
  const T = (teamIndex: number, slotsLeft: Record<Role, number>, maxBid: number): TeamState =>
    ({ teamIndex, name: 'T' + teamIndex, spent: 0, credits: 100, slotsLeft, totalSlotsLeft: 0, maxBid, purchases: [] })
  it('segnala il ruolo dove nessun rivale può più rilanciare', () => {
    const teams = [
      T(0, { P: 1, D: 2, C: 2, A: 2 }, 50),   // io: ho slot
      T(1, { P: 0, D: 0, C: 0, A: 0 }, 40),   // rivale senza slot
      T(2, { P: 1, D: 1, C: 1, A: 2 }, 1),    // rivale con slot ma maxBid 1 (non rilancia)
    ]
    const res = lastBidderRoles({ league: { ...DEFAULT_LEAGUE, myTeamIndex: 0 }, teams })
    expect(res.some(r => r.role === 'A')).toBe(true)
  })
  it('se un rivale può rilanciare, niente segnalazione per quel ruolo', () => {
    const teams = [
      T(0, { P: 1, D: 2, C: 2, A: 2 }, 50),
      T(1, { P: 0, D: 0, C: 0, A: 3 }, 80),   // rivale con slot A e crediti -> può rilanciare
    ]
    const res = lastBidderRoles({ league: { ...DEFAULT_LEAGUE, myTeamIndex: 0 }, teams })
    expect(res.some(r => r.role === 'A')).toBe(false)
  })
})
