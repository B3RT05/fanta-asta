import { bestXI, type Formation } from '@/logic/formation'
import TeamChip from './TeamChip'
import type { Player, Role } from '@/logic/types'

export default function Pitch({ players, formation }: { players: Player[]; formation?: Formation }) {
  const xi = bestXI(players, formation)
  const rows: [Role, number][] = [['A', xi.formation.A], ['C', xi.formation.C], ['D', xi.formation.D], ['P', 1]]
  return (
    <div className="pitch" role="img" aria-label={`Formazione ${xi.formation.D}-${xi.formation.C}-${xi.formation.A}`}>
      {rows.map(([role, n]) => (
        <div key={role} className="pitch-row">
          {Array.from({ length: n }, (_, i) => {
            const p: Player | undefined = xi.picks[role][i]
            return p ? (
              <span key={i} className="pitch-player" title={`${p.nome} (${p.squadra})`}>
                <TeamChip team={p.squadra} />
                <span className="pn">{p.nome}</span>
              </span>
            ) : (
              <span key={i} className="pitch-player empty">{role}</span>
            )
          })}
        </div>
      ))}
      <div className="pitch-formation">{xi.formation.D}-{xi.formation.C}-{xi.formation.A}</div>
    </div>
  )
}
