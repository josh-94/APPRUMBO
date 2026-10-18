import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { Goal, Habit, HomeCard, Task, WorkoutSession } from '../types'
import { currencySymbol, displayName, soles, todayKey, weekChips } from '../format'
import { Shell } from '../components/Shell'
import { TaskRow } from '../components/TaskRow'
import { useHideMoney } from '../components/HideMoney'

type Props = {
  email: string
  tasks: Task[] | null
  habits: Habit[]
  currency?: string
  onOpen: (task: Task) => void
  onCreateTask: () => void
  onCreateHabit: () => void
  onCreateMoney: () => void
  onCapture: () => void
  onToggleHabit: (habit: Habit) => void
  onEditHabit?: (habit: Habit) => void
  onDone: (task: Task) => void
  onLater: (task: Task, day: string) => void
  onDelete: (task: Task) => void
}

const cardLabels: Record<HomeCard, string> = {
  agenda: 'Agenda del día',
  habits: 'Hábitos de hoy',
  goals: 'Objetivos',
  workouts: 'Entrenamientos',
}

export function MyDay({
  email,
  tasks,
  habits,
  currency = 'PEN',
  onOpen,
  onCreateTask,
  onCreateHabit,
  onCreateMoney,
  onCapture,
  onToggleHabit,
  onEditHabit,
  onDone,
  onLater,
  onDelete,
}: Props) {
  const open = tasks?.filter((task) => task.status === 'open') ?? []
  const chips = weekChips()
  const name = displayName(email)
  const { hidden } = useHideMoney()
  const [cards, setCards] = useState<HomeCard[]>(['agenda', 'habits', 'goals', 'workouts'])
  const [goals, setGoals] = useState<Goal[]>([])
  const [sessions, setSessions] = useState<WorkoutSession[]>([])

  useEffect(() => {
    api.homePrefs().then((data) => setCards(data.cards)).catch(() => undefined)
    api.goals().then((data) => setGoals(data.goals)).catch(() => setGoals([]))
    api.workoutSessions().then((data) => setSessions(data.sessions)).catch(() => setSessions([]))
  }, [])

  const today = todayKey()
  const todaySessions = sessions.filter((item) => item.occurredOn === today)
  const activeGoal = goals[0]

  return (
    <Shell tabs>
      <div className="hello-row">
        <span>Hola, {name}</span>
        <span>{new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</span>
      </div>
      <p className="kicker">{open.length === 0 ? 'Todo listo,' : 'Hoy'}</p>
      <h1 className="headline">
        {tasks === null ? 'Cargando' : open.length === 0 ? 'no tienes nada pendiente' : `Te quedan ${open.length} ${open.length === 1 ? 'cosa' : 'cosas'}`}
      </h1>
      <div className="quick-grid">
        <button type="button" className="quick-card" onClick={onCreateMoney}><i>{currencySymbol(currency)}</i>Anotar gasto</button>
        <button type="button" className="quick-card" onClick={onCapture}><i>+</i>Anotar</button>
        <button type="button" className="quick-card" onClick={onCreateHabit}><i>o</i>Hábitos</button>
      </div>

      {cards.map((card) => {
        if (card === 'agenda') {
          return (
            <section key={card} className="home-card paper-card">
              <div className="section-head">
                <h2 className="section-label">{cardLabels.agenda}</h2>
                <Link className="text-button" to="/tiempo">Ver</Link>
              </div>
              <div className="week-row">
                {chips.map((chip) => (
                  <div key={chip.key} className={chip.today ? 'day-chip today' : 'day-chip'}>
                    <small>{chip.label}</small>
                    <strong>{chip.day}</strong>
                  </div>
                ))}
              </div>
              {tasks && open.length === 0 && <p className="empty">Nada pendiente por ahora.</p>}
              {open.slice(0, 4).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onOpen={() => onOpen(task)}
                  onDone={() => onDone(task)}
                  onLater={(day) => onLater(task, day)}
                  onDelete={() => onDelete(task)}
                />
              ))}
              <button type="button" className="ghost" onClick={onCreateTask}>Nueva tarea</button>
            </section>
          )
        }
        if (card === 'habits') {
          return (
            <section key={card} className="home-card paper-card">
              <div className="section-head">
                <h2 className="section-label">{cardLabels.habits}</h2>
                <span className="meta">{habits.filter((h) => h.checks.includes(today)).length}/{habits.length} hoy</span>
              </div>
              {habits.length === 0 && <p className="empty">Sin hábitos aún.</p>}
              {habits.map((habit) => (
                <HabitRow key={habit.id} habit={habit} onToggle={() => onToggleHabit(habit)} onEdit={onEditHabit ? () => onEditHabit(habit) : undefined} />
              ))}
            </section>
          )
        }
        if (card === 'goals') {
          return (
            <section key={card} className="home-card paper-card">
              <div className="section-head">
                <h2 className="section-label">{cardLabels.goals}</h2>
                <Link className="text-button" to="/plata/metas">Ver todo</Link>
              </div>
              {!activeGoal && <p className="empty">Sin metas activas. <Link to="/plata/metas">Crear una</Link></p>}
              {activeGoal && (
                <div className="goal-top">
                  <div>
                    <strong>{activeGoal.name}</strong>
                    <p className="meta">
                      {hidden ? '••••' : `${soles(activeGoal.savedCents)} de ${soles(activeGoal.targetCents)}`}
                      {activeGoal.daysLeft != null ? ` · faltan ${Math.max(0, activeGoal.daysLeft)} d` : ''}
                    </p>
                  </div>
                  <div className="goal-ring" style={{ ['--pct' as string]: `${activeGoal.pct}%` }}>
                    <span>{activeGoal.pct}%</span>
                  </div>
                </div>
              )}
            </section>
          )
        }
        return (
          <section key={card} className="home-card paper-card">
            <div className="section-head">
              <h2 className="section-label">{cardLabels.workouts}</h2>
              <Link className="text-button" to="/tiempo/entrenamientos">Ver</Link>
            </div>
            <p className="meta">{todaySessions.length ? `${todaySessions.length} sesión(es) hoy` : 'Día de descanso'}</p>
            <WorkoutWeek sessions={sessions} />
          </section>
        )
      })}
    </Shell>
  )
}

