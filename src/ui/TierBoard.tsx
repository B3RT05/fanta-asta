import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { useContext } from 'react'
import { AppCtx } from './App'
import type { Player, TierDef, TierId } from '@/logic/types'

function Card({ player }: { player: Player }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: player.id })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  return (
    <div ref={setNodeRef} style={style} className="card" {...listeners} {...attributes}>
      {`${player.nome} · ${player.squadra}`} <small>FVM {player.fvm}</small>
    </div>
  )
}

function Column({ def, players }: { def: TierDef; players: Player[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: def.id })
  return (
    <div ref={setNodeRef} className="tiercol" style={isOver ? { outline: '2px solid #48f' } : undefined}>
      <h3>{def.label} ({players.length})</h3>
      {players.map(p => <Card key={p.id} player={p} />)}
    </div>
  )
}

export default function TierBoard({ players }: { players: Player[] }) {
  const { state, dispatch } = useContext(AppCtx)
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && state.tierDefs.some(d => d.id === e.over!.id))
      dispatch({ type: 'setTier', playerId: Number(e.active.id), tier: e.over.id as TierId })
  }
  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="tierboard">
        {state.tierDefs.map(d => (
          <Column key={d.id} def={d} players={players.filter(p => state.tiers[p.id] === d.id)} />
        ))}
      </div>
    </DndContext>
  )
}
