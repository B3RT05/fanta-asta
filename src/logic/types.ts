export type Role = 'P' | 'D' | 'C' | 'A'

export interface PlayerStats {
  pv: number; mv: number; fm: number
  gf: number; gs: number; rp: number; rc: number
  rPlus: number; rMinus: number; ass: number
  amm: number; esp: number; au: number
}

export interface Player {
  id: number
  nome: string
  squadra: string
  ruolo: Role
  ruoliMantra: string[]
  qtA: number
  qtI: number
  fvm: number
  stats?: PlayerStats
}

export type TierId = string // id default: 'top','semitop','scommessa','titolare','riempitivo','skip'; le fasce custom hanno id 'custom-N'

export interface TierDef { id: TierId; label: string }

export const DEFAULT_TIER_DEFS: TierDef[] = [
  { id: 'top', label: 'Top' },
  { id: 'semitop', label: 'Semitop' },
  { id: 'scommessa', label: 'Scommessa' },
  { id: 'titolare', label: 'Titolare buono' },
  { id: 'riempitivo', label: 'Riempitivo' },
  { id: 'skip', label: 'Non mi interessa' },
]

export function tierLabel(defs: TierDef[], id: TierId): string {
  return defs.find(d => d.id === id)?.label ?? id
}

export interface LeagueConfig {
  budget: number            // default 500
  teams: string[]           // nomi squadre della lega; teams[myTeamIndex] = io
  myTeamIndex: number
  slots: Record<Role, number> // default {P:3,D:8,C:8,A:6}
  bigClubs: string[]        // per il profilo club avversari
}

export interface Purchase {
  playerId: number
  teamIndex: number  // indice in league.teams
  price: number
  seq: number        // ordine cronologico, assegnato dal reducer
}

export interface PriceRange { base: number; min: number; max: number }

export interface AppState {
  version: number
  players: Player[]
  league: LeagueConfig
  tierDefs: TierDef[]
  tiers: Record<number, TierId>
  review: number[]            // playerId "da rivedere"
  targets: number[]           // playerId con stella
  rolePlan: Record<Role, number> // budget pianificato per ruolo (pre-asta)
  purchases: Purchase[]
  teamNotes: Record<number, string> // note pre-asta per teamIndex
  strategyNotes: string            // piano d'asta a testo libero
  targetCaps: Record<number, number> // tetto di spesa personale per obiettivo (playerId)
}

export const DEFAULT_LEAGUE: LeagueConfig = {
  budget: 500,
  teams: ['Io', 'Squadra 2', 'Squadra 3', 'Squadra 4', 'Squadra 5', 'Squadra 6', 'Squadra 7', 'Squadra 8'],
  myTeamIndex: 0,
  slots: { P: 3, D: 8, C: 8, A: 6 },
  bigClubs: ['Inter', 'Napoli', 'Milan', 'Juventus', 'Atalanta', 'Roma', 'Lazio', 'Fiorentina', 'Bologna'],
}
