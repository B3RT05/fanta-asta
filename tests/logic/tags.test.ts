import { describe, it, expect } from 'vitest'
import { computeTags, dominantTags, tagsCompatible, TAG_ROLES, TAG_DESCRIPTIONS } from '@/logic/tags'
import type { Player, PlayerStats } from '@/logic/types'

const st = (o: Partial<PlayerStats>): PlayerStats =>
  ({ pv: 30, mv: 6, fm: 6, gf: 0, gs: 0, rp: 0, rc: 0, rPlus: 0, rMinus: 0, ass: 0, amm: 0, esp: 0, au: 0, ...o })
const P = (id: number, ruolo: Player['ruolo'], stats: PlayerStats | undefined, o: Partial<Player> = {}): Player =>
  ({ id, nome: 'G' + id, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 50, stats, ...o })
const clones = (ruolo: Player['ruolo'], n: number, base: Partial<PlayerStats>, startId: number) =>
  Array.from({ length: n }, (_, i) => P(startId + i, ruolo, st(base)))
const has = (tags: { id: string }[] | undefined, id: string) => !!tags?.some(t => t.id === id)

describe('computeTags', () => {
  it('Attaccante col massimo dei gol -> Bomber', () => {
    const bomber = P(1, 'A', st({ gf: 25 }))
    const map = computeTags([...clones('A', 10, { gf: 3 }, 100), bomber])
    expect(has(map.get(1), 'bomber')).toBe(true)
  })
  it('Attaccante con molti assist e pochi gol -> Assist-man', () => {
    const assist = P(2, 'A', st({ ass: 14, gf: 1 }))
    const map = computeTags([...clones('A', 10, { ass: 2, gf: 5 }, 200), assist])
    expect(has(map.get(2), 'assistman')).toBe(true)
  })
  it('Difensore con tanti gol+assist -> Da bonus', () => {
    const db = P(3, 'D', st({ gf: 5, ass: 6 }))
    const map = computeTags([...clones('D', 10, { gf: 0, ass: 0 }, 300), db])
    expect(has(map.get(3), 'dbonus')).toBe(true)
  })
  it('Portiere che subisce poco -> Saracinesca; che subisce tanto -> colabrodo', () => {
    const muro = P(4, 'P', st({ pv: 30, gs: 10 }))
    const cola = P(5, 'P', st({ pv: 30, gs: 55 }))
    const map = computeTags([...clones('P', 10, { pv: 30, gs: 32 }, 400), muro, cola])
    expect(has(map.get(4), 'saracinesca')).toBe(true)
    expect(has(map.get(5), 'colabrodo')).toBe(true)
  })
  it('tag trasversali: rigorista, in ascesa, sbaglia-rigori, da malus', () => {
    const map = computeTags([
      P(6, 'A', st({ rc: 4, rPlus: 4 })),
      P(7, 'C', st({}), { qtA: 20, qtI: 8 }),   // diff +12 -> ascesa
      P(8, 'A', st({ rMinus: 3 })),
      P(9, 'C', st({ amm: 9 })),
    ])
    expect(has(map.get(6), 'rigorista')).toBe(true)
    expect(has(map.get(7), 'ascesa')).toBe(true)
    expect(has(map.get(8), 'sbagliarigori')).toBe(true)
    expect(has(map.get(9), 'indisciplinato')).toBe(true)
  })
  it('senza statistiche: solo tag di mercato, niente tag di rendimento', () => {
    const map = computeTags([P(10, 'A', undefined, { qtA: 25, qtI: 10 })]) // ascesa, ma no bomber
    expect(has(map.get(10), 'ascesa')).toBe(true)
    expect(has(map.get(10), 'bomber')).toBe(false)
  })
})

describe('descrizioni', () => {
  it('ogni tag ha una descrizione (tooltip)', () => {
    for (const id of Object.keys(TAG_ROLES))
      expect((TAG_DESCRIPTIONS[id] ?? '').length).toBeGreaterThan(0)
  })
})

describe('tagsCompatible', () => {
  it('stesso ruolo o con tag trasversali -> true (E)', () => {
    expect(tagsCompatible(['bomber', 'cecchino'])).toBe(true)       // A + A
    expect(tagsCompatible(['bomber', 'titolarissimo'])).toBe(true)  // A + trasversale
    expect(tagsCompatible(['dbonus', 'modificatore'])).toBe(true)   // D + D
    expect(tagsCompatible(['rigorista'])).toBe(true)
  })
  it('ruoli disgiunti -> false (O)', () => {
    expect(tagsCompatible(['bomber', 'modificatore'])).toBe(false)  // A vs D
    expect(tagsCompatible(['saracinesca', 'goleador'])).toBe(false) // P vs C
  })
})

describe('dominantTags', () => {
  it('riassume i tag pro più frequenti in un gruppo di acquisti', () => {
    const map = new Map([
      [1, [{ id: 'bomber', label: 'Bomber', kind: 'pro' as const }]],
      [2, [{ id: 'bomber', label: 'Bomber', kind: 'pro' as const }]],
      [3, [{ id: 'rigorista', label: 'Rigorista', kind: 'pro' as const }]],
    ])
    const dom = dominantTags([1, 2, 3], map)
    expect(dom[0]).toEqual({ label: 'Bomber', count: 2 })
  })
})
