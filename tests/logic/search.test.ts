import { describe, it, expect } from 'vitest'
import { matchesQuery, normalizeText } from '@/logic/search'

describe('normalizeText', () => {
  it('toglie accenti e punteggiatura, minuscolo', () => {
    expect(normalizeText('Montipò')).toBe('montipo')
    expect(normalizeText('Milinkovic-Savic V.')).toBe('milinkovic savic v')
    expect(normalizeText('Zè Pedro')).toBe('ze pedro')
  })
})

describe('matchesQuery', () => {
  const p = (nome: string, squadra: string) => [nome, squadra]
  it('trova per cognome ignorando gli accenti', () => {
    expect(matchesQuery(p('Montipò', 'Hellas'), 'montipo')).toBe(true)
    expect(matchesQuery(p('Lucumì', 'Bologna'), 'lucumi')).toBe(true)
  })
  it('ignora trattini e punti', () => {
    expect(matchesQuery(p('Milinkovic-Savic V.', 'Napoli'), 'milinkovic savic')).toBe(true)
  })
  it('trova anche per squadra e a parole (AND)', () => {
    expect(matchesQuery(p('Rrahmani', 'Napoli'), 'napoli')).toBe(true)
    expect(matchesQuery(p('Rrahmani', 'Napoli'), 'rrah napoli')).toBe(true)
    expect(matchesQuery(p('Rrahmani', 'Napoli'), 'rrah milan')).toBe(false)
  })
  it('query vuota -> tutti', () => {
    expect(matchesQuery(p('Chiunque', 'Inter'), '')).toBe(true)
    expect(matchesQuery(p('Chiunque', 'Inter'), '   ')).toBe(true)
  })
})
