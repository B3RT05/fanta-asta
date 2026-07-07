import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Il progetto non usa test.globals di vitest, quindi l'auto-cleanup di
// @testing-library/react (che si registra su un global afterEach) non scatta:
// lo registriamo esplicitamente per smontare il DOM tra un test e l'altro.
afterEach(cleanup)

// Node >=22 espone un global `localStorage` sperimentale che richiede il flag
// --localstorage-file per funzionare; senza quel flag `setItem` non è nemmeno
// una funzione. Vitest (nella versione installata) non rimpiazza questo global
// con quello di jsdom perché "localStorage" non è nella sua whitelist di chiavi
// window -> global, quindi lo stub rotto di Node resta attivo anche in ambiente
// jsdom. Sostituiamo il global con un polyfill minimale conforme all'interfaccia
// Storage, sufficiente per i test (storage.ts usa solo getItem/setItem).
if (typeof window !== 'undefined') {
  class MemoryStorage {
    #data = new Map<string, string>()
    getItem(key: string): string | null { return this.#data.has(key) ? this.#data.get(key)! : null }
    setItem(key: string, value: string): void { this.#data.set(key, String(value)) }
    removeItem(key: string): void { this.#data.delete(key) }
    clear(): void { this.#data.clear() }
    key(index: number): string | null { return Array.from(this.#data.keys())[index] ?? null }
    get length(): number { return this.#data.size }
  }
  const memoryStorage = new MemoryStorage()
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'localStorage', {
      value: memoryStorage,
      configurable: true,
      writable: true,
    })
  }
}
