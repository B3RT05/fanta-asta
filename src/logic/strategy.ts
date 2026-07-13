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

/** I tre "caratteri" con cui riempire la stessa ripartizione di budget:
 *  cambiano CHI scegli, non quanto spendi per reparto. */
export type StrategyStyle = 'stelle' | 'equilibrata' | 'valore'

export interface StrategyVariant extends GeneratedStrategy {
  style: StrategyStyle
  label: string
  sublabel: string
  spesaStimata: number
}

interface StyleCfg {
  label: string
  sublabel: string
  /** salta i N titolari più costosi nella selezione (per non prendere sempre il big più caro) */
  avoidTopN: number
  /** scommesse extra per reparto */
  scommBoost: number
  /** criterio con cui ordinare i candidati titolari */
  starterKey: 'quality' | 'price' | 'value'
}

const STYLE_CFG: Record<StrategyStyle, StyleCfg> = {
  stelle: { label: 'Stelle & sostanza', sublabel: '1-2 big costosi, poi riempi con solidi', avoidTopN: 0, scommBoost: 0, starterKey: 'price' },
  equilibrata: { label: 'Equilibrata', sublabel: 'qualità diffusa, nessun eccesso', avoidTopN: 0, scommBoost: 0, starterKey: 'quality' },
  valore: { label: 'Valore & scommesse', sublabel: 'niente super-big, tanti semi-top e scommesse', avoidTopN: 2, scommBoost: 1, starterKey: 'value' },
}

const ROLE_NAME: Record<Role, string> = { P: 'Portieri', D: 'Difensori', C: 'Centrocampo', A: 'Attacco' }
const TIER_RANK: Record<string, number> = { top: 5, semitop: 4, titolare: 3, scommessa: 2, riempitivo: 1, skip: 0 }

// ripartizione di base (%) — attacco-oriented tipico del Classic.
// (Il "portiere ~5%" del Metodo CarmySpecial è già il ramo "portiere low cost":
//  descrivi "portiere low cost" per scendere al 5% e spostare i crediti altrove.)
const BASE: Record<Role, number> = { P: 0.08, D: 0.18, C: 0.34, A: 0.40 }

// Metodo CarmySpecial: mai oltre il 30-35% del budget su un singolo elemento
// (oltre distrugge la competitività della rosa). Tetto duro alla spesa/giocatore.
export const MAX_SINGLE_PCT = 0.35

