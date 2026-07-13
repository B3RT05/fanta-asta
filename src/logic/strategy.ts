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

// titolari "garantiti" per reparto (i migliori; il resto della rosa = scommesse + riempitivi)
const STARTERS: Record<Role, number> = { P: 1, D: 5, C: 5, A: 3 }

// max giocatori dallo stesso club per reparto: in attacco diversifica (se
// la squadra non segna resti a secco), a centrocampo tollera coppie; in
// difesa/porta nessun limite (portiere+difensori stessa squadra = modificatore).
const CLUB_CAP: Record<Role, number> = { P: 3, D: 8, C: 2, A: 1 }


// tag preferiti per intento (per la scelta degli obiettivi)
const PREF: Record<string, string[]> = {
  attacco: ['bomber', 'cecchino'],
  difesa: ['modificatore', 'dbonus'],
  centrocampo: ['bonusman', 'assistman', 'rigorista'],
}

export function generateStrategy(
  description: string, players: Player[], tiers: Record<number, TierId>,
  tagsMap: Map<number, Tag[]>, prices: Map<number, PriceRange>, league: LeagueConfig,
  userCaps: Record<number, number> = {},
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

  // radici ampie + sinonimi (attaccanti, difensori, centrocampisti, ...)
  if (has('attacc', 'bomber', 'punt', 'goleador', 'offensiv', 'gol', 'segna')) { shift(['D', 'C'], 'A', 0.10); recognized.push('attacco') }
  if (has('dife', 'terzin', 'central', 'difensiv', 'modificator', 'arretrat')) { shift(['A'], 'D', 0.10); recognized.push('difesa') }
  if (has('centrocamp', 'mediana', 'mezzala', 'regist', 'trequart', 'mediano', 'in mezzo')) { shift(['A'], 'C', 0.08); recognized.push('centrocampo') }
  const port = has('portier', 'estremo difensore') || / porta /.test(' ' + q + ' ')
  if (port && has('low cost', 'economic', 'risparmi', 'spendo poco', '1 credito', 'un credito', 'poco')) {
    w.A += Math.max(0, w.P - 0.05); w.P = 0.05; recognized.push('portiere low cost')
  } else if (port && has('forte', 'top', 'titolare', 'sicur', 'affidabil', 'big', 'buon')) {
    shift(['C'], 'P', 0.05); recognized.push('portiere forte')
  }
  const wantScommesse = has('scommess', 'giovan', 'rischi', 'sorpres')
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

  // rosa completa ed equilibrata: riempi TUTTI gli slot di ogni reparto con
  // titolari garantiti + qualche scommessa + riempitivi da 1 credito.
  const scommPerRole: Record<Role, number> = wantScommesse
    ? { P: 0, D: 2, C: 2, A: 2 }
    : { P: 0, D: 1, C: 1, A: 1 }
  const targets: number[] = []
  const caps: Record<number, number> = {}
  let nStarters = 0, nScomm = 0, nFiller = 0
  const big = new Set(league.bigClubs) // le "big" = squadre forti configurate nella lega

  for (const role of roles) {
    const slots = league.slots[role]
    const pref = PREF[role === 'A' ? 'attacco' : role === 'D' ? 'difesa' : role === 'C' ? 'centrocampo' : 'x'] ?? []
    const pool = players.filter(p => p.ruolo === role)
    const meta = new Map(pool.map(p => {
      const tags = tagsMap.get(p.id) ?? []
      return [p.id, {
        rank: TIER_RANK[tiers[p.id]] ?? 0,
        tagBonus: tags.some(t => pref.includes(t.id)) ? 1 : 0,
        isScomm: tiers[p.id] === 'scommessa' || tags.some(t => t.id === 'ascesa'),
        price: prices.get(p.id)?.base ?? 1,
        fvm: p.fvm,
        mv: p.stats?.mv ?? 0,
        bonusVal: (p.stats?.gf ?? 0) + (p.stats?.ass ?? 0),
      }]
    }))
    const m = (id: number) => meta.get(id)!
    const used = new Set<number>()
    const clubCount = new Map<string, number>()
    const clubCap = CLUB_CAP[role]
    // costo REALE: prezzo impostato dall'utente, altrimenti prezzo previsto (mai scalato)
    const cost = (p: Player) => Math.max(1, Math.round(userCaps[p.id] ?? m(p.id).price))

    // selezione entro il budget di reparto ai prezzi reali: lascia sempre 1
    // credito per ogni altro slot ancora da riempire, così la rosa sta nel budget
    let budgetLeft = rolePlan[role]
    let slotsToFill = slots
    const take = (sorted: Player[], n: number): Player[] => {
      const picks: Player[] = []
      for (const relax of [false, true]) {
        for (const p of sorted) {
          if (picks.length >= n) break
          if (used.has(p.id)) continue
          if (!relax && (clubCount.get(p.squadra) ?? 0) >= clubCap) continue
          if (budgetLeft - cost(p) < slotsToFill - 1) continue // non affordabile lasciando 1 agli altri slot
          picks.push(p); used.add(p.id)
          clubCount.set(p.squadra, (clubCount.get(p.squadra) ?? 0) + 1)
          budgetLeft -= cost(p); slotsToFill--
        }
        if (picks.length >= n) break
      }
      return picks
    }

    // 1) titolari garantiti (i migliori affordabili, diversificando i club)
    const byQuality = [...pool].sort((a, b) => (m(b.id).rank + m(b.id).tagBonus) - (m(a.id).rank + m(a.id).tagBonus) || m(b.id).fvm - m(a.id).fvm)
    const starterQ = Math.min(STARTERS[role], slots)
    let starters: Player[]
    if (role === 'D') {
      const modifQ = Math.min(3, starterQ)
      const byModif = [...pool].sort((a, b) => m(b.id).mv - m(a.id).mv || (m(b.id).rank - m(a.id).rank) || m(b.id).fvm - m(a.id).fvm)
      const modif = take(byModif, modifQ)
      const byBonus = pool.filter(p => !used.has(p.id)).sort((a, b) => m(b.id).bonusVal - m(a.id).bonusVal || (m(b.id).rank - m(a.id).rank) || m(b.id).fvm - m(a.id).fvm)
      const bonus = take(byBonus, starterQ - modif.length)
      starters = [...modif, ...bonus]
    } else {
      starters = take(byQuality, starterQ)
    }

    // 2) scommesse: fascia scommessa/in ascesa, cercate nelle PICCOLE squadre
    const scommQ = Math.min(scommPerRole[role], slots - starters.length)
    const scommSorted = byQuality.filter(p => !used.has(p.id))
      .sort((a, b) =>
        (Number(m(b.id).isScomm) - Number(m(a.id).isScomm)) ||
        (Number(!big.has(b.squadra)) - Number(!big.has(a.squadra))) ||
        m(b.id).fvm - m(a.id).fvm)
    const scommesse = take(scommSorted, scommQ)

    // 3) riempitivi da 1 credito: completano gli slot con i più economici
    const paid = [...starters, ...scommesse]
    const fillers = pool.filter(p => !used.has(p.id))
      .sort((a, b) => m(a.id).price - m(b.id).price || m(a.id).fvm - m(b.id).fvm)
      .slice(0, slots - paid.length)
    fillers.forEach(p => used.add(p.id))

    // tetti = costo REALE per i titolari/scommesse, 1 per i riempitivi
    for (const p of paid) { targets.push(p.id); caps[p.id] = cost(p) }
    for (const p of fillers) { targets.push(p.id); caps[p.id] = 1 }
    nStarters += starters.length; nScomm += scommesse.length; nFiller += fillers.length
  }
  const capTotal = Object.values(caps).reduce((s, c) => s + c, 0)

  const pct = (r: Role) => Math.round(100 * rolePlan[r] / league.budget)
  const slotsTot = roles.reduce((s, r) => s + league.slots[r], 0)
  const notes = [
    `Strategia generata${recognized.length ? ' (riconosciuto: ' + recognized.join(', ') + ')' : ''}.`,
    '',
    'Ripartizione budget:',
    ...roles.map(r => `  ${ROLE_NAME[r]}: ${rolePlan[r]} crediti (${pct(r)}%)`),
    '',
    `Rosa completa: ${targets.length}/${slotsTot} giocatori — ${nStarters} titolari garantiti, ${nScomm} scommesse, ${nFiller} riempitivi da 1.`,
    `Spesa stimata ai prezzi reali: ${capTotal}/${league.budget} crediti (rispetta il tuo prezzo dove l'hai impostato, altrimenti il previsto).`,
    'Club diversificati: max 1 attaccante e 2 centrocampisti per squadra (in difesa nessun limite, per il modificatore).',
    'Nella lista della spesa trovi tutti gli slot col prezzo reale. Ritocca a mano: è una bozza di partenza.',
  ].join('\n')

  return { rolePlan, targets, caps, notes, recognized }
}