function WorkoutWeek({ sessions }: { sessions: WorkoutSession[] }) {
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const monday = new Date()
  const delta = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - delta)
  return (
    <div className="week-row">
      {labels.map((label, index) => {
        const date = new Date(monday)
        date.setDate(monday.getDate() + index)
        const key = todayKey(date)
        const on = sessions.some((session) => session.occurredOn === key)
        return (
          <div key={label} className={on ? 'day-chip today' : 'day-chip'}>
            <small>{label}</small>
            <strong>{on ? '●' : '·'}</strong>
          </div>
        )
      })}
    </div>
  )
}

export function HabitRow({ habit, onToggle, onEdit }: { habit: Habit; onToggle: () => void; onEdit?: () => void }) {
  return (
    <div className="habit">
      <div>
        <strong>{habit.name}</strong>
        <div className="dots" aria-hidden>
          {Array.from({ length: habit.nGoal }, (_, index) => (
            <span key={index} className={index < habit.doneThisWeek ? 'on' : ''} />
          ))}
        </div>
        <p className="meta">{habit.doneThisWeek} de {habit.nGoal} · {habit.streakWeeks} {habit.streakWeeks === 1 ? 'semana' : 'semanas'}</p>
      </div>
      <div className="habit-actions">
        {onEdit && <button type="button" className="text-button" onClick={onEdit}>Editar</button>}
        <button type="button" onClick={onToggle}>{habit.checks.includes(today()) ? 'Hecho' : 'Marcar'}</button>
      </div>
    </div>
  )
}

function today() {
  return todayKey()
}
