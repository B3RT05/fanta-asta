import * as XLSX from 'xlsx'
import type { Player, Role } from './types'

export function parseListone(data: ArrayBuffer | Uint8Array): Player[] {
  const wb = XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets['Tutti']
  if (!sheet) throw new Error('Foglio "Tutti" non trovato: hai caricato il file Quotazioni di Fantacalcio.it?')
  // header alla riga 2 del foglio (riga 1 = titolo)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 1 })
  if (rows.length === 0 || !('Qt.A' in rows[0]) || !('FVM' in rows[0]))
    throw new Error('Colonne inattese: questo non sembra il file Quotazioni (serve Qt.A/FVM).')
  return rows
    .filter(r => r['Id'] != null && r['Nome'] != null)
    .map(r => ({
      id: Number(r['Id']),
      nome: String(r['Nome']),
      squadra: String(r['Squadra']),
      ruolo: String(r['R']) as Role,
      ruoliMantra: String(r['RM'] ?? '').split(';').filter(Boolean),
      qtA: Number(r['Qt.A']),
      qtI: Number(r['Qt.I']),
      fvm: Number(r['FVM']),
    }))
}
