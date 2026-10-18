import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AgendaItem } from '../api'
import type { Goal, GymWeek, Habit, HomeCard, Task } from '../types'
import { currencySymbol, displayName, soles, todayKey, weekChips, weekStartKey } from '../format'
import { habitCountOn, habitDoneOn, habitMetaLine } from '../habitUtils'
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
  onMoneyChat: () => void
  onCapture: () => void
  onToggleHabit: (habit: Habit) => void
  onEditHabit?: (habit: Habit) => void
  onIncHabit?: (habit: Habit) => void
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
  onMoneyChat,
  onCapture,
  onToggleHabit,
  onEditHabit,
  onIncHabit,
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
  const [gymWeek, setGymWeek] = useState<GymWeek | null>(null)
  const [agendaDay, setAgendaDay] = useState(todayKey())
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])

  useEffect(() => {
    api.homePrefs().then((data) => setCards(data.cards)).catch(() => undefined)
    api.goals().then((data) => setGoals(data.goals)).catch(() => setGoals([]))
    api.gymWeek().then(setGymWeek).catch(() => setGymWeek(null))
  }, [])

  useEffect(() => {
    api.agenda(agendaDay).then((data) => setAgendaItems(data.items)).catch(() => setAgendaItems([]))
  }, [agendaDay, tasks, habits])

  const today = todayKey()
  const todayWeekday = (new Date().getDay() + 6) % 7
  const plannedToday = gymWeek?.weekdays.includes(todayWeekday) ?? false
  const todayLog = gymWeek?.logs.find((log) => log.day === today)
  const gymSubtitle = todayLog?.attended
    ? `Fuiste a las ${todayLog.attendedAt || '—'}`
    : plannedToday
      ? 'Hoy vas'
      : 'Día de descanso'
  const activeGoal = goals[0]
  const agendaTasks = agendaItems.filter((item) => item.type === 'task')

  async function toggleGymPlan(weekday: number) {
    const weekStart = gymWeek?.weekStart || weekStartKey()
    const current = new Set(gymWeek?.weekdays ?? [])
    if (current.has(weekday)) current.delete(weekday)
    else current.add(weekday)
    const weekdays = [...current].sort((a, b) => a - b)
    try {
      const next = await api.setGymWeek(weekStart, weekdays)
      setGymWeek(next)
    } catch {
      /* keep previous */
    }
  }

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
        <Link className="quick-card" to="/habitos"><i>o</i>Hábitos</Link>
      </div>

      <button type="button" className="spend-fab chat" aria-label="Contar gasto" onClick={onMoneyChat}>
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M5 6h14v9H8l-3 3V6Z" />
        </svg>
      </button>

      {cards.map((card) => {
        if (card === 'agenda') {
          return (
            <section key={card} className="home-card paper-card">
              <div className="section-head">
                <h2 className="section-label">{cardLabels.agenda}</h2>
              </div>
              <div className="week-row">
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    className={chip.key === agendaDay ? 'day-chip today' : 'day-chip'}
                    aria-pressed={chip.key === agendaDay}
                    onClick={() => setAgendaDay(chip.key)}
                  >
                    <small>{chip.label}</small>
                    <strong>{chip.day}</strong>
                  </button>
                ))}
              </div>
              {agendaTasks.length === 0 && (
                <p className="empty">{agendaDay === today ? 'Nada pendiente por ahora.' : 'Ese día no tienes nada en la agenda.'}</p>
              )}
              {agendaTasks.slice(0, 6).map((item) => {
                const task = tasks?.find((entry) => entry.id === item.id)
                if (task) {
                  return (
                    <TaskRow
                      key={item.id}
                      task={task}
                      onOpen={() => onOpen(task)}
                      onDone={() => onDone(task)}
                      onLater={(day) => onLater(task, day)}
                      onDelete={() => onDelete(task)}
                    />
                  )
                }
                return (
                  <article key={item.id} className="card">
                    <div className="card-body">
                      <span className="card-title">{item.title}</span>
                      {item.hour && <span className="meta">{item.hour}</span>}
                    </div>
                  </article>
                )
              })}
              <button type="button" className="ghost" onClick={onCreateTask}>Nueva tarea</button>
            </section>
          )
        }
        if (card === 'habits') {
          return (
            <section key={card} className="home-card paper-card">
              <div className="section-head">
                <h2 className="section-label">{cardLabels.habits}</h2>
                <Link className="section-more" to="/habitos" aria-label="Hábitos">›</Link>
              </div>
              <p className="meta">{habits.filter((h) => habitDoneOn(h, today)).length}/{habits.length} hoy</p>
              {habits.length === 0 && (
                <p className="empty">
                  Sin hábitos aún.{' '}
                  <button type="button" className="text-button" onClick={onCreateHabit}>Crear uno</button>
                </p>
              )}
              {habits.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  onToggle={() => onToggleHabit(habit)}
                  onEdit={onEditHabit ? () => onEditHabit(habit) : undefined}
                  onInc={onIncHabit && habit.dailyGoal > 1 && !habitDoneOn(habit, today) ? () => onIncHabit(habit) : undefined}
                />
              ))}
            </section>
          )
        }
        if (card === 'goals') {
          return (
            <section key={card} className="home-card paper-card">
              <div className="section-head">
                <h2 className="section-label">{cardLabels.goals}</h2>
                <Link className="section-more" to="/plata/metas" aria-label="Metas">›</Link>
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
              <Link className="section-more" to="/tiempo/entrenamientos" aria-label="Entrenamientos">›</Link>
            </div>
            <p className="meta">{gymSubtitle}</p>
            <GymWeekRow
              week={gymWeek}
              onToggle={toggleGymPlan}
            />
          </section>
        )
      })}
    </Shell>
  )
}

