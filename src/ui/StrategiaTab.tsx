import { useContext, useMemo, useState } from 'react'
import { AppCtx } from './App'
import { predictPrices } from '@/logic/pricing'
import { computeTags } from '@/logic/tags'
import { generateStrategyVariants, MAX_SINGLE_PCT, type StrategyVariant } from '@/logic/strategy'
import { shoppingListText } from '@/logic/exportList'
import Pitch from './Pitch'
import { MODULES, moduleLabel, type Formation } from '@/logic/formation'
import { tierLabel, type Role } from '@/logic/types'

const ROLE_NAME: Record<Role, string> = { P: 'Portieri', D: 'Difensori', C: 'Centrocampo', A: 'Attacco' }
const ROLE_COLOR: Record<Role, string> = { P: 'var(--gold)', D: 'var(--teal)', C: 'var(--purple)', A: 'var(--primary)' }

export default function StrategiaTab() {
  const { state, dispatch } = useContext(AppCtx)
  const prices = useMemo(() => predictPrices(state.players, state.tiers, state.league), [state.players, state.tiers, state.league])
  const tagsMap = useMemo(() => computeTags(state.players), [state.players])
  const byId = useMemo(() => new Map(state.players.map(p => [p.id, p])), [state.players])
  const [desc, setDesc] = useState('')
  const [moduleKey, setModuleKey] = useState('auto') // 'auto' o "D-C-A"
  const [variants, setVariants] = useState<StrategyVariant[]>([])
  const [seen, setSeen] = useState<Set<number>>(new Set()) // titolari già proposti, per generarne di diversi

  const chosenModule: Formation | undefined = MODULES.find(m => moduleLabel(m) === moduleKey)

  const proponi = (avoid: Set<number>) => {
    const vs = generateStrategyVariants(desc, state.players, state.tiers, tagsMap, prices, state.league, state.manualCaps ?? {}, avoid, chosenModule)
    setVariants(vs)
    const paid = vs.flatMap(v => v.targets.filter(id => (v.caps[id] ?? 0) > 1))
    setSeen(prev => new Set([...prev, ...paid]))
  }
  const genera = () => { setSeen(new Set()); proponi(new Set()) }        // primo batch: parte pulito
  const generaDiverse = () => proponi(seen)                              // altre 3: evita quelle già viste
  const scegli = (v: StrategyVariant) => {
    if (window.confirm(`Applico «${v.label}» e sovrascrivo budget, obiettivi e note attuali?`)) {
      dispatch({ type: 'applyStrategy', rolePlan: v.rolePlan, targets: v.targets, caps: v.caps, notes: v.notes })
      setVariants([])
    }
  }

  const roles: Role[] = ['P', 'D', 'C', 'A']
  const plan = state.rolePlan
  const planTotal = roles.reduce((s, r) => s + (plan[r] || 0), 0)
  const budget = state.league.budget
  const caps: Record<number, number> = { ...(state.targetCaps ?? {}), ...(state.manualCaps ?? {}) } // manuali prevalgono

  // obiettivi (stelle) raggruppati per ruolo
  const targets = state.targets.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
  const capTotal = state.targets.reduce((s, id) => s + (caps[id] || 0), 0)

  const setPlan = (r: Role, v: number) => dispatch({ type: 'setRolePlan', plan: { ...plan, [r]: v } })

  return (
    <main>
      <section>
        <h2>Genera strategia da una descrizione</h2>
        <p className="hint">Descrivi come vuoi giocare l'asta: l'app riconosce concetti come <em>attacco, difesa, modificatore, centrocampo, portiere low cost/forte, scommesse, equilibrato</em> e prepara budget e lista obiettivi. È una bozza offline, poi la rifinisci a mano.</p>
        <input aria-label="Descrizione strategia" style={{ width: '100%', maxWidth: '40rem' }}
          placeholder="es. difesa da modificatore e un top in attacco, portiere low cost, qualche scommessa"
          value={desc} onChange={e => setDesc(e.target.value)} />
        <div style={{ margin: '.5rem 0' }}>
          <label>Modulo{' '}
            <select aria-label="Modulo" value={moduleKey} onChange={e => setModuleKey(e.target.value)}>
              <option value="auto">Auto (dai giocatori)</option>
              {MODULES.map(m => <option key={moduleLabel(m)} value={moduleLabel(m)}>{moduleLabel(m)}</option>)}
            </select>
          </label>
          <span className="hint" style={{ marginLeft: '.6rem' }}>
            più difensori (4-5) = modificatore più solido; non sei obbligato alla difesa a 3.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn-primary" disabled={state.players.length === 0} onClick={genera}>Genera 3 strategie</button>
          {variants.length > 0 && <button disabled={state.players.length === 0} onClick={generaDiverse}>↻ Altre 3 diverse</button>}
        </div>

        {variants.length > 0 && (
          <div className="strat-cards">
            {variants.map(v => {
              const paid = roles.map(r => ({
                r, names: v.targets
                  .filter(id => byId.get(id)?.ruolo === r && (v.caps[id] ?? 0) > 1)
                  .map(id => `${byId.get(id)!.nome} ${v.caps[id]}`),
              })).filter(x => x.names.length > 0)
              return (
                <div key={v.style} className="strat-card">
                  <h3>{v.label}</h3>
                  <p className="hint" style={{ marginTop: 0 }}>{v.sublabel}</p>
                  <div className="plan-bar" style={{ margin: '.4rem 0' }}>
                    {roles.map(r => v.rolePlan[r] > 0 && (
                      <span key={r} title={`${ROLE_NAME[r]}: ${v.rolePlan[r]}`}
                        style={{ width: `${(v.rolePlan[r] / budget) * 100}%`, background: ROLE_COLOR[r] }}>
                        {v.rolePlan[r] >= budget * 0.06 ? r : ''}</span>
                    ))}
                  </div>
                  <p className="hint" style={{ margin: '.2rem 0' }}>Spesa stimata <strong>{v.spesaStimata}</strong>/{budget}</p>
                  {paid.map(({ r, names }) => (
                    <p key={r} style={{ margin: '.15rem 0', fontSize: '.85rem' }}>
                      <span className="badge b-neu" style={{ background: ROLE_COLOR[r], color: '#fff' }}>{r}</span>{' '}
                      {names.join(' · ')}</p>
                  ))}
                  <div style={{ marginTop: '.6rem' }}>
                    <button className="btn-primary" onClick={() => scegli(v)}>Scegli questa</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

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

      {targets.length > 0 && (
        <section>
          <h2>Il tuo 11 titolare (dagli obiettivi)</h2>
          <Pitch players={targets} formation={chosenModule} />
        </section>
      )}

      <section>
        <h2>Lista della spesa (obiettivi)</h2>
        {targets.length > 0 && (() => {
          const txt = shoppingListText(state, prices)
          const copia = async () => { try { await navigator.clipboard.writeText(txt); alert('Lista copiata negli appunti!') } catch { alert('Copia non riuscita: seleziona e copia a mano.') } }
          const scarica = () => {
            const blob = new Blob([txt], { type: 'text/plain' })
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
            a.download = `lista-spesa-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); URL.revokeObjectURL(a.href)
          }
          return <p><button onClick={copia}>📋 Copia lista</button><button onClick={scarica}>⬇ Scarica .txt</button></p>
        })()}
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
                    const overBudget = cap > budget * MAX_SINGLE_PCT // disciplina: >35% del budget su un singolo
                    return (
                      <tr key={p.id}>
                        <td>{p.nome} <small className="hint">{p.squadra}</small></td>
                        <td>{p.ruolo}</td>
                        <td><span className="badge b-neu">{tierLabel(state.tierDefs, state.tiers[p.id])}</span></td>
                        <td>{pr ? `${pr.min}–${pr.max}` : '≈ 1'}</td>
                        <td><input type="number" min={0} aria-label={`max ${p.nome}`} style={{ width: '5rem' }}
                          value={cap || ''} placeholder="—"
                          onChange={e => dispatch({ type: 'setTargetCap', playerId: p.id, cap: Number(e.target.value) })} />
                          {over ? <span className="badge b-trap" style={{ marginLeft: '.4rem' }}>sopra il previsto</span> : null}
                          {overBudget ? <span className="badge b-trap" style={{ marginLeft: '.4rem' }} title={`Oltre il ${Math.round(MAX_SINGLE_PCT * 100)}% del budget: il Metodo CarmySpecial sconsiglia di superarlo su un singolo`}>{Math.round(cap / budget * 100)}% del budget</span> : null}</td>
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
