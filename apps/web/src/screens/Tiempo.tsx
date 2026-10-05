import { Link } from 'react-router-dom'
import type { Habit, Task, TaskList } from '../types'
import { dayLabel } from '../format'
import { Shell } from '../components/Shell'
import { TaskRow } from '../components/TaskRow'
import { HabitRow } from './MyDay'

type Props = {
  tasks: Task[] | null
  habits: Habit[]
  lists: TaskList[] | null
  onOpen: (task: Task) => void
  onDone: (task: Task) => void
  onLater: (task: Task, day: string) => void
  onDelete: (task: Task) => void
  onToggleHabit: (habit: Habit) => void
  onCreateHabit: () => void
}

export function Tiempo({ tasks, habits, lists, onOpen, onDone, onLater, onDelete, onToggleHabit, onCreateHabit }: Props) {
  const days = new Map<string, Task[]>()
  for (const task of tasks ?? []) {
    if (!task.dueDay) continue
    const bucket = days.get(task.dueDay) ?? []
    bucket.push(task)
    days.set(task.dueDay, bucket)
  }
  const keys = [...days.keys()].sort()

  return (
    <Shell tabs>
      <p className="kicker">Esta semana</p>
      <h1 className="headline">Tu tiempo</h1>
      <h2 className="section-label">Hábitos</h2>
      {habits.length === 0 && <p className="empty">Un hábito a la vez. Empieza con algo de 2 minutos.</p>}
      {habits.map((habit) => (
        <HabitRow key={habit.id} habit={habit} onToggle={() => onToggleHabit(habit)} />
      ))}
      <button type="button" className="ghost" onClick={onCreateHabit}>Nuevo hábito</button>
      <h2 className="section-label">Listas</h2>
      <div className="stack">
        {lists?.map((list) => (
          <Link key={list.id} className="list-link" to={`/listas/${list.id}`}>
            <span>{list.name}</span>
            <strong>{list.openCount}</strong>
          </Link>
        ))}
      </div>
      <h2 className="section-label">Con fecha</h2>
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
