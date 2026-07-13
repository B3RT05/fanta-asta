import type { AppState, LeagueConfig, Player, PlayerStats, Role, TierId } from '@/logic/types'
import { proposeTiers } from '@/logic/tiering'
import { mergeStats } from '@/logic/parseStats'

export type Action =
  | { type: 'importListone'; players: Player[] }
  | { type: 'importStats'; stats: Map<number, PlayerStats> }
  | { type: 'setLeague'; league: LeagueConfig }
  | { type: 'setTier'; playerId: number; tier: TierId }
  | { type: 'renameTier'; id: TierId; label: string }
  | { type: 'addTier'; label: string }
  | { type: 'toggleTarget'; playerId: number }
  | { type: 'setRolePlan'; plan: Record<Role, number> }
  | { type: 'addPurchase'; playerId: number; teamIndex: number; price: number }
  | { type: 'editPurchase'; seq: number; price: number; teamIndex: number }
  | { type: 'removePurchase'; seq: number }
  | { type: 'setTeamNote'; teamIndex: number; note: string }
  | { type: 'setStrategyNotes'; notes: string }
  | { type: 'setTargetCap'; playerId: number; cap: number }
  | { type: 'applyStrategy'; rolePlan: Record<Role, number>; targets: number[]; caps: Record<number, number>; notes: string }
  | { type: 'recomputeTiers' }
  | { type: 'replaceState'; state: AppState }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'importListone': {
      const proposed = proposeTiers(action.players)
      const isFirstImport = Object.keys(state.tiers).length === 0
      if (isFirstImport) {
        const ids = new Set(action.players.map(p => p.id))
        return {
          ...state,
          players: action.players,
          tiers: proposed.tiers,
          review: proposed.review,
          targets: state.targets.filter(id => ids.has(id)),
        }
      }
      const tiers: Record<number, TierId> = { ...state.tiers }
      const review: number[] = []
      for (const p of action.players) {
        if (state.tiers[p.id] === undefined) {
          tiers[p.id] = proposed.tiers[p.id]
          review.push(p.id) // nuovo giocatore: da rivedere
        }
      }
      const ids = new Set(action.players.map(p => p.id))
      return {
        ...state,
        players: action.players,
        tiers,
        review,
        targets: state.targets.filter(id => ids.has(id)),
      }
    }
    case 'importStats': {
      // le statistiche cambiano la clusterizzazione per rendimento -> ricalcola le fasce
      const players = mergeStats(state.players, action.stats)
      const { tiers, review } = proposeTiers(players)
      return { ...state, players, tiers, review }
    }
    case 'setStrategyNotes':
      return { ...state, strategyNotes: action.notes }
    case 'setTargetCap':
      // il prezzo digitato dall'utente va nei tetti MANUALI (hanno priorità e
      // non vengono sovrascritti dalla rigenerazione)
      return { ...state, manualCaps: { ...(state.manualCaps ?? {}), [action.playerId]: action.cap } }
    case 'applyStrategy':
      // sostituisce i tetti GENERATI (fresco a ogni rigenerazione); i prezzi
      // manuali (manualCaps) restano intatti e prevalgono nel display/generatore
      return { ...state, rolePlan: action.rolePlan, targets: action.targets, targetCaps: action.caps, strategyNotes: action.notes }
    case 'recomputeTiers': {
      const { tiers, review } = proposeTiers(state.players)
      return { ...state, tiers, review }
    }
    case 'setLeague':
      return { ...state, league: action.league }
    case 'setTier':
      return {
        ...state,
        tiers: { ...state.tiers, [action.playerId]: action.tier },
        review: state.review.filter(id => id !== action.playerId),
      }
    case 'renameTier':
      return { ...state, tierDefs: state.tierDefs.map(d => d.id === action.id ? { ...d, label: action.label } : d) }
    case 'addTier': {
      const id = `custom-${state.tierDefs.filter(d => d.id.startsWith('custom-')).length + 1}`
      const defs = [...state.tierDefs]
      const skipIdx = defs.findIndex(d => d.id === 'skip')
      defs.splice(skipIdx === -1 ? defs.length : skipIdx, 0, { id, label: action.label })
      return { ...state, tierDefs: defs }
    }
    case 'toggleTarget':
      return {
        ...state,
        targets: state.targets.includes(action.playerId)
          ? state.targets.filter(id => id !== action.playerId)
          : [...state.targets, action.playerId],
      }
    case 'setRolePlan':
      return { ...state, rolePlan: action.plan }
    case 'addPurchase': {
      const seq = state.purchases.reduce((m, p) => Math.max(m, p.seq), 0) + 1
      return { ...state, purchases: [...state.purchases, { playerId: action.playerId, teamIndex: action.teamIndex, price: action.price, seq }] }
    }
    case 'editPurchase':
      return {
        ...state,
        purchases: state.purchases.map(p => p.seq === action.seq ? { ...p, price: action.price, teamIndex: action.teamIndex } : p),
      }
    case 'removePurchase':
      return { ...state, purchases: state.purchases.filter(p => p.seq !== action.seq) }
    case 'setTeamNote':
      return { ...state, teamNotes: { ...state.teamNotes, [action.teamIndex]: action.note } }
    case 'replaceState':
      return action.state
  }
}
