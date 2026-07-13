import type { Player, Role } from './types'

export interface MeterVals { titolarita: number | null; rendimento: number | null }

/** Indicatori 0..1 per la barretta:
 *  - titolarità = presenze/34 (confrontabile tra ruoli: si gioca ~stesso n. di partite)
 *  - rendimento = fantamedia normalizzata DENTRO IL RUOLO (un portiere si valuta
 *    tra portieri: le loro fantamedie non saranno mai come quelle degli attaccanti). */
export function meterValues(players: Player[]): Map<number, MeterVals> {
  const roles: Role[] = ['P', 'D', 'C', 'A']
  const fmRange = new Map<Role, { min: number; max: number }>()
  for (const r of roles) {
    const fms = players.filter(p => p.ruolo === r && p.stats).map(p => p.stats!.fm)
    if (fms.length) fmRange.set(r, { min: Math.min(...fms), max: Math.max(...fms) })
  }
  const out = new Map<number, MeterVals>()
  for (const p of players) {
    if (!p.stats) { out.set(p.id, { titolarita: null, rendimento: null }); continue }
    const tit = Math.min(1, p.stats.pv / 34)
    const r = fmRange.get(p.ruolo)
    const ren = r && r.max > r.min ? (p.stats.fm - r.min) / (r.max - r.min) : 0.5
    out.set(p.id, { titolarita: tit, rendimento: Math.max(0, Math.min(1, ren)) })
  }
  return out
}
