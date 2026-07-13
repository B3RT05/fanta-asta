import { tierLabel, type Player, type PlayerStats, type PriceRange, type TierDef, type TierId } from '@/logic/types'
import { tagDescription, type Tag } from '@/logic/tags'
import Meter from './Meter'
import TeamChip from './TeamChip'

const ROLE_LABEL: Record<string, string> = { P: 'Portiere', D: 'Difensore', C: 'Centrocampista', A: 'Attaccante' }

// tutte le statistiche stagionali, con etichetta leggibile
const STAT_ROWS: [keyof PlayerStats, string][] = [
  ['pv', 'Presenze (a voto)'],
  ['mv', 'Media voto'],
  ['fm', 'Fantamedia'],
  ['gf', 'Gol fatti'],
  ['gs', 'Gol subiti'],
  ['ass', 'Assist'],
  ['rp', 'Rigori parati'],
  ['rc', 'Rigori calciati'],
  ['rPlus', 'Rigori segnati'],
  ['rMinus', 'Rigori sbagliati'],
  ['amm', 'Ammonizioni'],
  ['esp', 'Espulsioni'],
  ['au', 'Autogol'],
]

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="kv"><dt>{k}</dt><dd>{v}</dd></div>
}

export default function PlayerModal({ player, tierDefs, tier, price, isTarget, tags, myPrice, onClose }: {
  player: Player
  tierDefs: TierDef[]
  tier: TierId
  price?: PriceRange
  isTarget: boolean
  tags: Tag[]
  myPrice?: number
  onClose: () => void
}) {
  const p = player
  const diff = p.qtA - p.qtI
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={`Scheda ${p.nome}`} onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>{p.nome} {isTarget && <span title="target" className="star">★</span>}</h2>
            <p className="hint"><TeamChip team={p.squadra} /> {p.squadra} · {ROLE_LABEL[p.ruolo] ?? p.ruolo}{p.ruoliMantra.length ? ` · Mantra: ${p.ruoliMantra.join(', ')}` : ''}</p>
          </div>
          <button aria-label="Chiudi" onClick={onClose}>✕</button>
        </header>

        {tags.length > 0 && (
          <section className="modal-block">
            <h3>Caratteristiche</h3>
            <div className="tags">
              {tags.map(t => <span key={t.id} title={tagDescription(t.id)} className={`badge tag-${t.kind}`}>{t.label}</span>)}
            </div>
          </section>
        )}

        {p.stats && (
          <section className="modal-block">
            <h3>Indicatori</h3>
            <dl className="kvgrid">
              <Row k="Titolarità" v={<Meter value={Math.min(1, p.stats.pv / 34)} title={`${p.stats.pv} presenze`} />} />
              <Row k="Rendimento" v={<Meter value={Math.max(0, Math.min(1, (p.stats.fm - 5) / 2.2))} title={`fantamedia ${p.stats.fm}`} />} />
            </dl>
          </section>
        )}

        <section className="modal-block">
          <h3>Valutazione</h3>
          <dl className="kvgrid">
            <Row k="Fascia" v={<span className="badge b-neu">{tierLabel(tierDefs, tier)}</span>} />
            <Row k="Prezzo previsto" v={price ? `${price.min}–${price.max} (atteso ${price.base})` : '≈ 1'} />
            <Row k="Il mio prezzo" v={myPrice ? `${myPrice}` : <span className="hint">non impostato</span>} />
          </dl>
        </section>

        <section className="modal-block">
          <h3>Fantacalcio</h3>
          <dl className="kvgrid">
            <Row k="FVM" v={p.fvm} />
            <Row k="Quotazione attuale (Qt.A)" v={p.qtA} />
            <Row k="Quotazione iniziale (Qt.I)" v={p.qtI} />
            <Row k="Differenza (Qt.A − Qt.I)" v={<span className={diff > 0 ? 'up' : diff < 0 ? 'down' : ''}>{diff > 0 ? `+${diff}` : diff}</span>} />
          </dl>
        </section>

        <section className="modal-block">
          <h3>Statistiche stagione precedente</h3>
          {p.stats
            ? <dl className="kvgrid">
                {STAT_ROWS.map(([k, label]) => <Row key={k} k={label} v={p.stats![k]} />)}
              </dl>
            : <p className="hint">Nessuna statistica caricata (carica il file Statistiche nel Setup).</p>}
        </section>
      </div>
    </div>
  )
}
