import type { Player, PriceRange, Purchase, Role } from './types'

// Metodo CarmySpecial — bolle inflazionistiche: se la lega sperpera crediti su
// un reparto, NON seguire la scia; accumula un vantaggio monetario e rastrella
// 3-4 semitop di 2ª fascia a prezzi bassi. Qui misuriamo l'inflazione per
// reparto confrontando il prezzo PAGATO col PREVISTO.

export const INFLATION_MIN_SAMPLE = 3   // servono almeno N acquisti "veri" per reparto
export const INFLATION_MIN_PREDICTED = 3 // ignora i riempitivi da 1-2 crediti (non fanno mercato)
export const INFLATION_HI = 1.15        // +15% → bolla
export const INFLATION_LO = 0.85        // −15% → saldi

const ROLE_NAMES: Record<Role, string> = { P: 'porta', D: 'difesa', C: 'centrocampo', A: 'attacco' }

export interface RoleInflation {
  role: Role
  bought: number
  avgPaid: number
  avgPredicted: number
  index: number // pagato / previsto (1 = in linea)
  level: 'saldi' | 'normale' | 'bolla'
  message: string
}

/** Indice di inflazione per reparto sui giocatori "veri" già venduti.
 *  Restituisce solo i reparti con abbastanza campione. */
export function roleInflation(
  purchases: Purchase[], players: Player[], prices: Map<number, PriceRange>,
): RoleInflation[] {
  const byId = new Map(players.map(p => [p.id, p]))
  const agg: Record<Role, { paid: number; pred: number; n: number }> =
    { P: { paid: 0, pred: 0, n: 0 }, D: { paid: 0, pred: 0, n: 0 }, C: { paid: 0, pred: 0, n: 0 }, A: { paid: 0, pred: 0, n: 0 } }

  for (const pu of purchases) {
    const pl = byId.get(pu.playerId)
    const pred = prices.get(pu.playerId)?.base
    if (!pl || pred === undefined || pred < INFLATION_MIN_PREDICTED) continue // solo giocatori "di mercato"
    const a = agg[pl.ruolo]
    a.paid += pu.price; a.pred += pred; a.n += 1
  }

  const out: RoleInflation[] = []
  for (const role of ['P', 'D', 'C', 'A'] as Role[]) {
    const a = agg[role]
    if (a.n < INFLATION_MIN_SAMPLE || a.pred <= 0) continue
    const avgPaid = a.paid / a.n
    const avgPredicted = a.pred / a.n
    const index = avgPaid / avgPredicted
    const deltaPct = Math.round((index - 1) * 100)
    const level: RoleInflation['level'] = index >= INFLATION_HI ? 'bolla' : index <= INFLATION_LO ? 'saldi' : 'normale'
    const message =
      level === 'bolla'
        ? `Mercato ${ROLE_NAMES[role]} gonfiato (+${deltaPct}%): non seguire la scia, accumula crediti e rastrella la 2ª fascia più avanti.`
        : level === 'saldi'
          ? `Mercato ${ROLE_NAMES[role]} a sconto (${deltaPct}%): è il momento di prendere semitop sottopagati.`
          : `Mercato ${ROLE_NAMES[role]} in linea col previsto (${deltaPct >= 0 ? '+' : ''}${deltaPct}%).`
    out.push({ role, bought: a.n, avgPaid: Math.round(avgPaid), avgPredicted: Math.round(avgPredicted), index, level, message })
  }
  return out
}
