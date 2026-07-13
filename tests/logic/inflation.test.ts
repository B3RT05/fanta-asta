import { describe, it, expect } from 'vitest'
import { roleInflation } from '@/logic/inflation'
import type { Player, PriceRange, Purchase } from '@/logic/types'

const P = (id: number, ruolo: Player['ruolo']): Player =>
  ({ id, nome: 'G' + id, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 50 })
const players: Player[] = [
  ...Array.from({ length: 6 }, (_, i) => P(300 + i, 'D')),
  ...Array.from({ length: 6 }, (_, i) => P(100 + i, 'A')),
]
// previsto: 20 per tutti (giocatori "veri")
const prices = new Map<number, PriceRange>(players.map(p => [p.id, { base: 20, min: 16, max: 24 }]))
const pu = (seq: number, playerId: number, price: number): Purchase =>
  ({ seq, playerId, teamIndex: seq % 4, price })

describe('roleInflation', () => {
  it('segnala la BOLLA quando la difesa si paga molto sopra il previsto', () => {
    const purchases = [pu(1, 300, 34), pu(2, 301, 32), pu(3, 302, 30)] // ~+58% sul previsto 20
    const inf = roleInflation(purchases, players, prices)
    const d = inf.find(x => x.role === 'D')!
    expect(d.level).toBe('bolla')
    expect(d.message).toMatch(/2ª fascia|accumula/i)
  })
  it('segnala i SALDI quando si paga sotto il previsto', () => {
    const purchases = [pu(1, 300, 12), pu(2, 301, 14), pu(3, 302, 13)] // ~−35%
    const d = roleInflation(purchases, players, prices).find(x => x.role === 'D')!
    expect(d.level).toBe('saldi')
  })
  it('non produce nulla sotto il campione minimo (2 acquisti)', () => {
    const purchases = [pu(1, 300, 40), pu(2, 301, 40)]
    expect(roleInflation(purchases, players, prices).some(x => x.role === 'D')).toBe(false)
  })
  it('ignora i riempitivi da 1-2 crediti (non fanno mercato)', () => {
    const cheap = new Map<number, PriceRange>(players.map(p => [p.id, { base: 1, min: 1, max: 2 }]))
    const purchases = [pu(1, 300, 1), pu(2, 301, 2), pu(3, 302, 1)]
    expect(roleInflation(purchases, players, cheap)).toHaveLength(0)
  })
})
