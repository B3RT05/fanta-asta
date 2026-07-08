import { useContext, useMemo } from 'react'
import { AppCtx } from './App'
import { predictPrices } from '@/logic/pricing'
import { tierLabel, type Role } from '@/logic/types'

const ROLE_NAME: Record<Role, string> = { P: 'Portieri', D: 'Difensori', C: 'Centrocampo', A: 'Attacco' }
const ROLE_COLOR: Record<Role, string> = { P: 'var(--gold)', D: 'var(--teal)', C: 'var(--purple)', A: 'var(--primary)' }

export default function StrategiaTab() {
  const { state, dispatch } = useContext(AppCtx)
  const prices = useMemo(() => predictPrices(state.players, state.tiers, state.league), [state.players, state.tiers, state.league])
  const byId = useMemo(() => new Map(state.players.map(p => [p.id, p])), [state.players])

  const roles: Role[] = ['P', 'D', 'C', 'A']
  const plan = state.rolePlan
  const planTotal = roles.reduce((s, r) => s + (plan[r] || 0), 0)
  const budget = state.league.budget
  const caps = state.targetCaps ?? {}

  // obiettivi (stelle) raggruppati per ruolo
  const targets = state.targets.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
  const capTotal = state.targets.reduce((s, id) => s + (caps[id] || 0), 0)

  const setPlan = (r: Role, v: number) => dispatch({ type: 'setRolePlan', plan: { ...plan, [r]: v } })

  return (
    <main>
      <section>
        <h2>Il tuo piano d'asta</h2>
        <textarea aria-label="Piano d'asta" style={{ minHeight: '9rem' }}
          placeholder={"Scrivi qui la tua strategia: filosofia, reparto per reparto, timing, regole personali, piano B…\n\nEs. Difesa da modificatore + 1 top attacco. Chiudo presto porta e difensori. Mai oltre 30 su un portiere."}
          value={state.strategyNotes ?? ''}
          onChange={e => dispatch({ type: 'setStrategyNotes', notes: e.target.value })} />
      </section>

      <section>
        <h2>Ripartizione budget per reparto</h2>
        <div className="plan-bar">
          {roles.map(r => plan[r] > 0 && (
            <span key={r} title={`${ROLE_NAME[r]}: ${plan[r]}`}
              style={{ width: `${(plan[r] / Math.max(budget, planTotal)) * 100}%`, background: ROLE_COLOR[r] }}>
              {plan[r] >= budget * 0.06 ? `${r} ${plan[r]}` : ''}
            </span>
          ))}
        </div>
        <div className="plan-inputs">
          {roles.map(r => (
            <label key={r}>{ROLE_NAME[r]} <input type="number" min={0} value={plan[r] || 0}
              onChange={e => setPlan(r, Number(e.target.value))} /></label>
          ))}
        </div>
        <p className={planTotal > budget ? 'error' : 'hint'}>
          Totale pianificato: <strong>{planTotal}</strong> / {budget} crediti
          {planTotal > budget ? ' — stai sforando!' : ` (liberi ${budget - planTotal})`}
        </p>
      </section>

      <section>
        <h2>Lista della spesa (obiettivi)</h2>
        {targets.length === 0
          ? <p className="hint">Nessun obiettivo: metti le stelle ⭐ ai giocatori nello Studio, poi qui decidi quanto sei disposto a pagarli.</p>
          : <>
            <div className="dashboard">
              <table>
                <thead><tr><th>Giocatore</th><th>R</th><th>Fascia</th><th>Prezzo previsto</th><th>Max che pago</th></tr></thead>
                <tbody>
                  {roles.flatMap(r => targets.filter(p => p.ruolo === r)).map(p => {
                    const pr = prices.get(p.id)
                    const cap = caps[p.id] ?? 0
                    const over = pr && cap > 0 && cap > pr.max
                    return (
                      <tr key={p.id}>
                        <td>{p.nome} <small className="hint">{p.squadra}</small></td>
                        <td>{p.ruolo}</td>
                        <td><span className="badge b-neu">{tierLabel(state.tierDefs, state.tiers[p.id])}</span></td>
                        <td>{pr ? `${pr.min}–${pr.max}` : '≈ 1'}</td>
                        <td><input type="number" min={0} aria-label={`max ${p.nome}`} style={{ width: '5rem' }}
                          value={cap || ''} placeholder="—"
                          onChange={e => dispatch({ type: 'setTargetCap', playerId: p.id, cap: Number(e.target.value) })} />
                          {over ? <span className="badge b-trap" style={{ marginLeft: '.4rem' }}>sopra il previsto</span> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className={capTotal > budget ? 'error' : 'hint'}>
              Somma dei tetti: <strong>{capTotal}</strong> / {budget} crediti
              {capTotal > budget ? ' — oltre il budget!' : ''}
            </p>
            {roles.map(r => {
              const sub = targets.filter(p => p.ruolo === r).reduce((s, p) => s + (caps[p.id] || 0), 0)
              if (sub === 0) return null
              const over = plan[r] > 0 && sub > plan[r]
              return <span key={r} className={`hint ${over ? 'error' : ''}`} style={{ marginRight: '1rem' }}>
                {ROLE_NAME[r]}: {sub}{plan[r] > 0 ? `/${plan[r]}` : ''}{over ? ' ⚠' : ''}</span>
            })}
          </>}
      </section>
    </main>
  )
}
