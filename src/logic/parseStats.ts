import * as XLSX from 'xlsx'
import type { Player, PlayerStats } from './types'

export function parseStats(data: ArrayBuffer | Uint8Array): Map<number, PlayerStats> {
  const wb = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets['Tutti']
  if (!sheet) throw new Error('Foglio "Tutti" non trovato: hai caricato il file Statistiche di Fantacalcio.it?')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 1 })
  if (rows.length === 0 || !('Fm' in rows[0]) || !('Pv' in rows[0]))
    throw new Error('Colonne inattese: questo non sembra il file statistiche (serve Pv/Fm).')
  const out = new Map<number, PlayerStats>()
  for (const r of rows) {
    if (r['Id'] == null) continue
    out.set(Number(r['Id']), {
      pv: Number(r['Pv']), mv: Number(r['Mv']), fm: Number(r['Fm']),
      gf: Number(r['Gf']), gs: Number(r['Gs']), rp: Number(r['Rp']), rc: Number(r['Rc']),
      rPlus: Number(r['R+']), rMinus: Number(r['R-']), ass: Number(r['Ass']),
      amm: Number(r['Amm']), esp: Number(r['Esp']), au: Number(r['Au']),
    })
  }
  return out
}

export function mergeStats(players: Player[], stats: Map<number, PlayerStats>): Player[] {
  return players.map(p => stats.has(p.id) ? { ...p, stats: stats.get(p.id) } : { ...p })
}
