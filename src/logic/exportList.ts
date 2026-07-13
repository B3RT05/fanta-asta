import { tierLabel, type AppState, type PriceRange, type Role } from './types'

const ROLE_NAME: Record<Role, string> = { P: 'PORTIERI', D: 'DIFENSORI', C: 'CENTROCAMPO', A: 'ATTACCO' }

/** Lista della spesa (obiettivi con stella) in testo semplice, pronta da
 *  copiare/condividere o salvare come .txt. */
export function shoppingListText(state: AppState, prices: Map<number, PriceRange>): string {
  const byId = new Map(state.players.map(p => [p.id, p]))
  const caps = state.targetCaps ?? {}
  const targets = state.targets.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
  const lines: string[] = ['LISTA DELLA SPESA — Fanta Asta']

  const rp = state.rolePlan
  lines.push(`Budget lega: ${state.league.budget} · piano P${rp.P}/D${rp.D}/C${rp.C}/A${rp.A}`)
  lines.push('')

  let capTot = 0
  for (const role of ['P', 'D', 'C', 'A'] as Role[]) {
    const inRole = targets.filter(p => p.ruolo === role)
    if (inRole.length === 0) continue
    lines.push(ROLE_NAME[role])
    for (const p of inRole) {
      const pr = prices.get(p.id)
      const prev = pr ? `${pr.min}-${pr.max}` : '≈1'
      const cap = caps[p.id]
      capTot += cap ?? 0
      const fascia = tierLabel(state.tierDefs, state.tiers[p.id])
      lines.push(`  ${p.nome} (${p.squadra}) [${fascia}] — previsto ${prev}${cap ? `, mio ${cap}` : ''}`)
    }
    lines.push('')
  }

  if (targets.length === 0) lines.push('(nessun obiettivo: metti le stelle ai giocatori nello Studio)')
  else lines.push(`Totale tetti: ${capTot}/${state.league.budget}`)

  return lines.join('\n')
}
