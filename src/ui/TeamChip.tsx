import { teamStyle } from './teamColors'

export default function TeamChip({ team }: { team: string }) {
  const s = teamStyle(team)
  return <span className="teamchip" style={{ background: s.bg, color: s.fg }} title={team}>{s.abbr}</span>
}