// A rosa piena si reinveste il budget avanzato: i crediti non spesi vanno
// sprecati (una rosa che usa metà budget non è competitiva). Trasformiamo i
// riempitivi da 1 credito in "certezze" finché il residuo scende sotto questa
// soglia. Le certezze sono titolari/semitop solidi (per lo stile "valore" MAI
// dei top: si comprano garanzie di voto, non big).
export const REINVEST_RESERVE = 12
const CERT_TIERS = new Set<TierId>(['top', 'semitop', 'titolare'])

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
  opts: { style?: StrategyStyle; avoid?: Set<number> } = {},
): StrategyVariant {
  const cfg = STYLE_CFG[opts.style ?? 'equilibrata']
  const avoid = opts.avoid ?? new Set<number>()
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
  const baseScomm: Record<Role, number> = wantScommesse
    ? { P: 0, D: 2, C: 2, A: 2 }
    : { P: 0, D: 1, C: 1, A: 1 }
  const scommPerRole: Record<Role, number> = {
    P: baseScomm.P, // il portiere di riserva resta un riempitivo, non una scommessa
    D: baseScomm.D + cfg.scommBoost, C: baseScomm.C + cfg.scommBoost, A: baseScomm.A + cfg.scommBoost,
  }
  const targets: number[] = []
  const caps: Record<number, number> = {}
  let nStarters = 0, nScomm = 0, nFiller = 0
  const big = new Set(league.bigClubs) // le "big" = squadre forti configurate nella lega
  const maxSingle = Math.round(league.budget * MAX_SINGLE_PCT) // tetto duro per singolo giocatore

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
    // passate progressive: prima rispetta club-cap ed evita i giocatori "avoid"
    // (usati da altre proposte), poi rilassa l'avoid, infine anche il club-cap.
    const take = (sorted: Player[], n: number): Player[] => {
      const picks: Player[] = []
      for (const pass of [0, 1, 2]) {
        for (const p of sorted) {
          if (picks.length >= n) break
          if (used.has(p.id)) continue
          if (cost(p) > maxSingle) continue // disciplina: mai oltre il 35% del budget su un singolo
          if (pass < 1 && avoid.has(p.id)) continue // evita i giocatori già proposti altrove
          if (pass < 2 && (clubCount.get(p.squadra) ?? 0) >= clubCap) continue
          if (budgetLeft - cost(p) < slotsToFill - 1) continue // non affordabile lasciando 1 agli altri slot
          picks.push(p); used.add(p.id)
          clubCount.set(p.squadra, (clubCount.get(p.squadra) ?? 0) + 1)
          budgetLeft -= cost(p); slotsToFill--
        }
        if (picks.length >= n) break
      }
      return picks
    }

    // 1) titolari garantiti — l'ORDINE dei candidati dipende dallo stile:
    //    quality = i più forti · price = i più costosi (star) · value = miglior fvm per credito.
    const qualityCmp = (a: Player, b: Player) => (m(b.id).rank + m(b.id).tagBonus) - (m(a.id).rank + m(a.id).tagBonus) || m(b.id).fvm - m(a.id).fvm
    const value = (id: number) => m(id).fvm / Math.max(1, m(id).price)
    const styleCmp = (a: Player, b: Player) =>
      cfg.starterKey === 'price' ? (m(b.id).price - m(a.id).price || qualityCmp(a, b))
        : cfg.starterKey === 'value' ? (value(b.id) - value(a.id) || qualityCmp(a, b))
          : qualityCmp(a, b)
    const byQuality = [...pool].sort(styleCmp)
    // salta i N più costosi in assoluto (per non prendere sempre il big più caro)
    const drop = new Set(cfg.avoidTopN > 0 ? [...pool].sort((a, b) => m(b.id).price - m(a.id).price).slice(0, cfg.avoidTopN).map(p => p.id) : [])
    // stile "valore": niente big di fascia top, solo semitop/titolari (garanzie)
    const noTop = cfg.starterKey === 'value'
    const cand = byQuality.filter(p => !drop.has(p.id) && !(noTop && tiers[p.id] === 'top'))
    const starterQ = Math.min(STARTERS[role], slots)
    let starters: Player[]
    if (role === 'D') {
      const modifQ = Math.min(3, starterQ)
      const byModif = cand.slice().sort((a, b) => m(b.id).mv - m(a.id).mv || (m(b.id).rank - m(a.id).rank) || m(b.id).fvm - m(a.id).fvm)
      const modif = take(byModif, modifQ)
      const byBonus = cand.filter(p => !used.has(p.id)).sort((a, b) => m(b.id).bonusVal - m(a.id).bonusVal || (m(b.id).rank - m(a.id).rank) || m(b.id).fvm - m(a.id).fvm)
      const bonus = take(byBonus, starterQ - modif.length)
      starters = [...modif, ...bonus]
    } else {
      starters = take(cand, starterQ)
    }

    // 2) scommesse: fascia scommessa/in ascesa, cercate nelle PICCOLE squadre
    const scommQ = Math.min(scommPerRole[role], slots - starters.length)
    const scommSorted = cand.filter(p => !used.has(p.id))
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

  // --- Reinvestimento del residuo: usa i crediti avanzati per trasformare i
  //     riempitivi da 1 credito in certezze, senza superare il tetto del 35%
  //     né i limiti di club. Lo stile "valore" evita i top (compra garanzie).
  {
    const byIdP = new Map(players.map(p => [p.id, p]))
    const costG = (id: number) => Math.max(1, Math.round(userCaps[id] ?? prices.get(id)?.base ?? 1))
    const qual = (id: number) => (TIER_RANK[tiers[id]] ?? 0) * 1000 + (byIdP.get(id)?.fvm ?? 0)
    const excludeTop = cfg.starterKey === 'value' // "valore": niente top, solo certezze
    const ceil = excludeTop ? Math.round(league.budget * 0.25) : maxSingle
    const eligible = (id: number) => CERT_TIERS.has(tiers[id]) && !(excludeTop && tiers[id] === 'top')
    const poolByRole: Record<Role, Player[]> = { P: [], D: [], C: [], A: [] }
    for (const p of players) poolByRole[p.ruolo].push(p)
    for (const r of roles) poolByRole[r].sort((a, b) => qual(b.id) - qual(a.id))
    const roleClub: Record<Role, Map<string, number>> = { P: new Map(), D: new Map(), C: new Map(), A: new Map() }
    for (const id of targets) { const pl = byIdP.get(id)!; const mm = roleClub[pl.ruolo]; mm.set(pl.squadra, (mm.get(pl.squadra) ?? 0) + 1) }
    const usedG = new Set(targets)

    let leftover = league.budget - Object.values(caps).reduce((s, c) => s + c, 0)
    let guard = targets.length + 8
    while (leftover > REINVEST_RESERVE && guard-- > 0) {
      let best: { role: Role; fillerId: number; cand: Player; cost: number; gain: number } | null = null
      for (const role of roles) {
        const fillerId = targets.find(id => byIdP.get(id)!.ruolo === role && caps[id] === 1)
        if (fillerId === undefined) continue
        const fillerPl = byIdP.get(fillerId)!
        const mm = roleClub[role]; const clubCap = CLUB_CAP[role]
        for (const p of poolByRole[role]) {
          if (usedG.has(p.id) || !eligible(p.id)) continue
          const c = costG(p.id)
          if (c > maxSingle || c > ceil || c > leftover + 1) continue // affordabile sostituendo un riempitivo da 1
          const cnt = (mm.get(p.squadra) ?? 0) - (p.squadra === fillerPl.squadra ? 1 : 0)
          if (cnt >= clubCap) continue
          const gain = qual(p.id)
          if (!best || gain > best.gain) best = { role, fillerId, cand: p, cost: c, gain }
          break // il pool è ordinato per qualità: il primo affordabile è il migliore per questo ruolo
        }
      }
      if (!best) break
      const idx = targets.indexOf(best.fillerId)
      const fillerPl = byIdP.get(best.fillerId)!
      targets[idx] = best.cand.id
      delete caps[best.fillerId]; caps[best.cand.id] = best.cost
      usedG.delete(best.fillerId); usedG.add(best.cand.id)
      const mm = roleClub[best.role]
      mm.set(fillerPl.squadra, (mm.get(fillerPl.squadra) ?? 1) - 1)
      mm.set(best.cand.squadra, (mm.get(best.cand.squadra) ?? 0) + 1)
      leftover -= best.cost - 1
      nFiller--; nStarters++
    }
  }

  const capTotal = Object.values(caps).reduce((s, c) => s + c, 0)

  const pct = (r: Role) => Math.round(100 * rolePlan[r] / league.budget)
  const slotsTot = roles.reduce((s, r) => s + league.slots[r], 0)
  const notes = [
    `Strategia «${cfg.label}» (${cfg.sublabel})${recognized.length ? ' — riconosciuto: ' + recognized.join(', ') : ''}.`,
    '',
    'Ripartizione budget:',
    ...roles.map(r => `  ${ROLE_NAME[r]}: ${rolePlan[r]} crediti (${pct(r)}%)`),
    '',
    `Rosa completa: ${targets.length}/${slotsTot} giocatori — ${nStarters} titolari garantiti, ${nScomm} scommesse, ${nFiller} riempitivi da 1.`,
    `Spesa stimata ai prezzi reali: ${capTotal}/${league.budget} crediti (residuo ${league.budget - capTotal}). Il budget avanzato è reinvestito in certezze, non risparmiato.`,
    `Disciplina di budget (Metodo CarmySpecial): nessun singolo giocatore oltre il ${Math.round(MAX_SINGLE_PCT * 100)}% del budget (max ${maxSingle} cr).`,
    'Club diversificati: max 1 attaccante e 2 centrocampisti per squadra (in difesa nessun limite, per il modificatore).',
    'Nella lista della spesa trovi tutti gli slot col prezzo reale. Ritocca a mano: è una bozza di partenza.',
  ].join('\n')

  return { rolePlan, targets, caps, notes, recognized, style: opts.style ?? 'equilibrata', label: cfg.label, sublabel: cfg.sublabel, spesaStimata: capTotal }
}

/** Genera TRE proposte con caratteri diversi (stelle / equilibrata / valore)
 *  a partire dalla stessa descrizione. Le tre non sono cloni: ogni variante
 *  evita (quando può) i titolari "pagati" già scelti dalle precedenti, e si
 *  può passare un insieme `avoid` iniziale per ottenere un batch tutto nuovo
 *  ("generane di diverse"). */
export function generateStrategyVariants(
  description: string, players: Player[], tiers: Record<number, TierId>,
  tagsMap: Map<number, Tag[]>, prices: Map<number, PriceRange>, league: LeagueConfig,
  userCaps: Record<number, number> = {}, avoidInitial: Iterable<number> = [],
): StrategyVariant[] {
  const styles: StrategyStyle[] = ['stelle', 'equilibrata', 'valore']
  const avoid = new Set<number>(avoidInitial)
  const out: StrategyVariant[] = []
  for (const style of styles) {
    const v = generateStrategy(description, players, tiers, tagsMap, prices, league, userCaps, { style, avoid })
    out.push(v)
    // i titolari "pagati" (tetto > 1) di questa variante vengono evitati (soft) dalle successive
    for (const id of v.targets) if ((v.caps[id] ?? 0) > 1) avoid.add(id)
  }
  return out
}
