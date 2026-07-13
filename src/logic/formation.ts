import type { Player, Role } from './types'

export interface Formation { D: number; C: number; A: number }
// moduli ammessi, dal più offensivo (si sceglie il primo schierabile)
export const MODULES: Formation[] = [
  { D: 3, C: 4, A: 3 }, { D: 3, C: 5, A: 2 }, { D: 4, C: 3, A: 3 },
  { D: 4, C: 4, A: 2 }, { D: 5, C: 3, A: 2 }, { D: 4, C: 5, A: 1 }, { D: 5, C: 4, A: 1 },
]
const DEFAULT: Formation = { D: 3, C: 4, A: 3 }

export const moduleLabel = (f: Formation) => `${f.D}-${f.C}-${f.A}`

/** Sceglie il modulo migliore schierabile con i giocatori disponibili. */
export function chooseFormation(avail: Record<Role, number>): Formation {
  if ((avail.P ?? 0) < 1) return DEFAULT
  return MODULES.find(m => avail.D >= m.D && avail.C >= m.C && avail.A >= m.A) ?? DEFAULT
}

export interface XI {
  formation: Formation
  picks: Record<Role, Player[]> // migliori per reparto, fino al numero del modulo
}

/** Miglior 11 titolare da una rosa: 1 portiere + modulo, i migliori per FVM.
 *  Se `forced` è passato, usa quel modulo invece di sceglierlo automaticamente. */
export function bestXI(players: Player[], forced?: Formation): XI {
  const byRole = (r: Role) => players.filter(p => p.ruolo === r).sort((a, b) => b.fvm - a.fvm)
  const avail: Record<Role, number> = { P: byRole('P').length, D: byRole('D').length, C: byRole('C').length, A: byRole('A').length }
  const formation = forced ?? chooseFormation(avail)
  return {
    formation,
    picks: {
      P: byRole('P').slice(0, 1),
      D: byRole('D').slice(0, formation.D),
      C: byRole('C').slice(0, formation.C),
      A: byRole('A').slice(0, formation.A),
    },
  }
}
