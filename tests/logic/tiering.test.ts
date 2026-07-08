import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'
import { parseStats, mergeStats } from '@/logic/parseStats'
import { proposeTiers } from '@/logic/tiering'
import type { Player, PlayerStats } from '@/logic/types'

const players = mergeStats(
  parseListone(new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx'))),
  parseStats(new Uint8Array(readFileSync('tests/fixtures/statistiche.xlsx'))),
)

describe('proposeTiers (listone reale)', () => {
  const { tiers, review } = proposeTiers(players)
  it('assegna una fascia a ogni giocatore', () => {
    expect(Object.keys(tiers).length).toBe(players.length)
  })
  it('i big sono top', () => {
    expect(tiers[2764]).toBe('top') // Lautaro: bomber titolare
  })
  it('senza statistiche con FVM alto -> scommessa (quando gli ALTRI hanno le stats)', () => {
    const fake = players.map(p => p.id === 7126 ? { ...p, stats: undefined } : p)
    const t = proposeTiers(fake).tiers
    expect(t[7126]).toBe('scommessa') // Baturina, FVM 95
  })
  it('FALLBACK: senza NESSUNA statistica ripiega su fasce da FVM (non tutte scommessa)', () => {
    const noStats = players.map(p => ({ ...p, stats: undefined }))
    const { tiers } = proposeTiers(noStats)
    const counts: Record<string, number> = {}
    for (const p of noStats) counts[tiers[p.id]] = (counts[tiers[p.id]] ?? 0) + 1
    expect(counts.top ?? 0).toBeGreaterThan(0)        // esistono dei Top
    expect(counts.semitop ?? 0).toBeGreaterThan(0)    // esistono dei Semitop
    expect(counts.scommessa ?? 0).toBeLessThan(noStats.length / 2) // le scommesse NON sono la maggioranza
  })
  it('segnala casi da rivedere', () => {
    expect(review.length).toBeGreaterThan(0)
    expect(review.every(id => tiers[id] !== undefined)).toBe(true)
  })
})

// ---- clusterizzazione per-ruolo (casi sintetici deterministici) ----
const st = (o: Partial<PlayerStats>): PlayerStats =>
  ({ pv: 30, mv: 6, fm: 6, gf: 0, gs: 0, rp: 0, rc: 0, rPlus: 0, rMinus: 0, ass: 0, amm: 0, esp: 0, au: 0, ...o })
const P = (id: number, ruolo: Player['ruolo'], stats: PlayerStats | undefined, fvm = 50): Player =>
  ({ id, nome: 'G' + id, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm, stats })
const clones = (ruolo: Player['ruolo'], n: number, base: Partial<PlayerStats>, startId: number) =>
  Array.from({ length: n }, (_, i) => P(startId + i, ruolo, st(base)))

describe('proposeTiers — fasce per ruolo', () => {
  it('Attaccanti: pesano gol+fantamedia+presenze (bomber=Top, scarso=Riempitivo)', () => {
    const pool = [
      ...clones('A', 10, { gf: 5, fm: 6, pv: 28 }, 100),
      P(200, 'A', st({ gf: 25, fm: 8, pv: 36 })),  // bomber
      P(201, 'A', st({ gf: 0, fm: 5, pv: 16 })),   // scarso ma valutabile
    ]
    const { tiers } = proposeTiers(pool)
    expect(tiers[200]).toBe('top')
    expect(tiers[201]).not.toBe('top')
    expect(tiers[201]).not.toBe('semitop')
  })

  it('Centrocampisti: contano fantamedia e presenze, NON i gol', () => {
    const withGoals = P(300, 'C', st({ gf: 15, fm: 6.5, pv: 30 }))
    const noGoals = P(301, 'C', st({ gf: 0, fm: 6.5, pv: 30 }))
    const pool = [...clones('C', 10, { fm: 6, pv: 28 }, 310), withGoals, noGoals]
    const { tiers } = proposeTiers(pool)
    expect(tiers[300]).toBe(tiers[301]) // gol irrilevanti -> stessa fascia
  })

  it('Difensori: a parità di voti, i bonus (gol+assist) alzano la fascia', () => {
    const bonusHero = P(400, 'D', st({ fm: 6, mv: 6, pv: 30, gf: 6, ass: 6 }))
    const pool = [...clones('D', 11, { fm: 6, mv: 6, pv: 30, gf: 0, ass: 0 }, 410), bonusHero]
    const { tiers } = proposeTiers(pool)
    expect(tiers[400]).toBe('top')
  })

  it('Portieri: a parità di voti, chi subisce meno gol/gara (proxy clean sheet) sale', () => {
    const muro = P(500, 'P', st({ fm: 6, mv: 6, pv: 30, gs: 10 }))       // 0.33 gol/gara
    const colabrodo = P(501, 'P', st({ fm: 6, mv: 6, pv: 30, gs: 50 }))  // 1.67 gol/gara
    const pool = [...clones('P', 10, { fm: 6, mv: 6, pv: 30, gs: 30 }, 510), muro, colabrodo]
    const { tiers } = proposeTiers(pool)
    expect(tiers[500]).toBe('top')
    expect(tiers[501]).not.toBe('top')
  })
})
