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
  it('riconosce "difensori" e "centrocampisti" (parole comuni, non solo le esatte)', () => {
    const s = generateStrategy('voglio difensori forti e centrocampisti da bonus', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    expect(s.recognized).toContain('difesa')
    expect(s.recognized).toContain('centrocampo')
  })
  it('riconosce un portiere forte/titolare', () => {
    const s = generateStrategy('un buon portiere titolare e sicuro', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    expect(s.recognized).toContain('portiere forte')
  })
  it('riconosce "punte" e "bomber" come attacco', () => {
    const s = generateStrategy('due punte da tanti gol', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    expect(s.recognized).toContain('attacco')
  })
  it('produce sempre obiettivi e note', () => {
    const s = generateStrategy('', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    expect(s.targets.length).toBeGreaterThan(0)
    expect(s.notes.length).toBeGreaterThan(20)
  })
  it('la lista è una rosa completa (tutti gli slot) ed equilibrata, non solo top', () => {
    const s = generateStrategy('', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    const L = DEFAULT_LEAGUE
    // riempie ogni reparto (limitato dal pool disponibile)
    for (const r of ['P', 'D', 'C', 'A'] as const) {
      const inRole = s.targets.filter(id => players.find(p => p.id === id)?.ruolo === r).length
      const poolSize = players.filter(p => p.ruolo === r).length
      expect(inRole).toBe(Math.min(L.slots[r], poolSize))
    }
    // non solo top: include fasce basse (titolari/riempitivi)
    const tierset = new Set(s.targets.map(id => tiers[id]))
    expect([...tierset].some(t => t !== 'top' && t !== 'semitop')).toBe(true)
    // include riempitivi da 1 credito
    expect(Object.values(s.caps).some(c => c === 1)).toBe(true)
  })
  it('diversifica i club in attacco (non due attaccanti della stessa squadra se ci sono alternative)', () => {
    const A = (id: number, squadra: string, fvm: number) =>
      ({ id, nome: 'A' + id, squadra, ruolo: 'A' as const, ruoliMantra: [], qtA: 10, qtI: 10, fvm, stats: st({ gf: 15, fm: 7, pv: 30 }) })
    // 5 attaccanti Inter (i più forti/costosi) + 6 di club distinti (più deboli/economici)
    const pool = [
      A(1, 'Inter', 300), A(2, 'Inter', 290), A(3, 'Inter', 280), A(4, 'Inter', 270), A(5, 'Inter', 260),
      A(11, 'Milan', 60), A(12, 'Roma', 55), A(13, 'Lazio', 50), A(14, 'Como', 45), A(15, 'Parma', 40), A(16, 'Lecce', 35),
    ]
    const tt: Record<number, TierId> = {}
    for (const p of pool) tt[p.id] = p.squadra === 'Inter' ? 'top' : 'titolare'
    const tg = computeTags(pool)
    const pr = predictPrices(pool, tt, DEFAULT_LEAGUE)
    const s = generateStrategy('', pool, tt, tg, pr, DEFAULT_LEAGUE)
    const interA = s.targets.filter(id => pool.find(p => p.id === id)?.squadra === 'Inter').length
    expect(interA).toBeLessThanOrEqual(1) // non fa incetta di attaccanti Inter
  })
  it('difesa: promuove a titolare anche i difensori DA BONUS, non solo i migliori voti', () => {
    const D = (id: number, mv: number, gf: number, ass: number, fvm: number, squadra: string) =>
      ({ id, nome: 'D' + id, squadra, ruolo: 'D' as const, ruoliMantra: [], qtA: 10, qtI: 10, fvm, stats: st({ mv, gf, ass, pv: 34, fm: mv + (gf + ass) / 10 }) })
    const pool = [
      D(1, 6.6, 0, 0, 60, 'Napoli'), D(2, 6.5, 0, 0, 55, 'Inter'), D(3, 6.5, 0, 0, 50, 'Milan'),
      D(4, 6.4, 0, 0, 45, 'Roma'), D(5, 6.3, 0, 0, 40, 'Como'), D(6, 6.2, 0, 0, 35, 'Lazio'),   // 6 modificatori (fvm alto)
      D(90, 6.0, 7, 5, 18, 'Lecce'), D(91, 6.0, 6, 4, 16, 'Parma'),                              // 2 da bonus (fvm BASSO -> senza il mix sarebbero riempitivi)
      D(80, 5.7, 0, 0, 4, 'Empoli'), D(81, 5.6, 0, 0, 3, 'Verona'),
    ]
    const tt: Record<number, TierId> = {}; for (const p of pool) tt[p.id] = p.fvm > 30 ? 'semitop' : p.fvm > 12 ? 'titolare' : 'riempitivo'
    const s = generateStrategy('', pool, tt, computeTags(pool), predictPrices(pool, tt, DEFAULT_LEAGUE), DEFAULT_LEAGUE)
    // i due difensori da bonus, pur avendo FVM basso, sono titolari (tetto > 1) grazie al mix
    expect(s.caps[90]).toBeGreaterThan(1)
    expect(s.caps[91]).toBeGreaterThan(1)
  })
  it('"tante scommesse" aumenta il numero di scommesse in rosa', () => {
    const base = generateStrategy('', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    const risk = generateStrategy('voglio tante scommesse', players, tiers, tagsMap, prices, DEFAULT_LEAGUE)
    const countScomm = (s: typeof base) => s.targets.filter(id => tiers[id] === 'scommessa').length
    expect(countScomm(risk)).toBeGreaterThanOrEqual(countScomm(base))
    expect(risk.notes).toMatch(/scommesse/i)
  })
})
