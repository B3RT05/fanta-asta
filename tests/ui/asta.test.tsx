// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { AppCtx } from '@/ui/App'
import AstaTab from '@/ui/AstaTab'
import { initialState } from '@/logic/storage'
import { reducer, type Action } from '@/state/reducer'
import type { AppState, Player } from '@/logic/types'

const mk = (id: number, nome: string, ruolo: Player['ruolo']): Player =>
  ({ id, nome, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm: 100 })

function Harness({ init }: { init: AppState }) {
  const [state, dispatch] = useReducer(reducer, init)
  return <AppCtx.Provider value={{ state, dispatch }}><AstaTab /></AppCtx.Provider>
}

let init = reducer(initialState(), { type: 'importListone', players: [mk(1, 'Lautaro', 'A'), mk(2, 'Thuram', 'A')] } as Action)
init = reducer(init, { type: 'toggleTarget', playerId: 2 })

describe('AstaTab', () => {
  it('registra un acquisto e aggiorna il cruscotto', async () => {
    render(<Harness init={init} />)
    await userEvent.type(screen.getByLabelText('Giocatore'), 'Lautaro (Inter, A)')
    await userEvent.selectOptions(screen.getByLabelText('Squadra acquirente'), '1')
    await userEvent.clear(screen.getByLabelText('Prezzo'))
    await userEvent.type(screen.getByLabelText('Prezzo'), '200')
    await userEvent.click(screen.getByRole('button', { name: 'Registra' }))
    const row = screen.getByText('Squadra 2').closest('tr')!
    expect(within(row).getByText('300')).toBeInTheDocument() // crediti residui
  })
  it('elimina un acquisto dalla cronologia', async () => {
    let s = reducer(init, { type: 'addPurchase', playerId: 1, teamIndex: 1, price: 200 })
    render(<Harness init={s} />)
    await userEvent.click(screen.getByRole('button', { name: /elimina/i }))
    const row = screen.getByText('Squadra 2').closest('tr')!
    expect(within(row).getByText('500')).toBeInTheDocument()
  })
  it('mostra consiglio per il target', () => {
    render(<Harness init={init} />)
    expect(screen.getByText('Thuram')).toBeInTheDocument()
    expect(screen.getByText(/rivali|chiamalo|aspetta/i)).toBeInTheDocument()
  })
  it('premendo Invio nel campo prezzo registra l\'acquisto', async () => {
    render(<Harness init={init} />)
    await userEvent.type(screen.getByLabelText('Giocatore'), 'Lautaro (Inter, A)')
    await userEvent.selectOptions(screen.getByLabelText('Squadra acquirente'), '1')
    await userEvent.clear(screen.getByLabelText('Prezzo'))
    await userEvent.type(screen.getByLabelText('Prezzo'), '200')
    await userEvent.keyboard('{Enter}')
    const row = screen.getByText('Squadra 2').closest('tr')!
    expect(within(row).getByText('300')).toBeInTheDocument() // crediti residui
  })
  it('un acquisto con prezzo 0 non viene registrato', async () => {
    render(<Harness init={init} />)
    await userEvent.type(screen.getByLabelText('Giocatore'), 'Lautaro (Inter, A)')
    await userEvent.selectOptions(screen.getByLabelText('Squadra acquirente'), '1')
    await userEvent.clear(screen.getByLabelText('Prezzo'))
    await userEvent.click(screen.getByRole('button', { name: 'Registra' }))
    const row = screen.getByText('Squadra 2').closest('tr')!
    expect(within(row).getByText('500')).toBeInTheDocument() // crediti invariati
  })
})
