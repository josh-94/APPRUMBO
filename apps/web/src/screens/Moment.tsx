import { useState } from 'react'
import type { Task } from '../types'
import { Shell } from '../components/Shell'

type Props = {
  tasks: Task[] | null
  onToday: (task: Task) => Promise<void>
  onLater: (task: Task, day: string) => Promise<void>
  onDone: (task: Task) => Promise<void>
  onDelete: (task: Task) => Promise<void>
}

export function Moment({ tasks, onToday, onLater, onDone, onDelete }: Props) {
  const [index, setIndex] = useState(0)
  const [day, setDay] = useState('')
  const open = tasks ?? []
  const task = open[Math.min(index, Math.max(open.length - 1, 0))]

  function shift(delta: number) {
    setIndex((current) => Math.min(Math.max(current + delta, 0), Math.max(open.length - 1, 0)))
  }

  return (
    <Shell title="Moment" back="/dia">
      {tasks === null && <p className="empty">Cargando</p>}
      {tasks && open.length === 0 && <p className="empty">No hay nada que repasar.</p>}
      {task && (
        <div
          className="moment"
          onPointerUp={(event) => {
            const target = event.currentTarget
            const start = Number(target.dataset.y || event.clientY)
            const delta = event.clientY - start
            if (delta < -50) shift(1)
            if (delta > 50) shift(-1)
            delete target.dataset.y
          }}
          onPointerDown={(event) => {
            event.currentTarget.dataset.y = String(event.clientY)
          }}
        >
          <p className="eyebrow">
            {Math.min(index, open.length - 1) + 1} de {open.length}
          </p>
          <h2 className="moment-title">{task.title}</h2>
          {task.notes && <p className="moment-notes">{task.notes}</p>}
          <div className="moment-actions">
            <button type="button" className="primary" onClick={() => void onToday(task)}>
              Hoy
            </button>
            <label className="field">
              Después
              <input
                type="date"
                value={day}
                onChange={(event) => {
                  setDay(event.target.value)
                  if (event.target.value) void onLater(task, event.target.value)
                }}
              />
            </label>
            <button type="button" className="ghost" onClick={() => void onDone(task)}>
              Hecha
            </button>
            <button type="button" className="ghost danger" onClick={() => void onDelete(task)}>
              Eliminar
            </button>
          </div>
          <p className="hint">Desliza arriba o abajo para pasar de tarea.</p>
        </div>
      )}
    </Shell>
  )
}
