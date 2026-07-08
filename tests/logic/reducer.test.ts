import { describe, it, expect } from 'vitest'
import { reducer } from '@/state/reducer'
import { initialState } from '@/logic/storage'
import type { Player, PlayerStats } from '@/logic/types'

const mk = (id: number): Player => ({ id, nome: `G${id}`, squadra: 'Inter', ruolo: 'A', ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })
const stat = (pv: number): PlayerStats =>
  ({ pv, mv: 6, fm: 6, gf: 0, gs: 0, rp: 0, rc: 0, rPlus: 0, rMinus: 0, ass: 0, amm: 0, esp: 0, au: 0 })

describe('reducer', () => {
  it('importListone conserva fasce esistenti per Id e mette i nuovi in review', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(2)] })
    s = reducer(s, { type: 'setTier', playerId: 1, tier: 'top' })
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(3)] })
    expect(s.tiers[1]).toBe('top')
    expect(s.review).toContain(3)
  })
  it('addPurchase assegna seq crescente; removePurchase toglie', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(2)] })
    s = reducer(s, { type: 'addPurchase', playerId: 1, teamIndex: 0, price: 10 })
    s = reducer(s, { type: 'addPurchase', playerId: 2, teamIndex: 1, price: 20 })
    expect(s.purchases.map(p => p.seq)).toEqual([1, 2])
    s = reducer(s, { type: 'removePurchase', seq: 1 })
    expect(s.purchases).toHaveLength(1)
    expect(s.purchases[0].playerId).toBe(2)
  })
  it('setTier toglie il flag review', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1)] })
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(9)] })
    expect(s.review).toContain(9)
    s = reducer(s, { type: 'setTier', playerId: 9, tier: 'scommessa' })
    expect(s.review).not.toContain(9)
  })
  it('primo import propone fasce senza flag automatico di review', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(9)] })
    expect(s.review).not.toContain(1)
    expect(s.review).not.toContain(9)
  })
  it('re-import che omette un giocatore con fascia mantiene la sua fascia in stato', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1), mk(2)] })
    s = reducer(s, { type: 'setTier', playerId: 2, tier: 'top' })
    s = reducer(s, { type: 'importListone', players: [mk(1)] })
    expect(s.tiers[2]).toBe('top')
  })
  it('recomputeTiers rigenera le fasce dai dati, sovrascrivendo le modifiche manuali', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1)] })
    s = reducer(s, { type: 'setTier', playerId: 1, tier: 'skip' })
    expect(s.tiers[1]).toBe('skip')
    s = reducer(s, { type: 'recomputeTiers' })
    expect(s.tiers[1]).not.toBe('skip') // ricalcolata dall'algoritmo
  })
  it('importStats ricalcola le fasce (caricare le statistiche aggiorna le fasce)', () => {
    let s = initialState()
    s = reducer(s, { type: 'importListone', players: [mk(1)] })
    s = reducer(s, { type: 'setTier', playerId: 1, tier: 'skip' })
    s = reducer(s, { type: 'importStats', stats: new Map([[1, stat(30)]]) })
    expect(s.players[0].stats).toBeDefined()
    expect(s.tiers[1]).not.toBe('skip') // fasce rigenerate col rendimento
  })
  it('setStrategyNotes e setTargetCap salvano nello stato', () => {
    let s = initialState()
    s = reducer(s, { type: 'setStrategyNotes', notes: 'Piano A: difesa modificatore' })
    expect(s.strategyNotes).toBe('Piano A: difesa modificatore')
    s = reducer(s, { type: 'setTargetCap', playerId: 5, cap: 42 })
    expect(s.targetCaps[5]).toBe(42)
  })
  it('renameTier cambia la label; addTier inserisce prima di skip', () => {
    let s = initialState()
    s = reducer(s, { type: 'renameTier', id: 'top', label: 'Fuoriclasse' })
    expect(s.tierDefs.find(d => d.id === 'top')!.label).toBe('Fuoriclasse')
    s = reducer(s, { type: 'addTier', label: 'Vice affidabile' })
    const ids = s.tierDefs.map(d => d.id)
    expect(ids.indexOf('custom-1')).toBe(ids.indexOf('skip') - 1)
    expect(s.tierDefs.find(d => d.id === 'custom-1')!.label).toBe('Vice affidabile')
  })
})
