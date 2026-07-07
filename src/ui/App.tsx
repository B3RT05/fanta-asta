import { createContext, useEffect, useReducer, useState, type Dispatch } from 'react'
import { reducer, type Action } from '@/state/reducer'
import { initialState, loadState, saveState } from '@/logic/storage'
import type { AppState } from '@/logic/types'
import SetupTab from './SetupTab'
import StudioTab from './StudioTab'
import AstaTab from './AstaTab'
import './styles.css'

export const AppCtx = createContext<{ state: AppState; dispatch: Dispatch<Action> }>(null!)

type Tab = 'setup' | 'studio' | 'asta'

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? initialState())
  const [tab, setTab] = useState<Tab>('setup')
  useEffect(() => {
    try { saveState(state) }
    catch (err) { console.warn('salvataggio non riuscito', err) }
  }, [state])
  return (
    <AppCtx.Provider value={{ state, dispatch }}>
      <header className="topbar">
        <h1>Fanta Asta</h1>
        <nav>
          {(['setup', 'studio', 'asta'] as Tab[]).map(t => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'setup' ? 'Setup' : t === 'studio' ? 'Studio' : 'Asta'}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'setup' && <SetupTab />}
      {tab === 'studio' && <StudioTab />}
      {tab === 'asta' && <AstaTab />}
    </AppCtx.Provider>
  )
}
