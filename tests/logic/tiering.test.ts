import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'
import { parseStats, mergeStats } from '@/logic/parseStats'
import { proposeTiers } from '@/logic/tiering'

const players = mergeStats(
  parseListone(new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx'))),
  parseStats(new Uint8Array(readFileSync('tests/fixtures/statistiche.xlsx'))),
)

describe('proposeTiers', () => {
  const { tiers, review } = proposeTiers(players)
  it('assegna una fascia a ogni giocatore', () => {
    expect(Object.keys(tiers).length).toBe(players.length)
  })
  it('i big sono top', () => {
    expect(tiers[2764]).toBe('top') // Lautaro: FVM 315, titolare
  })
  it('senza statistiche con FVM alto -> scommessa', () => {
    const fake = players.map(p => p.id === 7126 ? { ...p, stats: undefined } : p)
    const t = proposeTiers(fake).tiers
    expect(t[7126]).toBe('scommessa') // Baturina, FVM 95
  })
  it('segnala casi da rivedere', () => {
    expect(review.length).toBeGreaterThan(0)
    expect(review.every(id => tiers[id] !== undefined)).toBe(true)
  })
})