function GymWeekRow({ week, onToggle }: { week: GymWeek | null; onToggle: (weekday: number) => void }) {
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const chips = weekChips()
  const planned = new Set(week?.weekdays ?? [])
  const logs = new Map((week?.logs ?? []).map((log) => [log.day, log]))
  return (
    <div className="week-row">
      {labels.map((label, index) => {
        const chip = chips[index]
        const log = logs.get(chip.key)
        const isPlanned = planned.has(index)
        const attended = Boolean(log?.attended)
        const className = [
          'day-chip',
          chip.today ? 'is-today' : '',
          isPlanned ? 'planned' : '',
          attended ? 'attended' : '',
        ].filter(Boolean).join(' ')
        return (
          <button
            key={label}
            type="button"
            className={className}
            aria-pressed={isPlanned}
            aria-label={`${label}: ${isPlanned ? 'planificado' : 'sin plan'}`}
            onClick={() => onToggle(index)}
          >
            <small>{label}</small>
            <strong>{attended ? '●' : isPlanned ? '○' : '·'}</strong>
          </button>
        )
      })}
    </div>
  )
}

export function HabitRow({ habit, onToggle, onEdit, onInc }: {
  habit: Habit
  onToggle: () => void
  onEdit?: () => void
  onInc?: () => void
}) {
  const day = today()
  const done = habitDoneOn(habit, day)
  const count = habitCountOn(habit, day)
  return (
    <div className={done ? 'habit done' : 'habit'}>
      <button
        type="button"
        className={done ? 'check on' : 'check'}
        aria-label={done ? `${habit.name}, hecho` : `Marcar ${habit.name}`}
        onClick={onToggle}
      />
      <button type="button" className="habit-body" onClick={onEdit}>
        <span className="habits-icon" aria-hidden>{habit.icon || '✨'}</span>
        <span className="habit-copy">
          <strong>{habit.name}</strong>
          <span className="dots" aria-hidden>
            {Array.from({ length: habit.nGoal }, (_, index) => (
              <i key={index} className={index < habit.doneThisWeek ? 'on' : ''} />
            ))}
          </span>
          <span className="meta">{habitMetaLine(habit, day)}</span>
        </span>
      </button>
      {onInc && (
        <button type="button" className="habit-plus" aria-label={`Sumar en ${habit.name}`} onClick={onInc}>
          {count}/{habit.dailyGoal}
        </button>
      )}
    </div>
  )
}

function today() {
  return todayKey()
}
