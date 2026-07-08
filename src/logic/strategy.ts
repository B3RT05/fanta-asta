import { normalizeText } from './search'
import type { LeagueConfig, Player, PriceRange, Role, TierId } from './types'
import type { Tag } from './tags'

export interface GeneratedStrategy {
  rolePlan: Record<Role, number>
  targets: number[]
  caps: Record<number, number>
  notes: string
  recognized: string[]
}

const ROLE_NAME: Record<Role, string> = { P: 'Portieri', D: 'Difensori', C: 'Centrocampo', A: 'Attacco' }
const TIER_RANK: Record<string, number> = { top: 5, semitop: 4, titolare: 3, scommessa: 2, riempitivo: 1, skip: 0 }

// ripartizione di base (%) — attacco-oriented tipico del Classic
const BASE: Record<Role, number> = { P: 0.08, D: 0.18, C: 0.34, A: 0.40 }

// tag preferiti per intento (per la scelta degli obiettivi)
const PREF: Record<string, string[]> = {
  attacco: ['bomber', 'cecchino'],
  difesa: ['modificatore', 'dbonus'],
  centrocampo: ['bonusman', 'assistman', 'rigorista'],
}

export function generateStrategy(
  description: string, players: Player[], tiers: Record<number, TierId>,
  tagsMap: Map<number, Tag[]>, prices: Map<number, PriceRange>, league: LeagueConfig,
): GeneratedStrategy {
  const q = normalizeText(description)
  const has = (...ks: string[]) => ks.some(k => q.includes(k))
  const recognized: string[] = []

  const w: Record<Role, number> = { ...BASE }
  const shift = (from: Role[], to: Role, amt: number) => {
    const take = amt / from.length
    for (const f of from) w[f] = Math.max(0.04, w[f] - take)
    w[to] += amt
  }

  if (has('attacc', 'bomber', 'offensiv', 'gol')) { shift(['D', 'C'], 'A', 0.10); recognized.push('attacco') }
  if (has('difes', 'modificator', 'difensiv')) { shift(['A'], 'D', 0.10); recognized.push('difesa') }
  if (has('centrocampo', 'mediana', 'regist')) { shift(['A'], 'C', 0.08); recognized.push('centrocampo') }
  if (has('portiere low cost', 'porta low cost', 'portiere economico', 'porta economic')) { shift([], 'A', 0); w.A += w.P - 0.05; w.P = 0.05; recognized.push('portiere low cost') }
  if (has('portiere forte', 'portiere top', 'grande portiere')) { shift(['C'], 'P', 0.05); recognized.push('portiere forte') }
  const wantScommesse = has('scommess', 'giovan', 'rischi')
  if (wantScommesse) recognized.push('scommesse')
  if (has('equilibrat', 'bilanciat')) recognized.push('equilibrato')

  // normalizza e converti in crediti (somma == budget)
  const tot = (['P', 'D', 'C', 'A'] as Role[]).reduce((s, r) => s + w[r], 0)
  const rolePlan: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 }
  const roles: Role[] = ['P', 'D', 'C', 'A']
  let acc = 0
  roles.forEach((r, i) => {
    if (i < 3) { rolePlan[r] = Math.round(league.budget * w[r] / tot); acc += rolePlan[r] }
    else rolePlan[r] = league.budget - acc // l'ultimo prende il resto (somma esatta)
  })

  // selezione obiettivi per ruolo, entro il budget di reparto
  const targets: number[] = []
  const caps: Record<number, number> = {}
  for (const role of roles) {
    const pref = PREF[role === 'A' ? 'attacco' : role === 'D' ? 'difesa' : role === 'C' ? 'centrocampo' : 'x'] ?? []
    const cand = players.filter(p => p.ruolo === role).map(p => {
      const tags = tagsMap.get(p.id) ?? []
      const tagBonus = tags.some(t => pref.includes(t.id)) ? 1 : 0
      const scommBonus = wantScommesse && tiers[p.id] === 'scommessa' ? 1 : 0
      return { id: p.id, fvm: p.fvm, rank: TIER_RANK[tiers[p.id]] ?? 0, tagBonus, scommBonus, price: prices.get(p.id)?.base ?? 1 }
    }).sort((a, b) =>
      (b.rank + b.tagBonus + b.scommBonus) - (a.rank + a.tagBonus + a.scommBonus) || b.fvm - a.fvm)

    const maxT = Math.max(2, Math.ceil(league.slots[role] * 0.6))
    let spent = 0
    for (const c of cand) {
      if (targets.length && spent >= rolePlan[role] * 0.9 && (targets.filter(id => players.find(p => p.id === id)?.ruolo === role).length) >= 2) break
      if (targets.filter(id => players.find(p => p.id === id)?.ruolo === role).length >= maxT) break
      targets.push(c.id); caps[c.id] = c.price; spent += c.price
    }
  }

  const pct = (r: Role) => Math.round(100 * rolePlan[r] / league.budget)
  const notes = [
    `Strategia generata${recognized.length ? ' (riconosciuto: ' + recognized.join(', ') + ')' : ''}.`,
    '',
    'Ripartizione budget:',
    ...roles.map(r => `  ${ROLE_NAME[r]}: ${rolePlan[r]} crediti (${pct(r)}%)`),
    '',
    `Obiettivi selezionati: ${targets.length} giocatori (vedi lista della spesa, con il "max che pago" precompilato al prezzo previsto).`,
    'Ritocca a mano budget, obiettivi e tetti: questa è una bozza di partenza.',
  ].join('\n')

  return { rolePlan, targets, caps, notes, recognized }
}
