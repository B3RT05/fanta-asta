import { useContext, useMemo, useState } from 'react'
import { AppCtx } from './App'
import { deriveTeams, soldIds, canFieldFormation } from '@/logic/auction'
import { profileTeam } from '@/logic/profiles'
import { adviseTargets, scarcityAlerts, lastBidderRoles, contesaFor } from '@/logic/advisor'
import { predictPrices } from '@/logic/pricing'
import { computeTags, dominantTags, tagDescription } from '@/logic/tags'
import { downloadBackup } from './backup'
import Meter from './Meter'
import TeamChip from './TeamChip'
import { tierLabel, type Player, type Role } from '@/logic/types'

const ROLE_NAME: Record<Role, string> = { P: 'Portieri', D: 'Difensori', C: 'Centrocampo', A: 'Attacco' }
const titMeter = (p?: Player) => p?.stats ? Math.min(1, p.stats.pv / 34) : null
const renMeter = (p?: Player) => p?.stats ? Math.max(0, Math.min(1, (p.stats.fm - 5) / 2.2)) : null

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
          {selected && (() => {
            const pr = prices.get(selected.id)
            const cap = state.targetCaps?.[selected.id]
            return <span className="regmeta">
              <TeamChip team={selected.squadra} /> {selected.ruolo}
              {' '}<Meter value={titMeter(selected)} title="titolarità" /> <Meter value={renMeter(selected)} title="rendimento" />
              {pr && <> · previsto <strong>{pr.min}–{pr.max}</strong></>}
              {cap ? <> · <span className="myprice-tag">Mio € {cap}</span></> : null}
            </span>
          })()}
          {selected && state.targetCaps?.[selected.id] != null && price > state.targetCaps[selected.id] &&
            <p className="advice-media">⚠ stai superando il tuo prezzo ({state.targetCaps[selected.id]}) per {selected.nome}</p>}
          {warning && <p className="error">{warning}</p>}
        </form>
      </section>

      {selected && (() => {
        const c = contesaFor(selected, { prices, league: state.league, teams, profiles })
        const pr = prices.get(selected.id)
        const cap = state.targetCaps?.[selected.id]
        const tags = tagsMap.get(selected.id) ?? []
        const isTarget = state.targets.includes(selected.id)
        const roleAlert = alerts.find(a => a.role === selected.ruolo)
        const last = lastRoles.find(r => r.role === selected.ruolo)
        return (
          <section className="called">
            <h2>Consiglio sul chiamato</h2>
            <p className="called-head">
              <TeamChip team={selected.squadra} /> <strong>{selected.nome}</strong> · {ROLE_NAME[selected.ruolo]}
              {' '}<span className="badge b-neu">{tierLabel(state.tierDefs, state.tiers[selected.id])}</span>
              {isTarget && <span className="badge b-occ">★ tuo obiettivo</span>}
            </p>
            {tags.length > 0 && <div className="tags">{tags.map(t => <span key={t.id} title={tagDescription(t.id)} className={`badge tag-${t.kind}`}>{t.label}</span>)}</div>}
            <p className="hint">Prezzo previsto <strong>{pr ? `${pr.min}–${pr.max}` : '≈ 1'}</strong> · Il tuo prezzo <strong>{cap ?? '—'}</strong></p>
            <p className={`advice-${c.level}`}>
              <strong>Contesa {c.level}</strong>: {c.why}
              {c.rivals.length > 0 && <small><br />{c.rivals.map(r => r.reason).join(' · ')}</small>}
            </p>
            {last && <p className="advice-bassa">💡 {last.message}</p>}
            {roleAlert && <p className="advice-alta">⚠ {roleAlert.message}</p>}
          </section>
        )
      })()}

      {(() => {
        const myCounts: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 }
        for (const pu of myTeam.purchases) { const r = byId.get(pu.playerId)?.ruolo; if (r) myCounts[r]++ }
        const canField = canFieldFormation(myCounts)
        return (
          <section>
            <h2>La mia rosa</h2>
            <p className="hint">Budget: speso <strong>{myTeam.spent}</strong> / {state.league.budget} · residuo <strong>{myTeam.credits}</strong> · max rilancio <strong>{myTeam.maxBid}</strong></p>
            <p>Formazione schierabile: {canField
              ? <span className="badge b-occ">sì, hai un 11</span>
              : <span className="badge b-trap">non ancora</span>}</p>
            <div className="myroster">
              {(['P', 'D', 'C', 'A'] as Role[]).map(r => (
                <div key={r} className="rosterrole">
                  <h3>{ROLE_NAME[r]} {myCounts[r]}/{state.league.slots[r]}</h3>
                  {myTeam.purchases.filter(pu => byId.get(pu.playerId)?.ruolo === r).sort((a, b) => b.price - a.price).map(pu => {
                    const pl = byId.get(pu.playerId)!
                    return <div key={pu.seq} className="rosteritem"><TeamChip team={pl.squadra} /> {pl.nome} <span className="hint">{pu.price}</span></div>
                  })}
                  {myCounts[r] === 0 && <div className="hint">—</div>}
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      <section className="dashboard">
        <h2>Cruscotto lega</h2>
        <table>
          <thead><tr><th>Squadra</th><th>Crediti</th><th>Budget usato</th><th>P</th><th>D</th><th>C</th><th>A</th><th>Max rilancio</th><th>Spesa media</th></tr></thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.teamIndex} className={t.teamIndex === state.league.myTeamIndex ? 'me' : ''}>
                <td>{t.name}</td><td>{t.credits}</td>
                <td><span className="budgetbar" title={`${t.spent}/${state.league.budget}`}><i style={{ width: `${Math.min(100, Math.round(t.spent / state.league.budget * 100))}%` }} /></span></td>
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
            {(() => { const pl = byId.get(pu.playerId); return pl ? <TeamChip team={pl.squadra} /> : null })()} {byId.get(pu.playerId)?.nome} →
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
