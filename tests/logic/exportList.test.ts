import { describe, it, expect } from 'vitest'
import { shoppingListText } from '@/logic/exportList'
import { initialState } from '@/logic/storage'
import { reducer } from '@/state/reducer'
import type { Player, PriceRange } from '@/logic/types'

const mk = (id: number, nome: string, ruolo: Player['ruolo'], squadra = 'Inter'): Player =>
  ({ id, nome, squadra, ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })

describe('shoppingListText', () => {
  it('elenca gli obiettivi per ruolo con previsto e mio prezzo', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1, 'Lautaro', 'A'), mk(2, 'Svilar', 'P', 'Roma')] })
    s = reducer(s, { type: 'toggleTarget', playerId: 1 })
    s = reducer(s, { type: 'setTargetCap', playerId: 1, cap: 200 })
    const prices = new Map<number, PriceRange>([[1, { base: 180, min: 160, max: 210 }]])
    const txt = shoppingListText(s, prices)
    expect(txt).toContain('LISTA DELLA SPESA')
    expect(txt).toContain('ATTACCO')
    expect(txt).toContain('Lautaro (Inter)')
    expect(txt).toContain('previsto 160-210')
    expect(txt).toContain('mio 200')
    expect(txt).not.toContain('Svilar') // non è un obiettivo
  })
  it('senza obiettivi lo dice', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1, 'Lautaro', 'A')] })
    expect(shoppingListText(s, new Map())).toContain('nessun obiettivo')
  })
})
