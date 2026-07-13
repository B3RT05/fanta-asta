import { describe, it, expect } from 'vitest'
import { meterValues } from '@/logic/meters'
import type { Player, PlayerStats, Role } from '@/logic/types'

const st = (o: Partial<PlayerStats>): PlayerStats =>
  ({ pv: 30, mv: 6, fm: 6, gf: 0, gs: 0, rp: 0, rc: 0, rPlus: 0, rMinus: 0, ass: 0, amm: 0, esp: 0, au: 0, ...o })
const P = (id: number, r: Role, fm: number, pv = 30): Player =>
  ({ id, nome: 'G' + id, squadra: 'Inter', ruolo: r, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 50, stats: st({ fm, pv }) })

describe('meterValues', () => {
  it('rendimento relativo al ruolo: il miglior portiere è pieno anche se fantamedia bassa', () => {
    const players = [P(1, 'P', 5.7), P(2, 'P', 5.1), P(3, 'A', 8.0), P(4, 'A', 6.0)]
    const m = meterValues(players)
    expect(m.get(1)!.rendimento).toBe(1)  // miglior portiere -> barra piena
    expect(m.get(2)!.rendimento).toBe(0)  // peggior portiere
    expect(m.get(3)!.rendimento).toBe(1)  // miglior attaccante (scala separata)
  })
  it('titolarità dalle presenze; senza stats -> null', () => {
    const players = [P(1, 'C', 6.5, 34), { ...P(2, 'C', 6, 0), stats: undefined }]
    const m = meterValues(players)
    expect(m.get(1)!.titolarita).toBe(1)
    expect(m.get(2)!.titolarita).toBeNull()
    expect(m.get(2)!.rendimento).toBeNull()
  })
})
