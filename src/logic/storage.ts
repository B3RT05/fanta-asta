import { DEFAULT_LEAGUE, DEFAULT_TIER_DEFS, type AppState } from './types'

export const STORAGE_KEY = 'fanta-asta-state'
export const SCHEMA_VERSION = 1

export function initialState(): AppState {
  return {
    version: SCHEMA_VERSION,
    players: [],
    league: structuredClone(DEFAULT_LEAGUE),
    tierDefs: structuredClone(DEFAULT_TIER_DEFS),
    tiers: {},
    review: [],
    targets: [],
    rolePlan: { P: 0, D: 0, C: 0, A: 0 },
    purchases: [],
    teamNotes: {},
    strategyNotes: '',
    targetCaps: {},
    manualCaps: {},
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function isValid(s: unknown): s is AppState {
  if (!isPlainObject(s)) return false
  const o = s
  return o.version === SCHEMA_VERSION && Array.isArray(o.players) && Array.isArray(o.purchases)
    && Array.isArray(o.tierDefs) && Array.isArray(o.review) && Array.isArray(o.targets)
    && isPlainObject(o.league) && isPlainObject(o.tiers) && isPlainObject(o.rolePlan) && isPlainObject(o.teamNotes)
}

export function saveState(s: AppState, store: Pick<Storage, 'setItem'> = localStorage): void {
  store.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function loadState(store: Pick<Storage, 'getItem'> = localStorage): AppState | null {
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function exportJson(s: AppState): string {
  return JSON.stringify(s, null, 2)
}

export function importJson(text: string): AppState {
  const parsed = JSON.parse(text)
  if (!isValid(parsed)) throw new Error('File di backup non riconosciuto (versione o struttura sbagliata).')
  return parsed
}
