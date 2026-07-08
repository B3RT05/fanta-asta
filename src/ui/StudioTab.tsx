import { useContext, useMemo, useState } from 'react'
import { AppCtx } from './App'
import TierBoard from './TierBoard'
import { predictPrices } from '@/logic/pricing'
import { FM_TITOLARE, PV_SOLIDO, PV_TITOLARE } from '@/logic/tiering'
import type { Role, TierId } from '@/logic/types'

export default function StudioTab() {
  const { state, dispatch } = useContext(AppCtx)
  const [role, setRole] = useState<Role | 'tutti'>('tutti')
  const [tierFilter, setTierFilter] = useState<TierId | 'tutte'>('tutte')
  const [q, setQ] = useState('')
  const [onlyReview, setOnlyReview] = useState(false)

  const prices = useMemo(() => predictPrices(state.players, state.tiers, state.league), [state.players, state.tiers, state.league])
  if (state.players.length === 0) return <main>Studio: carica prima il listone nel Setup.</main>

  const review = new Set(state.review)
  const shown = state.players.filter(p =>
    (role === 'tutti' || p.ruolo === role) &&
    (tierFilter === 'tutte' || state.tiers[p.id] === tierFilter) &&
    (!onlyReview || review.has(p.id)) &&
    p.nome.toLowerCase().includes(q.toLowerCase()),
  ).sort((a, b) => b.fvm - a.fvm)

  const isOccasione = (p: typeof shown[0]) => !!p.stats && p.stats.fm >= FM_TITOLARE[p.ruolo] && p.stats.pv >= PV_SOLIDO
    && state.tiers[p.id] !== 'top' && state.tiers[p.id] !== 'semitop'
  const isTrappola = (p: typeof shown[0]) => (state.tiers[p.id] === 'top' || state.tiers[p.id] === 'semitop')
    && (p.stats?.pv ?? 0) < PV_TITOLARE

  const planTotal = (Object.values(state.rolePlan) as number[]).reduce((a, b) => a + b, 0)

  return (
    <main>
      <section>
        <h2>Piano budget per ruolo</h2>
        {(['P', 'D', 'C', 'A'] as Role[]).map(r => (
          <label key={r}> {r} <input type="number" style={{ width: '5rem' }} value={state.rolePlan[r]}
            onChange={e => dispatch({ type: 'setRolePlan', plan: { ...state.rolePlan, [r]: Number(e.target.value) } })} /></label>
        ))}
        <span> Totale {planTotal}/{state.league.budget} {planTotal > state.league.budget && <strong className="error">sfori!</strong>}</span>
      </section>

      <details>
        <summary>Gestisci fasce</summary>
        {state.tierDefs.map(d => (
          <label key={d.id}> <input aria-label={`Nome fascia ${d.id}`} value={d.label}
            onChange={e => dispatch({ type: 'renameTier', id: d.id, label: e.target.value })} /></label>
        ))}
        <button onClick={() => dispatch({ type: 'addTier', label: `Fascia ${state.tierDefs.length + 1}` })}>+ fascia</button>
      </details>

      <section>
        <label>Ruolo <select aria-label="Ruolo" value={role} onChange={e => setRole(e.target.value as Role | 'tutti')}>
          <option value="tutti">tutti</option><option>P</option><option>D</option><option>C</option><option>A</option>
        </select></label>
        <label> Fascia <select aria-label="FasciaFiltro" value={tierFilter} onChange={e => setTierFilter(e.target.value as TierId | 'tutte')}>
          <option value="tutte">tutte</option>
          {state.tierDefs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select></label>
        <label> Cerca <input value={q} onChange={e => setQ(e.target.value)} /></label>
        <label> <input type="checkbox" checked={onlyReview} onChange={e => setOnlyReview(e.target.checked)} /> solo da rivedere ({state.review.length})</label>
      </section>

      {role !== 'tutti' && <TierBoard players={state.players.filter(p => p.ruolo === role)} />}

      <table>
        <thead><tr><th></th><th>Nome</th><th>Squadra</th><th>R</th><th>Fascia</th><th>FVM</th><th>Qt.A</th><th>Fm</th><th>Pv</th><th>Prev.</th><th></th></tr></thead>
        <tbody>
          {shown.map(p => {
            const pr = prices.get(p.id)
            return (
              <tr key={p.id}>
                <td><button aria-label={`target ${p.nome}`} onClick={() => dispatch({ type: 'toggleTarget', playerId: p.id })}>
                  {state.targets.includes(p.id) ? '★' : '☆'}</button></td>
                <td>{p.nome}{review.has(p.id) ? <span aria-hidden="true"> ⚠</span> : null}</td>
                <td>{p.squadra}</td>
                <td>{p.ruolo}</td>
                <td><select aria-label="Fascia" value={state.tiers[p.id]}
                  onChange={e => dispatch({ type: 'setTier', playerId: p.id, tier: e.target.value as TierId })}>
                  {state.tierDefs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select></td>
                <td>{p.fvm}</td><td>{p.qtA}</td>
                <td>{p.stats?.fm ?? '—'}</td><td>{p.stats?.pv ?? '—'}</td>
                <td>{pr ? `${pr.min}–${pr.max}` : '1'}</td>
                <td>{isOccasione(p)
                  ? <span className="badge b-occ">occasione</span>
                  : isTrappola(p)
                    ? <span className="badge b-trap">trappola</span>
                    : <span className="badge b-neu">neutro</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
