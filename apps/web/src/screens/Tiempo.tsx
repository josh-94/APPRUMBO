import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AgendaItem } from '../api'
import type { Habit, Task, TaskList } from '../types'
import { dayLabel, todayKey } from '../format'
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
  onEditHabit: (habit: Habit) => void
  onCapture: () => void
  refresh: number
}

type Mode = 'day' | 'week'

export function Tiempo({
  tasks,
  habits,
  lists,
  onOpen,
  onDone,
  onLater,
  onDelete,
  onToggleHabit,
  onCreateHabit,
  onEditHabit,
  onCapture,
  refresh,
}: Props) {
  const [mode, setMode] = useState<Mode>('day')
  const [day, setDay] = useState(todayKey())
  const [items, setItems] = useState<AgendaItem[]>([])
  const today = todayKey()

  useEffect(() => {
    api.agenda(day).then((data) => setItems(data.items)).catch(() => setItems([]))
  }, [day, refresh, habits])

  const timed = items.filter((item) => item.type === 'task' && item.hour).sort((a, b) => (a.hour || '').localeCompare(b.hour || ''))
  const untimed = items.filter((item) => item.type === 'task' && !item.hour)
  const dayHabits = items.filter((item) => item.type === 'habit')
  const workouts = items.filter((item) => item.type === 'workout')
  const undated = useMemo(() => (tasks ?? []).filter((task) => task.status === 'open' && !task.dueDay), [tasks])

  const days = new Map<string, Task[]>()
  for (const task of tasks ?? []) {
    if (!task.dueDay) continue
    const bucket = days.get(task.dueDay) ?? []
    bucket.push(task)
    days.set(task.dueDay, bucket)
  }
  const keys = [...days.keys()].sort()

  function shiftDay(delta: number) {
    const date = new Date(`${day}T12:00:00`)
    date.setDate(date.getDate() + delta)
    setDay(todayKey(date))
  }

  function taskById(id: number) {
    return (tasks ?? []).find((task) => task.id === id)
  }

  return (
    <Shell tabs>
      <div className="agenda-head">
        <div>
          <p className="kicker">Planificar</p>
          <h1 className="headline">Tu agenda</h1>
        </div>
        <button type="button" className="primary compact" onClick={onCapture}>+ Nuevo</button>
      </div>

      <div className="switch-row">
        <button type="button" className={mode === 'day' ? 'pill on' : 'pill quiet'} onClick={() => setMode('day')}>Día</button>
        <button type="button" className={mode === 'week' ? 'pill on' : 'pill quiet'} onClick={() => setMode('week')}>Semana</button>
        <Link className="pill quiet" to="/listas">Listas</Link>
        <Link className="pill quiet" to="/tiempo/entrenamientos">Gym</Link>
      </div>

      {mode === 'day' && (
        <>
          <div className="month-nav">
            <button type="button" className="month-step" aria-label="Día anterior" onClick={() => shiftDay(-1)}>‹</button>
            <p className="kicker">{dayLabel(day)}</p>
            <button type="button" className="month-step" aria-label="Día siguiente" onClick={() => shiftDay(1)}>›</button>
          </div>
          {day !== today && (
            <button type="button" className="text-button" onClick={() => setDay(today)}>Hoy</button>
          )}

          <h2 className="section-label">Con hora</h2>
          {timed.length === 0 && <p className="empty">Hoy no tienes nada con hora en el calendario.</p>}
          <div className="timeline">
            {timed.map((item) => {
              const task = taskById(item.id)
              return (
                <button
                  key={`t-${item.id}`}
                  type="button"
                  className="timeline-block"
                  onClick={() => task && onOpen(task)}
                >
                  <span className="timeline-hour">{item.hour}</span>
                  <strong>{item.title}</strong>
                </button>
              )
            })}
          </div>

          {workouts.length > 0 && (
            <>
              <h2 className="section-label">Entrenamientos</h2>
              {workouts.map((item) => (
                <Link key={`w-${item.id}`} className="list-link" to="/tiempo/entrenamientos">
                  <span>{item.title || 'Sesión'}{item.note ? ` · ${item.note}` : ''}</span>
                  <strong>›</strong>
                </Link>
              ))}
            </>
          )}

          <h2 className="section-label">Hábitos</h2>
          {dayHabits.length === 0 && habits.length === 0 && <p className="empty">Un hábito a la vez. Empieza con algo de 2 minutos.</p>}
          {habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              onToggle={() => onToggleHabit(habit)}
              onEdit={() => onEditHabit(habit)}
            />
          ))}
          <button type="button" className="ghost" onClick={onCreateHabit}>Nuevo hábito</button>

          {untimed.length > 0 && (
            <>
              <h2 className="section-label">Sin hora</h2>
              {untimed.map((item) => {
                const task = taskById(item.id)
                if (!task) return null
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onOpen={() => onOpen(task)}
                    onDone={() => onDone(task)}
                    onLater={(value) => onLater(task, value)}
                    onDelete={() => onDelete(task)}
                  />
                )
              })}
            </>
          )}

          <h2 className="section-label">Sin fecha</h2>
          {undated.length === 0 && <p className="empty">Nada en la bandeja sin fecha.</p>}
          {undated.slice(0, 8).map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onOpen={() => onOpen(task)}
              onDone={() => onDone(task)}
              onLater={(value) => onLater(task, value)}
              onDelete={() => onDelete(task)}
            />
          ))}
        </>
      )}

      {mode === 'week' && (
        <>
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
          {keys.map((key) => (
            <section key={key}>
              <h2 className="section-label">{dayLabel(key)}</h2>
              {days.get(key)?.map((task) => (
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
        </>
      )}
    </Shell>
  )
}
