import { useRef, useState } from 'react'
import type { Task } from '../types'
import { clock, repeatSummary } from '../format'

type Props = {
  task: Task
  onOpen: () => void
  onDone: () => void
  onLater: (day: string) => void
  onDelete: () => void
}

export function TaskRow({ task, onOpen, onDone, onLater, onDelete }: Props) {
  const [dx, setDx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const startX = useRef(0)
  const dragging = useRef(false)
  const done = task.status === 'done'

  return (
    <div className="row-wrap">
      {revealed && (
        <div className="row-actions">
          <label>
            Después
            <input
              type="date"
              aria-label={`Mover ${task.title} a después`}
              onChange={(event) => {
                if (event.target.value) {
                  setRevealed(false)
                  onLater(event.target.value)
                }
              }}
            />
          </label>
          <button type="button" className="danger" onClick={onDelete}>
            Eliminar
          </button>
        </div>
      )}
      <article
        className={done ? 'card done' : 'card'}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('button, input, label')) return
          dragging.current = true
          startX.current = event.clientX
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return
          setDx(event.clientX - startX.current)
        }}
        onPointerUp={(event) => {
          if (!dragging.current) return
          dragging.current = false
          const delta = event.clientX - startX.current
          setDx(0)
          if (delta > 88 && !done) onDone()
          else if (delta < -88) setRevealed(true)
        }}
        onPointerCancel={() => {
          dragging.current = false
          setDx(0)
        }}
      >
        <button
          type="button"
          className={done ? 'check on' : 'check'}
          aria-label={done ? 'Hecha' : 'Marcar hecha'}
          onClick={onDone}
        />
        <button type="button" className="card-body" onClick={onOpen}>
          <span className="card-title">{task.title}</span>
          <span className="meta">
            {task.pinned && <em>Fijada</em>}
            {clock(task.dueAt)}
            {repeatSummary(task.repeatWeekdays)}
            {task.remindAt && 'Recordatorio'}
          </span>
        </button>
      </article>
    </div>
  )
}
