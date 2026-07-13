// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppCtx } from '@/ui/App'
import StudioTab from '@/ui/StudioTab'
import { initialState } from '@/logic/storage'
import { reducer, type Action } from '@/state/reducer'
import type { AppState, Player } from '@/logic/types'
import { useReducer } from 'react'

const mk = (id: number, nome: string, ruolo: Player['ruolo'], fvm: number): Player =>
  ({ id, nome, squadra: 'Inter', ruolo, ruoliMantra: [], qtA: 10, qtI: 10, fvm, stats: { pv: 30, mv: 6.5, fm: 7, gf: 10, gs: 0, rp: 0, rc: 0, rPlus: 0, rMinus: 0, ass: 5, amm: 1, esp: 0, au: 0 } })

function Harness({ init }: { init: AppState }) {
  const [state, dispatch] = useReducer(reducer, init)
  return <AppCtx.Provider value={{ state, dispatch }}><StudioTab /></AppCtx.Provider>
}

const init = reducer(initialState(), { type: 'importListone', players: [mk(1, 'Lautaro', 'A', 300), mk(2, 'Rrahmani', 'D', 40)] } as Action)

describe('StudioTab', () => {
  it('lista i giocatori con prezzo previsto', () => {
    render(<Harness init={init} />)
    expect(screen.getByText('Lautaro')).toBeInTheDocument()
    expect(screen.getByText('Rrahmani')).toBeInTheDocument()
  })
  it('filtro per ruolo', async () => {
    render(<Harness init={init} />)
    await userEvent.selectOptions(screen.getByLabelText('Ruolo'), 'A')
    expect(screen.getByText('Lautaro')).toBeInTheDocument()
    expect(screen.queryByText('Rrahmani')).not.toBeInTheDocument()
  })
  it('cambio fascia dalla select di riga', async () => {
    render(<Harness init={init} />)
    const row = screen.getByText('Lautaro').closest('tr')!
    await userEvent.selectOptions(within(row).getByLabelText('Fascia'), 'scommessa')
    expect((within(row).getByLabelText('Fascia') as HTMLSelectElement).value).toBe('scommessa')
  })
  it('stella target', async () => {
    render(<Harness init={init} />)
    const row = screen.getByText('Lautaro').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: /target/i }))
    expect(within(row).getByRole('button', { name: /target/i })).toHaveTextContent('★')
  })
  it('la ricerca filtra i giocatori (per cognome)', async () => {
    render(<Harness init={init} />)
    await userEvent.type(screen.getByLabelText('Cerca'), 'rrah')
    expect(screen.getByText('Rrahmani')).toBeInTheDocument()
    expect(screen.queryByText('Lautaro')).not.toBeInTheDocument()
  })
  it('ordina cliccando l\'intestazione FVM (toggle desc/asc)', async () => {
    render(<Harness init={init} />)
    const first = () => within(screen.getAllByRole('row')[1]).getByRole('button', { name: /^(Lautaro|Rrahmani)$/ }).textContent
    expect(first()).toBe('Lautaro')   // default: FVM decrescente (300 > 40)
    await userEvent.click(screen.getByText(/^FVM/))
    expect(first()).toBe('Rrahmani')  // ora crescente
  })
  it('filtra per squadra', async () => {
    render(<Harness init={init} />)
    await userEvent.selectOptions(screen.getByLabelText('SquadraFiltro'), 'Inter')
    expect(screen.getByText('Lautaro')).toBeInTheDocument()
  })
  it('tag di ruoli diversi -> O (unione)', async () => {
    render(<Harness init={init} />)
    await userEvent.click(screen.getByRole('button', { name: 'tag Bomber' }))
    expect(screen.getByText('Lautaro')).toBeInTheDocument()
    expect(screen.queryByText('Rrahmani')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'tag Da bonus' }))
    expect(screen.getByText('Rrahmani')).toBeInTheDocument() // A vs D -> O: entra anche il difensore
  })
  it('tag compatibili sullo stesso ruolo -> E (intersezione)', async () => {
    render(<Harness init={init} />)
    await userEvent.click(screen.getByRole('button', { name: 'tag Bomber' }))
    await userEvent.click(screen.getByRole('button', { name: 'tag Titolarissimo' }))
    expect(screen.getByText('Lautaro')).toBeInTheDocument()
    // Rrahmani è Titolarissimo ma non Bomber -> escluso dall'AND
    expect(screen.queryByText('Rrahmani')).not.toBeInTheDocument()
  })
  it('clic sul nome apre la scheda con tutti i dati del giocatore', async () => {
    render(<Harness init={init} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lautaro' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Fantamedia')).toBeInTheDocument()
    expect(within(dialog).getByText('Rigori parati')).toBeInTheDocument()
    expect(within(dialog).getByText('Assist')).toBeInTheDocument()
    expect(within(dialog).getByText('FVM')).toBeInTheDocument()
  })
  it('la scheda si chiude', async () => {
    render(<Harness init={init} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lautaro' }))
    await userEvent.click(screen.getByRole('button', { name: /chiudi/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('rinomina fascia: le select di riga mostrano la nuova label', async () => {
    render(<Harness init={init} />)
    const input = screen.getByLabelText('Nome fascia top')
    await userEvent.clear(input)
    await userEvent.type(input, 'Fuoriclasse')
    const row = screen.getByText('Lautaro').closest('tr')!
    expect(within(row).getByRole('option', { name: 'Fuoriclasse' })).toBeInTheDocument()
  })
})
