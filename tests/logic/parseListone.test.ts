import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListone } from '@/logic/parseListone'

const buf = () => new Uint8Array(readFileSync('tests/fixtures/quotazioni.xlsx'))

describe('parseListone', () => {
  it('legge tutti i giocatori dal foglio Tutti', () => {
    const players = parseListone(buf())
    expect(players.length).toBeGreaterThan(500)
    const carnesecchi = players.find(p => p.id === 4431)!
    expect(carnesecchi).toMatchObject({ nome: 'Carnesecchi', squadra: 'Atalanta', ruolo: 'P', qtA: 18, qtI: 14, fvm: 80 })
  })
  it('splitta i ruoli Mantra su ;', () => {
    const players = parseListone(buf())
    const paz = players.find(p => p.id === 6875)!
    expect(paz.ruoliMantra).toEqual(['T', 'A'])
  })
  it('rifiuta un file sbagliato con messaggio chiaro', () => {
    const stats = new Uint8Array(readFileSync('tests/fixtures/statistiche.xlsx'))
    expect(() => parseListone(stats)).toThrow(/Quotazioni/)
  })
})
