import { Link } from 'react-router-dom'
import type { Task } from '../types'
import { greeting, longDate } from '../format'
import { Shell } from '../components/Shell'
import { TaskRow } from '../components/TaskRow'

type Props = {
  tasks: Task[] | null
  onOpen: (task: Task) => void
  onCreate: () => void
  onDone: (task: Task) => void
  onLater: (task: Task, day: string) => void
  onDelete: (task: Task) => void
}

export function MyDay({ tasks, onOpen, onCreate, onDone, onLater, onDelete }: Props) {
  const open = tasks?.filter((task) => task.status === 'open') ?? []
  const pinned = open.filter((task) => task.pinned)
  const rest = open.filter((task) => !task.pinned)
  const done = tasks?.filter((task) => task.status === 'done') ?? []

  return (
    <Shell
      eyebrow={longDate()}
      title={greeting()}
      tabs
      action={
        <Link className="icon-btn" to="/ajustes" aria-label="Ajustes">
          ···
        </Link>
      }
    >
      <div className="shortcuts">
        <Link className="pill" to="/momento">
          Planear el día
        </Link>
        <Link className="pill quiet" to="/semana">
          Esta semana
        </Link>
      </div>
      {tasks === null && <p className="empty">Cargando</p>}
      {tasks && open.length === 0 && done.length === 0 && (
        <p className="empty">Nada para hoy. Planear el día o añadir una tarea.</p>
      )}
      <Group label="Fijadas" tasks={pinned} onOpen={onOpen} onDone={onDone} onLater={onLater} onDelete={onDelete} />
      <Group label="Hoy" tasks={rest} onOpen={onOpen} onDone={onDone} onLater={onLater} onDelete={onDelete} />
      <Group label="Hechas" tasks={done} onOpen={onOpen} onDone={onDone} onLater={onLater} onDelete={onDelete} />
      <button type="button" className="fab" onClick={onCreate}>
        Añadir tarea
      </button>
    </Shell>
  )
}

function Group({
  label,
  tasks,
  onOpen,
  onDone,
  onLater,
  onDelete,
}: {
  label: string
  tasks: Task[]
  onOpen: (task: Task) => void
  onDone: (task: Task) => void
  onLater: (task: Task, day: string) => void
  onDelete: (task: Task) => void
}) {
  if (tasks.length === 0) return null
  return (
    <section>
      <h2 className="section-label">{label}</h2>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onOpen={() => onOpen(task)}
          onDone={() => onDone(task)}
          onLater={(day) => onLater(task, day)}
          onDelete={() => onDelete(task)}
        />
      ))}
    </section>
  )
}
