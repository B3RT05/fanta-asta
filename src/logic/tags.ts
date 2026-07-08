import { DIFF_ASCESA, PV_SOLIDO, PV_TITOLARE } from './tiering'
import type { Player, Role } from './types'

export type TagKind = 'pro' | 'malus' | 'risk'
export interface Tag { id: string; label: string; kind: TagKind }

// soglie percentile (da calibrare): "alto" = quartile alto del ruolo
export const T_HIGH = 0.80
export const T_VHIGH = 0.85

function pctMap(players: Player[], val: (p: Player) => number): Map<number, number> {
  const sorted = [...players].sort((a, b) => val(a) - val(b))
  const m = new Map<number, number>()
  sorted.forEach((p, i) => m.set(p.id, sorted.length > 1 ? i / (sorted.length - 1) : 1))
  return m
}

/** Etichette fanta-oriented per ogni giocatore, calcolate per ruolo. */
export function computeTags(players: Player[]): Map<number, Tag[]> {
  const out = new Map<number, Tag[]>()
  const roles: Role[] = ['P', 'D', 'C', 'A']
  for (const role of roles) {
    const pool = players.filter(p => p.ruolo === role)
    const ev = pool.filter(p => p.stats && p.stats.pv >= PV_TITOLARE) // valutabili
    const gfP = pctMap(ev, p => p.stats!.gf)
    const assP = pctMap(ev, p => p.stats!.ass)
    const bonusP = pctMap(ev, p => p.stats!.gf + p.stats!.ass)
    const mvP = pctMap(ev, p => p.stats!.mv)
    const fmP = pctMap(ev, p => p.stats!.fm)
    const pvP = pctMap(ev, p => p.stats!.pv)
    const csP = pctMap(ev, p => p.stats!.pv > 0 ? -(p.stats!.gs / p.stats!.pv) : 0)
    const fvmP = pctMap(pool, p => p.fvm)

    for (const p of pool) {
      const tags: Tag[] = []
      const s = p.stats
      const diff = p.qtA - p.qtI
      const evaluable = gfP.has(p.id)

      // --- trasversali ---
      if (diff >= DIFF_ASCESA) tags.push({ id: 'ascesa', label: 'In ascesa', kind: 'pro' })
      if (diff <= -DIFF_ASCESA) tags.push({ id: 'calo', label: 'In calo', kind: 'malus' })
      if (s && s.rc >= 2) tags.push({ id: 'rigorista', label: 'Rigorista', kind: 'pro' })
      if (s && s.amm + 2 * s.esp >= 8) tags.push({ id: 'indisciplinato', label: 'Da malus', kind: 'malus' })
      if (s && s.pv < PV_TITOLARE) tags.push({ id: 'panchinaro', label: 'Poche presenze', kind: 'risk' })
      if (s && s.pv < PV_TITOLARE && fvmP.get(p.id)! >= T_VHIGH)
        tags.push({ id: 'lusso', label: 'Costoso ma acerbo', kind: 'risk' })
      if (evaluable && pvP.get(p.id)! >= T_VHIGH) tags.push({ id: 'titolarissimo', label: 'Titolarissimo', kind: 'pro' })

      // --- per ruolo (solo valutabili) ---
      if (evaluable && role === 'P') {
        if (csP.get(p.id)! >= 0.75) tags.push({ id: 'saracinesca', label: 'Saracinesca', kind: 'pro' })
        if (csP.get(p.id)! <= 0.25) tags.push({ id: 'colabrodo', label: 'Subisce molto', kind: 'malus' })
        if (s!.rp >= 2) tags.push({ id: 'pararigori', label: 'Para-rigori', kind: 'pro' })
      }
      if (evaluable && role === 'D') {
        if (bonusP.get(p.id)! >= T_HIGH) tags.push({ id: 'dbonus', label: 'Da bonus', kind: 'pro' })
        if (mvP.get(p.id)! >= 0.75 && s!.pv >= PV_SOLIDO) tags.push({ id: 'modificatore', label: 'Da modificatore', kind: 'pro' })
        if (s!.au >= 1) tags.push({ id: 'autogol', label: 'Autogol', kind: 'malus' })
      }
      if (evaluable && role === 'C') {
        if (bonusP.get(p.id)! >= T_HIGH) tags.push({ id: 'bonusman', label: 'Bonus-man', kind: 'pro' })
        if (assP.get(p.id)! >= T_HIGH && gfP.get(p.id)! < 0.6) tags.push({ id: 'assistman', label: 'Assist-man', kind: 'pro' })
        if (gfP.get(p.id)! >= T_HIGH) tags.push({ id: 'goleador', label: 'Goleador', kind: 'pro' })
      }
      if (evaluable && role === 'A') {
        if (gfP.get(p.id)! >= T_HIGH) tags.push({ id: 'bomber', label: 'Bomber', kind: 'pro' })
        if (assP.get(p.id)! >= T_HIGH && gfP.get(p.id)! < 0.6) tags.push({ id: 'assistman', label: 'Assist-man', kind: 'pro' })
        if (fmP.get(p.id)! >= T_VHIGH && s!.pv >= PV_SOLIDO) tags.push({ id: 'cecchino', label: 'Cecchino', kind: 'pro' })
        if (s!.rMinus >= 2) tags.push({ id: 'sbagliarigori', label: 'Sbaglia rigori', kind: 'malus' })
      }
      out.set(p.id, tags)
    }
  }
  return out
}

/** Tag "pro" più frequenti in un gruppo di giocatori (per profilare gli avversari). */
export function dominantTags(playerIds: number[], tagsMap: Map<number, Tag[]>, max = 3): { label: string; count: number }[] {
  const c = new Map<string, number>()
  for (const id of playerIds)
    for (const t of tagsMap.get(id) ?? [])
      if (t.kind === 'pro') c.set(t.label, (c.get(t.label) ?? 0) + 1)
  return [...c.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([label, count]) => ({ label, count }))
}
