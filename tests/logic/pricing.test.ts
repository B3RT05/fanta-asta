import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'
import { proposeTiers } from '@/logic/tiering'
import { predictPrices } from '@/logic/pricing'
import { DEFAULT_LEAGUE } from '@/logic/types'

const players = parseListone(new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx')))
const { tiers } = proposeTiers(players)
const prices = predictPrices(players, tiers, DEFAULT_LEAGUE)

describe('predictPrices', () => {
  it('dimensione pool = slot x squadre per ruolo', () => {
    const pooled = players.filter(p => prices.has(p.id))
    const att = pooled.filter(p => p.ruolo === 'A').length
    expect(att).toBe(6 * 8)
  })
  it('la somma dei prezzi base ~ crediti totali (entro 10%)', () => {
    const total = [...prices.values()].reduce((s, r) => s + r.base, 0)
    expect(total).toBeGreaterThan(4000 * 0.9)
    expect(total).toBeLessThan(4000 * 1.1)
  })
  it('range valido: 1 <= min <= base <= max', () => {
    for (const r of prices.values()) {
      expect(r.min).toBeGreaterThanOrEqual(1)
      expect(r.min).toBeLessThanOrEqual(r.base)
      expect(r.base).toBeLessThanOrEqual(r.max)
    }
  })
  it('il top attaccante costa piu del top portiere', () => {
    const best = (role: string) => Math.max(...players.filter(p => p.ruolo === role && prices.has(p.id)).map(p => prices.get(p.id)!.max))
    expect(best('A')).toBeGreaterThan(best('P'))
  })
})
