import { useContext, useRef, useState } from 'react'
import { AppCtx } from './App'
import { parseListone } from '@/logic/parseListone'
import { parseStats } from '@/logic/parseStats'
import { importJson } from '@/logic/storage'
import { downloadBackup } from './backup'
import { DEFAULT_LEAGUE, type Role } from '@/logic/types'

async function readFile(f: File): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer())
}

export default function SetupTab() {
  const { state, dispatch } = useContext(AppCtx)
  const [error, setError] = useState('')
  const jsonInput = useRef<HTMLInputElement>(null)

  const onListone = async (f: File | undefined) => {
    if (!f) return
    try {
      const players = parseListone(await readFile(f))
      if (state.purchases.length > 0) {
        const ids = new Set(players.map(p => p.id))
        const missing = state.purchases.filter(pu => !ids.has(pu.playerId)).length
        if (missing > 0) {
          const ok = window.confirm(
            `${missing} acquisti registrati riferiscono giocatori assenti dal nuovo listone: budget e slot potrebbero risultare incoerenti. Continuare comunque?`
          )
          if (!ok) return
        }
      }
      dispatch({ type: 'importListone', players })
      setError('')
    }
    catch (e) { setError((e as Error).message) }
  }
  const onStats = async (f: File | undefined) => {
    if (!f) return
    try { dispatch({ type: 'importStats', stats: parseStats(await readFile(f)) }); setError('') }
    catch (e) { setError((e as Error).message) }
  }
  const setLeague = (patch: Partial<typeof state.league>) =>
    dispatch({ type: 'setLeague', league: { ...state.league, ...patch } })

  const withStats = state.players.filter(p => p.stats).length
  return (
    <main className="setup">
      {error && <p className="error" role="alert">{error}</p>}
      <section>
        <h2>1. Listone quotazioni</h2>
        <input type="file" accept=".xlsx" aria-label="File listone" onChange={e => onListone(e.target.files?.[0])} />
        <p>{state.players.length > 0 ? `${state.players.length} giocatori caricati` : 'Carica il file Quotazioni di Fantacalcio.it (obbligatorio)'}</p>
        <h2>2. Statistiche stagione precedente (opzionale)</h2>
        <input type="file" accept=".xlsx" aria-label="File statistiche" onChange={e => onStats(e.target.files?.[0])} />
        <p>{withStats > 0 ? `Statistiche per ${withStats} giocatori` : 'Migliora fasce e previsioni'}</p>
      </section>
      <section>
        <h2>Lega</h2>
        <label>Budget <input type="number" aria-label="Budget" value={state.league.budget}
          onChange={e => setLeague({ budget: Number(e.target.value) })} /></label>
        {(['P', 'D', 'C', 'A'] as Role[]).map(r => (
          <label key={r}>Slot {r} <input type="number" value={state.league.slots[r]}
            onChange={e => setLeague({ slots: { ...state.league.slots, [r]: Number(e.target.value) } })} /></label>
        ))}
        <h3>Squadre</h3>
        {state.league.teams.map((name, i) => (
          <div key={i}>
            <input value={name} aria-label={`Nome squadra ${i + 1}`}
              onChange={e => setLeague({ teams: state.league.teams.map((n, j) => j === i ? e.target.value : n) })} />
            <label><input type="radio" name="me" checked={state.league.myTeamIndex === i}
              onChange={() => setLeague({ myTeamIndex: i })} /> io</label>
          </div>
        ))}
        <button onClick={() => setLeague({ teams: [...state.league.teams, `Squadra ${state.league.teams.length + 1}`] })}>+ squadra</button>
        <button disabled={state.league.teams.length <= 2}
          onClick={() => setLeague({ teams: state.league.teams.slice(0, -1), myTeamIndex: Math.min(state.league.myTeamIndex, state.league.teams.length - 2) })}>− squadra</button>
        <button onClick={() => setLeague(structuredClone(DEFAULT_LEAGUE))}>Ripristina default</button>
      </section>
      <section>
        <h2>Backup</h2>
        <button onClick={() => downloadBackup(state)}>Esporta JSON</button>
        <input ref={jsonInput} type="file" accept=".json" style={{ display: 'none' }} onChange={async e => {
          const f = e.target.files?.[0]
          if (!f) return
          try { dispatch({ type: 'replaceState', state: importJson(await f.text()) }); setError('') }
          catch (err) { setError((err as Error).message) }
        }} />
        <button onClick={() => jsonInput.current?.click()}>Importa JSON</button>
      </section>
    </main>
  )
}
