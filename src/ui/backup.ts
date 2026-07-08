import { exportJson } from '@/logic/storage'
import type { AppState } from '@/logic/types'

export function downloadBackup(state: AppState): void {
  const blob = new Blob([exportJson(state)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `fanta-asta-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
