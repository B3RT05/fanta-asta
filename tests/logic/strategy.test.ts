import { describe, it, expect } from 'vitest'
import { generateStrategy } from '@/logic/strategy'
import { computeTags } from '@/logic/tags'
import { predictPrices } from '@/logic/pricing'
import { DEFAULT_LEAGUE, type Player, type PlayerStats, type TierId } from '@/logic/types'

const st = (o: Partial<PlayerStats>): PlayerStats =>
  ({ pv: 30, mv: 6, fm: 6, gf: 0, gs: 0, rp: 0, rc: 0, rPlus: 0, rMinus: 0, ass: 0, amm: 0, esp: 0, au: 0, ...o })
const P = (id: number, ruolo: Player['ruolo'], fvm: number, stats?: PlayerStats): Player =>
  ({ id, nome: 'G' + id, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm, stats })

// listone giocattolo con abbastanza giocatori per ruolo
const players: Player[] = [
  ...Array.from({ length: 6 }, (_, i) => P(100 + i, 'A', 200 - i * 20, st({ gf: 20 - i * 2, fm: 7, pv: 32 }))),
  ...Array.from({ length: 8 }, (_, i) => P(200 + i, 'C', 120 - i * 10, st({ ass: 8 - i, fm: 6.4, pv: 30 }))),
  ...Array.from({ length: 8 }, (_, i) => P(300 + i, 'D', 60 - i * 5, st({ mv: 6.4 - i * 0.1, fm: 6.2, pv: 34 }))),
  ...Array.from({ length: 5 }, (_, i) => P(400 + i, 'P', 80 - i * 15, st({ gs: 20 + i * 5, pv: 34 }))),
]
const tiers: Record<number, TierId> = {}
for (const p of players) tiers[p.id] = p.fvm > 100 ? 'top' : p.fvm > 40 ? 'semitop' : 'titolare'
const tagsMap = computeTags(players)
const prices = predictPrices(players, tiers, DEFAULT_LEAGUE)

describe('generateStrategy', () => {
  it('"tutto attacco" -> budget attacco il più alto e obiettivi in attacco', () => {
    const s = generateStrategy('Voglio puntare tutto sull\'attacco, attaccanti forti', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    const max = Math.max(s.rolePlan.P, s.rolePlan.D, s.rolePlan.C, s.rolePlan.A)
    expect(s.rolePlan.A).toBe(max)
    expect(s.targets.some(id => players.find(p => p.id === id)?.ruolo === 'A')).toBe(true)
    expect(s.recognized).toContain('attacco')
  })
  it('"difesa da modificatore" -> difesa rinforzata', () => {
    const s = generateStrategy('difesa da modificatore, tanti difensori affidabili', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    const balanced = generateStrategy('', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    expect(s.rolePlan.D).toBeGreaterThan(balanced.rolePlan.D)
    expect(s.recognized).toContain('difesa')
  })
  it('"portiere low cost" -> budget portieri minimo', () => {
    const s = generateStrategy('portiere low cost', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    const balanced = generateStrategy('', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    expect(s.rolePlan.P).toBeLessThan(balanced.rolePlan.P)
  })
  it('il budget totale pianificato = budget della lega', () => {
    const s = generateStrategy('equilibrato', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    const tot = s.rolePlan.P + s.rolePlan.D + s.rolePlan.C + s.rolePlan.A
    expect(tot).toBe(DEFAULT_LEAGUE.budget)
  })
  it('produce sempre obiettivi e note', () => {
    const s = generateStrategy('', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    expect(s.targets.length).toBeGreaterThan(0)
    expect(s.notes.length).toBeGreaterThan(20)
  })
})
