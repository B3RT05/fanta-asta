// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { AppCtx } from '@/ui/App'
import StrategiaTab from '@/ui/StrategiaTab'
import { initialState } from '@/logic/storage'
import { reducer, type Action } from '@/state/reducer'
import type { AppState, Player } from '@/logic/types'

const mk = (id: number, nome: string): Player =>
  ({ id, nome, squadra: 'Inter', ruolo: 'A', ruoliMantra: [], qtA: 10, qtI: 10, fvm: 200 })

function Harness({ init }: { init: AppState }) {
  const [state, dispatch] = useReducer(reducer, init)
  return <AppCtx.Provider value={{ state, dispatch }}><StrategiaTab /></AppCtx.Provider>
}

let init = reducer(initialState(), { type: 'importListone', players: [mk(1, 'Lautaro')] } as Action)
init = reducer(init, { type: 'toggleTarget', playerId: 1 })

describe('StrategiaTab', () => {
  it('scrive il piano d\'asta', async () => {
    render(<Harness init={init} />)
    const ta = screen.getByLabelText("Piano d'asta")
    await userEvent.type(ta, 'Difesa modificatore')
    expect((ta as HTMLTextAreaElement).value).toBe('Difesa modificatore')
  })
  it('mostra gli obiettivi con il campo max che pago', async () => {
    render(<Harness init={init} />)
    expect(screen.getAllByText('Lautaro').length).toBeGreaterThan(0) // in lista e sul campetto
    const cap = screen.getByLabelText('max Lautaro')
    await userEvent.type(cap, '150')
    expect((cap as HTMLInputElement).value).toBe('150')
  })
})
