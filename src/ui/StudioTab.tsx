import { useContext, useMemo, useState } from 'react'
import { AppCtx } from './App'
import PlayerModal from './PlayerModal'
import Meter from './Meter'
import TeamChip from './TeamChip'
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
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [teamFilter, setTeamFilter] = useState('tutte')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sortKey, setSortKey] = useState('fvm')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [detailId, setDetailId] = useState<number | null>(null)

  const prices = useMemo(() => predictPrices(state.players, state.tiers, state.league), [state.players, state.tiers, state.league])
  const tagsMap = useMemo(() => computeTags(state.players), [state.players])
  if (state.players.length === 0) return <main>Studio: carica prima il listone nel Setup.</main>

  // elenco sottocategorie e squadre presenti (per i filtri)
  const tagOptions = (() => {
    const seen = new Map<string, string>()
    for (const list of tagsMap.values()) for (const t of list) seen.set(t.id, t.label)
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  })()
  const teamOptions = [...new Set(state.players.map(p => p.squadra))].sort()

  const pMin = priceMin === '' ? null : Number(priceMin)
  const pMax = priceMax === '' ? null : Number(priceMax)
  const review = new Set(state.review)
  const filtered = state.players.filter(p => {
    const base = prices.get(p.id)?.base ?? null
    return (role === 'tutti' || p.ruolo === role) &&
      (tierFilter === 'tutte' || state.tiers[p.id] === tierFilter) &&
      (teamFilter === 'tutte' || p.squadra === teamFilter) &&
      (!onlyReview || review.has(p.id)) &&
      (selectedTags.size === 0 || (tagsMap.get(p.id) ?? []).some(t => selectedTags.has(t.id))) &&
      (pMin === null || (base !== null && base >= pMin)) &&
      (pMax === null || (base !== null && base <= pMax)) &&
      matchesQuery([p.nome, p.squadra], q)
  })

  const tierIdx = (id: number) => state.tierDefs.findIndex(d => d.id === state.tiers[id])
  const sortVal = (p: typeof filtered[0]): number | string => {
    switch (sortKey) {
      case 'nome': return p.nome.toLowerCase()
      case 'squadra': return p.squadra
      case 'ruolo': return p.ruolo
      case 'fascia': return tierIdx(p.id)
      case 'titolarita': case 'pv': return p.stats?.pv ?? -1
      case 'rendimento': case 'fm': return p.stats?.fm ?? -1
      case 'qta': return p.qtA
      case 'prezzo': return prices.get(p.id)?.base ?? -1
      default: return p.fvm
    }
  }
  const shown = [...filtered].sort((a, b) => {
    const va = sortVal(a), vb = sortVal(b)
    const c = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : (va as number) - (vb as number)
    return sortDir === 'asc' ? c : -c
  })
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'nome' || k === 'squadra' || k === 'ruolo' ? 'asc' : 'desc') }
  }
  const arrow = (k: string) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

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
        <label> Squadra <select aria-label="SquadraFiltro" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
          <option value="tutte">tutte</option>
          {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select></label>
        <label> Prezzo previsto <input type="number" aria-label="Prezzo min" placeholder="min" style={{ width: '4.5rem' }} value={priceMin} onChange={e => setPriceMin(e.target.value)} />
          <input type="number" aria-label="Prezzo max" placeholder="max" style={{ width: '4.5rem' }} value={priceMax} onChange={e => setPriceMax(e.target.value)} /></label>
        <button onClick={() => { setRole('tutti'); setTierFilter('tutte'); setTeamFilter('tutte'); setSelectedTags(new Set()); setQ(''); setOnlyReview(false); setPriceMin(''); setPriceMax('') }}>Azzera filtri</button>
        <span className="hint"> {shown.length} giocatori</span>
      </section>

      <section className="tagfilter" aria-label="Filtro sottocategorie">
        <span className="hint">Sottocategorie (clic per selezionarne più di una):</span>
        <div className="tags">
          {tagOptions.map(([id, label]) => (
            <button key={id} aria-label={`tag ${label}`} className={`badge tagpick ${selectedTags.has(id) ? 'on' : ''}`}
              onClick={() => setSelectedTags(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })}>{label}</button>
          ))}
          {selectedTags.size > 0 && <button className="link" onClick={() => setSelectedTags(new Set())}>azzera tag</button>}
        </div>
      </section>

      <div className="tablescroll">
      <table className="studio-table">
        <thead><tr>
          <th></th>
          <th className="sortable" onClick={() => toggleSort('nome')}>Nome{arrow('nome')}</th>
          <th className="sortable" onClick={() => toggleSort('squadra')}>Squadra{arrow('squadra')}</th>
          <th className="sortable" onClick={() => toggleSort('ruolo')}>R{arrow('ruolo')}</th>
          <th className="sortable" onClick={() => toggleSort('fascia')}>Fascia{arrow('fascia')}</th>
          <th className="sortable" onClick={() => toggleSort('titolarita')}>Titolarità{arrow('titolarita')}</th>
          <th className="sortable" onClick={() => toggleSort('rendimento')}>Rendim.{arrow('rendimento')}</th>
          <th className="sortable" onClick={() => toggleSort('fvm')}>FVM{arrow('fvm')}</th>
          <th className="sortable" onClick={() => toggleSort('qta')}>Qt.A{arrow('qta')}</th>
          <th className="sortable" onClick={() => toggleSort('fm')}>Fm{arrow('fm')}</th>
          <th className="sortable" onClick={() => toggleSort('pv')}>Pv{arrow('pv')}</th>
          <th className="sortable" onClick={() => toggleSort('prezzo')}>Prev.{arrow('prezzo')}</th>
          <th></th><th>Tag</th>
        </tr></thead>
        <tbody>
          {shown.map(p => {
            const pr = prices.get(p.id)
            return (
              <tr key={p.id}>
                <td><button className="star" aria-label={`target ${p.nome}`} onClick={() => dispatch({ type: 'toggleTarget', playerId: p.id })}>
                  {state.targets.includes(p.id) ? '★' : '☆'}</button></td>
                <td><button className="link" onClick={() => setDetailId(p.id)}>{p.nome}</button>{review.has(p.id) ? <span aria-hidden="true"> ⚠</span> : null}</td>
                <td><TeamChip team={p.squadra} /></td>
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
