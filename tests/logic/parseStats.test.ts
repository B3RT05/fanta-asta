import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'
import { parseStats, mergeStats } from '@/logic/parseStats'

const statsBuf = () => new Uint8Array(readFileSync('tests/fixtures/statistiche.xlsx'))
const quotBuf = () => new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx'))

describe('parseStats + mergeStats', () => {
  it('legge le statistiche per Id', () => {
    const stats = parseStats(statsBuf())
    expect(stats.get(4431)).toMatchObject({ pv: 37, fm: 5.58, gs: 35 })
  })
  it('rifiuta il file quotazioni', () => {
    expect(() => parseStats(quotBuf())).toThrow(/statistiche/i)
  })
  it('merge: copre tutto il listone e non muta gli input', () => {
    const players = parseListone(quotBuf())
    const merged = mergeStats(players, parseStats(statsBuf()))
    expect(merged.every(p => p.stats !== undefined)).toBe(true)
    expect(players[0].stats).toBeUndefined() // no mutazione
  })
})
