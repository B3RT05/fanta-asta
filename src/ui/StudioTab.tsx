import { useContext, useMemo, useState } from 'react'
import { AppCtx } from './App'
import PlayerModal from './PlayerModal'
import Meter from './Meter'
import { predictPrices } from '@/logic/pricing'
import { computeTags } from '@/logic/tags'
import { matchesQuery } from '@/logic/search'
import { FM_TITOLARE, PV_SOLIDO, PV_TITOLARE } from '@/logic/tiering'
import type { Role, TierId } from '@/logic/types'

export default function StudioTab() {
  const { state, dispatch } = useContext(AppCtx)
  const [role, setRole] = useState<Role | 'tutti'>('tutti')
  const [tierFilter, setTierFilter] = useState<TierId | 'tutte'>('tutte')
  const [q, setQ] = useState('')
  const [onlyReview, setOnlyReview] = useState(false)
  const [tagFilter, setTagFilter] = useState('tutte')
  const [detailId, setDetailId] = useState<number | null>(null)

  const prices = useMemo(() => predictPrices(state.players, state.tiers, state.league), [state.players, state.tiers, state.league])
  const tagsMap = useMemo(() => computeTags(state.players), [state.players])
  if (state.players.length === 0) return <main>Studio: carica prima il listone nel Setup.</main>

  // elenco sottocategorie presenti (per il filtro)
  const tagOptions = (() => {
    const seen = new Map<string, string>()
    for (const list of tagsMap.values()) for (const t of list) seen.set(t.id, t.label)
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  })()

  const review = new Set(state.review)
  const shown = state.players.filter(p =>
    (role === 'tutti' || p.ruolo === role) &&
    (tierFilter === 'tutte' || state.tiers[p.id] === tierFilter) &&
    (!onlyReview || review.has(p.id)) &&
    (tagFilter === 'tutte' || (tagsMap.get(p.id) ?? []).some(t => t.id === tagFilter)) &&
    matchesQuery([p.nome, p.squadra], q),
  ).sort((a, b) => b.fvm - a.fvm)

  const isOccasione = (p: typeof shown[0]) => !!p.stats && p.stats.fm >= FM_TITOLARE[p.ruolo] && p.stats.pv >= PV_SOLIDO
    && state.tiers[p.id] !== 'top' && state.tiers[p.id] !== 'semitop'
  const isTrappola = (p: typeof shown[0]) => (state.tiers[p.id] === 'top' || state.tiers[p.id] === 'semitop')
    && (p.stats?.pv ?? 0) < PV_TITOLARE

  const planTotal = (Object.values(state.rolePlan) as number[]).reduce((a, b) => a + b, 0)

  // indicatori visivi (0..1) dai dati che abbiamo
  const titolarita = (p: typeof shown[0]) => p.stats ? Math.min(1, p.stats.pv / 34) : null
  const rendimento = (p: typeof shown[0]) => p.stats ? Math.max(0, Math.min(1, (p.stats.fm - 5) / 2.2)) : null

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
        <button className="btn-primary" onClick={() => {
          if (window.confirm('Ricalcolo le fasce dai dati correnti (rendimento se hai caricato le statistiche, altrimenti FVM)? Le modifiche manuali alle fasce verranno sovrascritte.'))
            dispatch({ type: 'recomputeTiers' })
        }}>Ricalcola fasce dai dati</button>
      </details>

      <section>
        <label>Ruolo <select aria-label="Ruolo" value={role} onChange={e => setRole(e.target.value as Role | 'tutti')}>
          <option value="tutti">tutti</option><option>P</option><option>D</option><option>C</option><option>A</option>
        </select></label>
        <label> Fascia <select aria-label="FasciaFiltro" value={tierFilter} onChange={e => setTierFilter(e.target.value as TierId | 'tutte')}>
          <option value="tutte">tutte</option>
          {state.tierDefs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select></label>
        <label> Cerca <input aria-label="Cerca" placeholder="cognome o squadra…" value={q} onChange={e => setQ(e.target.value)} /></label>
        <label> <input type="checkbox" checked={onlyReview} onChange={e => setOnlyReview(e.target.checked)} /> solo da rivedere ({state.review.length})</label>
        <label> Sottocategoria <select aria-label="Sottocategoria" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="tutte">tutte</option>
          {tagOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
      </section>

      <div className="tablescroll">
      <table className="studio-table">
        <thead><tr><th></th><th>Nome</th><th>Squadra</th><th>R</th><th>Fascia</th><th>Titolarità</th><th>Rendim.</th><th>FVM</th><th>Qt.A</th><th>Fm</th><th>Pv</th><th>Prev.</th><th></th><th>Tag</th></tr></thead>
        <tbody>
          {shown.map(p => {
            const pr = prices.get(p.id)
            return (
              <tr key={p.id}>
                <td><button className="star" aria-label={`target ${p.nome}`} onClick={() => dispatch({ type: 'toggleTarget', playerId: p.id })}>
                  {state.targets.includes(p.id) ? '★' : '☆'}</button></td>
                <td><button className="link" onClick={() => setDetailId(p.id)}>{p.nome}</button>{review.has(p.id) ? <span aria-hidden="true"> ⚠</span> : null}</td>
                <td className="muted">{p.squadra}</td>
                <td><span className={`rolebadge r-${p.ruolo}`}>{p.ruolo}</span></td>
                <td><select aria-label="Fascia" value={state.tiers[p.id]}
                  onChange={e => dispatch({ type: 'setTier', playerId: p.id, tier: e.target.value as TierId })}>
                  {state.tierDefs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select></td>
                <td><Meter value={titolarita(p)} title={p.stats ? `${p.stats.pv} presenze` : undefined} /></td>
                <td><Meter value={rendimento(p)} title={p.stats ? `fantamedia ${p.stats.fm}` : undefined} /></td>
                <td>{p.fvm}</td><td>{p.qtA}</td>
                <td>{p.stats?.fm ?? '—'}</td><td>{p.stats?.pv ?? '—'}</td>
                <td>{pr ? `${pr.min}–${pr.max}` : '1'}</td>
                <td>{isOccasione(p)
                  ? <span className="badge b-occ">occasione</span>
                  : isTrappola(p)
                    ? <span className="badge b-trap">trappola</span>
                    : <span className="badge b-neu">neutro</span>}</td>
                <td className="tagcell"><div className="tags">
                  {(tagsMap.get(p.id) ?? []).map(t => <span key={t.id} className={`badge tag-${t.kind}`}>{t.label}</span>)}
                </div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      {detailId !== null && (() => {
        const p = state.players.find(pl => pl.id === detailId)
        if (!p) return null
        return <PlayerModal player={p} tierDefs={state.tierDefs} tier={state.tiers[p.id]}
          price={prices.get(p.id)} isTarget={state.targets.includes(p.id)} tags={tagsMap.get(p.id) ?? []} onClose={() => setDetailId(null)} />
      })()}
    </main>
  )
}
