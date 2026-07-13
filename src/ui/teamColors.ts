// Colori-squadra (offline, nessun logo): colore principale + sigla per i chip.
export interface TeamStyle { abbr: string; bg: string; fg: string }

const W = '#ffffff'
const D = '#08130c'

export const TEAM_STYLES: Record<string, TeamStyle> = {
  Atalanta: { abbr: 'ATA', bg: '#1c5aa8', fg: W },
  Bologna: { abbr: 'BOL', bg: '#9c1f28', fg: W },
  Cagliari: { abbr: 'CAG', bg: '#a4133c', fg: W },
  Como: { abbr: 'COM', bg: '#0067b1', fg: W },
  Cremonese: { abbr: 'CRE', bg: '#7d2230', fg: W },
  Fiorentina: { abbr: 'FIO', bg: '#6d2b91', fg: W },
  Genoa: { abbr: 'GEN', bg: '#8f1a1f', fg: W },
  Inter: { abbr: 'INT', bg: '#0b1560', fg: W },
  Juventus: { abbr: 'JUV', bg: '#111111', fg: W },
  Lazio: { abbr: 'LAZ', bg: '#8dcff0', fg: D },
  Lecce: { abbr: 'LEC', bg: '#f4c20d', fg: D },
  Milan: { abbr: 'MIL', bg: '#c8102e', fg: W },
  Napoli: { abbr: 'NAP', bg: '#099fdb', fg: W },
  Parma: { abbr: 'PAR', bg: '#143c7b', fg: W },
  Pisa: { abbr: 'PIS', bg: '#14356b', fg: W },
  Roma: { abbr: 'ROM', bg: '#8e1f2f', fg: W },
  Sassuolo: { abbr: 'SAS', bg: '#00a552', fg: W },
  Torino: { abbr: 'TOR', bg: '#6d1420', fg: W },
  Udinese: { abbr: 'UDI', bg: '#222222', fg: W },
  Verona: { abbr: 'VER', bg: '#1f3a93', fg: W },
}

export function teamStyle(sq: string): TeamStyle {
  return TEAM_STYLES[sq] ?? { abbr: sq.slice(0, 3).toUpperCase(), bg: 'var(--surface-3)', fg: 'var(--muted)' }
}
