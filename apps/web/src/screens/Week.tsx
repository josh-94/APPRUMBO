import type { Task } from '../types'
import { dayLabel } from '../format'
import { Shell } from '../components/Shell'
import { TaskRow } from '../components/TaskRow'

type Props = {
  tasks: Task[] | null
  onOpen: (task: Task) => void
  onDone: (task: Task) => void
  onLater: (task: Task, day: string) => void
  onDelete: (task: Task) => void
}

export function Week({ tasks, onOpen, onDone, onLater, onDelete }: Props) {
  const days = new Map<string, Task[]>()
  for (const task of tasks ?? []) {
    if (!task.dueDay) continue
    const bucket = days.get(task.dueDay) ?? []
    bucket.push(task)
    days.set(task.dueDay, bucket)
  }
  const keys = [...days.keys()].sort()

  return (
    <Shell title="Esta semana" back="/dia">
      {tasks === null && <p className="empty">Cargando</p>}
      {tasks && keys.length === 0 && <p className="empty">No hay tareas con fecha en los próximos 7 días.</p>}
      {keys.map((day) => (
        <section key={day}>
          <h2 className="section-label">{dayLabel(day)}</h2>
          {days.get(day)?.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onOpen={() => onOpen(task)}
              onDone={() => onDone(task)}
              onLater={(value) => onLater(task, value)}
              onDelete={() => onDelete(task)}
            />
          ))}
        </section>
      ))}
    </Shell>
  )
}
