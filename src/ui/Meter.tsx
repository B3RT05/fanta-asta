/** Barretta-indicatore a segmenti (stile "dashboard"): value 0..1.
 *  Colore per livello: verde alto, ambra medio, rosso basso. */
export default function Meter({ value, title, segments = 4 }: { value: number | null; title?: string; segments?: number }) {
  if (value == null) return <span className="meter-empty" title="dato mancante">—</span>
  const v = Math.max(0, Math.min(1, value))
  const filled = Math.max(v > 0 ? 1 : 0, Math.round(v * segments))
  const level = v >= 0.66 ? 'hi' : v >= 0.33 ? 'mid' : 'lo'
  return (
    <span className={`meter meter-${level}`} title={title ?? `${Math.round(v * 100)}%`} aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
    </span>
  )
}
