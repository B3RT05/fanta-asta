import { useContext, useMemo, useState } from 'react'
import { AppCtx } from './App'
import { deriveTeams, soldIds } from '@/logic/auction'
import { profileTeam } from '@/logic/profiles'
import { adviseTargets, scarcityAlerts, lastBidderRoles } from '@/logic/advisor'
import { predictPrices } from '@/logic/pricing'
import { computeTags, dominantTags } from '@/logic/tags'
import { downloadBackup } from './backup'
import type { Role } from '@/logic/types'

export default function AstaTab() {
  const { state, dispatch } = useContext(AppCtx)
  const [playerText, setPlayerText] = useState('')
  const [teamIndex, setTeamIndex] = useState(0)
  const [price, setPrice] = useState(1)

  const prices = useMemo(() => predictPrices(state.players, state.tiers, state.league), [state.players, state.tiers, state.league])
  const teams = useMemo(() => deriveTeams(state.purchases, state.league, state.players), [state.purchases, state.league, state.players])
  const profiles = useMemo(() => teams.map(t => profileTeam(t, state.players, state.tiers, prices, state.league)), [teams, state.players, state.tiers, prices, state.league])
  const tagsMap = useMemo(() => computeTags(state.players), [state.players])
  if (state.players.length === 0) return <main>Asta: carica prima il listone nel Setup.</main>

  const sold = soldIds(state.purchases)
  const unsold = state.players.filter(p => !sold.has(p.id))
  const label = (p: typeof unsold[0]) => `${p.nome} (${p.squadra}, ${p.ruolo})`
  const selected = unsold.find(p => label(p) === playerText)
  const byId = new Map(state.players.map(p => [p.id, p]))

  const warning = selected && (() => {
    const t = teams[teamIndex]
    if (price > t.maxBid) return `${t.name} supera il suo max rilancio (${t.maxBid}): fuori regola, registro comunque`
    if (t.slotsLeft[selected.ruolo] === 0) return `${t.name} non ha più slot ${selected.ruolo}: fuori regola, registro comunque`
    return ''
  })()

  const register = () => {
    if (!selected || price < 1) return
    dispatch({ type: 'addPurchase', playerId: selected.id, teamIndex, price })
    setPlayerText(''); setPrice(1)
  }

  const advice = adviseTargets({ targets: state.targets, purchases: state.purchases, players: state.players, tiers: state.tiers, prices, league: state.league, teams, profiles })
  const alerts = scarcityAlerts({ purchases: state.purchases, players: state.players, tiers: state.tiers, tierDefs: state.tierDefs, league: state.league, teams })
  const lastRoles = lastBidderRoles({ league: state.league, teams })
  const history = [...state.purchases].sort((a, b) => b.seq - a.seq)

  const myTeam = teams[state.league.myTeamIndex]

  return (
    <main>
      {myTeam && myTeam.totalSlotsLeft === 0 && (
        <p className="banner">
          🏁 La tua rosa è completa: esporta il backup JSON — è la tua rete di sicurezza e lo storico prezzi per l'anno prossimo.{' '}
          <button onClick={() => downloadBackup(state)}>Esporta JSON</button>
        </p>
      )}
      <section>
        <h2>Registra acquisto</h2>
        <form onSubmit={e => { e.preventDefault(); register() }}>
          <input list="unsold" aria-label="Giocatore" placeholder="cerca giocatore..." value={playerText} onChange={e => setPlayerText(e.target.value)} />
          <datalist id="unsold">{unsold.map(p => <option key={p.id} value={label(p)} />)}</datalist>
          <select aria-label="Squadra acquirente" value={teamIndex} onChange={e => setTeamIndex(Number(e.target.value))}>
            {state.league.teams.map((n, i) => <option key={i} value={i}>{`${i + 1}. ${n}`}</option>)}
          </select>
          <input type="number" aria-label="Prezzo" min={1} value={price} onChange={e => setPrice(Number(e.target.value))} />
          <button type="submit" disabled={!selected}>Registra</button>
          {selected && prices.get(selected.id) && <span> previsto {prices.get(selected.id)!.min}–{prices.get(selected.id)!.max}</span>}
          {warning && <p className="error">{warning}</p>}
        </form>
      </section>

      <section className="dashboard">
        <h2>Cruscotto lega</h2>
        <table>
          <thead><tr><th>Squadra</th><th>Crediti</th><th>P</th><th>D</th><th>C</th><th>A</th><th>Max rilancio</th><th>Spesa media</th></tr></thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.teamIndex} className={t.teamIndex === state.league.myTeamIndex ? 'me' : ''}>
                <td>{t.name}</td><td>{t.credits}</td>
                {(['P', 'D', 'C', 'A'] as Role[]).map(r => <td key={r}>{t.slotsLeft[r]}</td>)}
                <td>{t.maxBid}</td>
                <td>{t.purchases.length > 0 ? Math.round(t.spent / t.purchases.length) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Profili avversari</h3>
        <p><small>I profili usano le tue fasce e previsioni correnti: se le cambi nello Studio, si aggiornano retroattivamente anche per gli acquisti già registrati.</small></p>
        {teams.filter(t => t.teamIndex !== state.league.myTeamIndex).map(t => (
          <div key={t.teamIndex}>
            <strong>{`Profilo ${t.name}`}</strong>: {profiles[t.teamIndex].traits.join(' · ') || 'ancora nessun pattern'}
            {(() => {
              const dom = dominantTags(t.purchases.map(pu => pu.playerId), tagsMap)
              return dom.length > 0
                ? <div className="tags">{dom.map(d => <span key={d.label} className="badge tag-pro">{d.label} ×{d.count}</span>)}</div>
                : null
            })()}
            <textarea placeholder="note pre-asta" value={state.teamNotes[t.teamIndex] ?? ''}
              onChange={e => dispatch({ type: 'setTeamNote', teamIndex: t.teamIndex, note: e.target.value })} />
          </div>
        ))}
      </section>

      <section>
        <h2>Consigli</h2>
        {alerts.map((a, i) => <p key={i} className="advice-alta">⚠ {a.message}</p>)}
        {lastRoles.map((r, i) => <p key={`lb${i}`} className="advice-bassa">💡 {r.message}</p>)}
        {advice.map(a => (
          <p key={a.playerId} className={`advice-${a.level}`}>
            <strong>{byId.get(a.playerId)?.nome}</strong> — contesa {a.level}: {a.why}
            {a.rivals.length > 0 && <small><br />{a.rivals.map(r => r.reason).join(' · ')}</small>}
          </p>
        ))}
        {advice.length === 0 && <p>Nessun target ancora da comprare (le stelle si mettono nello Studio).</p>}
      </section>

      <section>
        <h2>Cronologia</h2>
        {history.map(pu => (
          <div key={pu.seq}>
            {byId.get(pu.playerId)?.nome} →
            <select aria-label={`squadra acquisto ${pu.seq}`} value={pu.teamIndex} onChange={e => dispatch({ type: 'editPurchase', seq: pu.seq, price: pu.price, teamIndex: Number(e.target.value) })}>
              {state.league.teams.map((n, i) => <option key={i} value={i}>{`${i + 1}. ${n}`}</option>)}
            </select>
            <input type="number" value={pu.price} style={{ width: '4rem' }} aria-label={`prezzo acquisto ${pu.seq}`}
              onChange={e => { if (Number(e.target.value) >= 1) dispatch({ type: 'editPurchase', seq: pu.seq, price: Number(e.target.value), teamIndex: pu.teamIndex }) }} />
            <button aria-label={`elimina acquisto ${pu.seq}`} onClick={() => dispatch({ type: 'removePurchase', seq: pu.seq })}>elimina</button>
          </div>
        ))}
      </section>
    </main>
  )
}
