import { describe, it, expect } from 'vitest'
import { initialState, saveState, loadState, exportJson, importJson, STORAGE_KEY } from '@/logic/storage'

const memStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v) }
}

describe('storage', () => {
  it('round-trip su store', () => {
    const store = memStore()
    const s = initialState()
    s.league.budget = 650
    saveState(s, store)
    expect(loadState(store)!.league.budget).toBe(650)
  })
  it('corrotto -> null', () => {
    const store = memStore()
    store.setItem(STORAGE_KEY, '{non-json')
    expect(loadState(store)).toBeNull()
  })
  it('export/import JSON round-trip', () => {
    const s = initialState()
    s.targets = [42]
    expect(importJson(exportJson(s)).targets).toEqual([42])
  })
  it('import invalido -> throw', () => {
    expect(() => importJson('{"pippo":1}')).toThrow()
  })
})
