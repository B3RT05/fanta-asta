import { describe, it, expect } from 'vitest'
import { chooseFormation, bestXI } from '@/logic/formation'
import type { Player, Role } from '@/logic/types'

const mk = (id: number, ruolo: Role, fvm: number): Player =>
  ({ id, nome: 'G' + id, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm })

describe('chooseFormation', () => {
  it('rosa piena -> primo modulo offensivo (3-4-3)', () => {
    expect(chooseFormation({ P: 3, D: 8, C: 8, A: 6 })).toEqual({ D: 3, C: 4, A: 3 })
  })
  it('sceglie un modulo che i giocatori consentono (5-3-2)', () => {
    expect(chooseFormation({ P: 1, D: 5, C: 3, A: 2 })).toEqual({ D: 5, C: 3, A: 2 })
  })
  it('senza portiere -> modulo di default', () => {
    expect(chooseFormation({ P: 0, D: 5, C: 5, A: 5 })).toEqual({ D: 3, C: 4, A: 3 })
  })
})

describe('bestXI', () => {
  it('piazza i migliori per FVM nel modulo scelto', () => {
    const players = [
      mk(1, 'P', 80),
      ...Array.from({ length: 6 }, (_, i) => mk(10 + i, 'D', 60 - i)),
      ...Array.from({ length: 6 }, (_, i) => mk(20 + i, 'C', 120 - i)),
      ...Array.from({ length: 6 }, (_, i) => mk(30 + i, 'A', 200 - i * 10)),
    ]
    const xi = bestXI(players)
    expect(xi.formation).toEqual({ D: 3, C: 4, A: 3 })
    expect(xi.picks.P).toHaveLength(1)
    expect(xi.picks.A).toHaveLength(3)
    expect(xi.picks.A[0].fvm).toBe(200) // il miglior attaccante è primo
  })
  it('rosa incompleta: meno giocatori del modulo', () => {
    const xi = bestXI([mk(1, 'P', 80), mk(2, 'A', 100)])
    expect(xi.picks.P).toHaveLength(1)
    expect(xi.picks.A.length).toBeLessThanOrEqual(xi.formation.A)
    expect(xi.picks.D).toHaveLength(0)
  })
})
