import type { Habit, MonthMoney, Task } from '../types'
import { displayName, soles, weekChips } from '../format'
import { Shell } from '../components/Shell'
import { TaskRow } from '../components/TaskRow'
import { EyeButton, useHideMoney } from '../components/HideMoney'

type Props = {
  email: string
  tasks: Task[] | null
  habits: Habit[]
  money: MonthMoney | null
  onOpen: (task: Task) => void
  onCreateTask: () => void
  onCreateHabit: () => void
  onCreateMoney: () => void
  onToggleHabit: (habit: Habit) => void
  onDone: (task: Task) => void
  onLater: (task: Task, day: string) => void
  onDelete: (task: Task) => void
}

export function MyDay({
  email,
  tasks,
  habits,
  money,
  onOpen,
  onCreateTask,
  onCreateHabit,
  onCreateMoney,
  onToggleHabit,
  onDone,
  onLater,
  onDelete,
}: Props) {
  const open = tasks?.filter((task) => task.status === 'open') ?? []
  const chips = weekChips()
  const name = displayName(email)
  const { hidden, toggle } = useHideMoney()

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
        <button type="button" className="quick-card" onClick={onCreateMoney}><i>S/</i>Anotar gasto</button>
        <button type="button" className="quick-card" onClick={onCreateTask}><i>+</i>Nueva tarea</button>
        <button type="button" className="quick-card" onClick={onCreateHabit}><i>o</i>Hábitos</button>
      </div>
      <section className="summary">
        <div className="summary-top">
          <p className="label">Tu mes</p>
          <EyeButton hidden={hidden} onToggle={toggle} />
        </div>
        <strong>{moneyLine(money, hidden)}</strong>
        <p>{money && money.incomeCents > 0 ? 'Ingresos menos gastos de este mes.' : 'Anota un ingreso para ver cuánto te queda.'}</p>
      </section>
      <div className="week-row">
        {chips.map((chip) => (
          <div key={chip.key} className={chip.today ? 'day-chip today' : 'day-chip'}>
            <small>{chip.label}</small>
            <strong>{chip.day}</strong>
          </div>
        ))}
      </div>
      {tasks && open.length === 0 && <p className="empty">Nada pendiente por ahora. Agrega algo o disfruta el día.</p>}
      {open.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onOpen={() => onOpen(task)}
          onDone={() => onDone(task)}
          onLater={(day) => onLater(task, day)}
          onDelete={() => onDelete(task)}
        />
      ))}
      {habits.length > 0 && <h2 className="section-label">Hábitos</h2>}
      {habits.map((habit) => (
        <HabitRow key={habit.id} habit={habit} onToggle={() => onToggleHabit(habit)} />
      ))}
    </Shell>
  )
}

export function HabitRow({ habit, onToggle }: { habit: Habit; onToggle: () => void }) {
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
      <button type="button" onClick={onToggle}>{habit.checks.includes(today()) ? 'Hecho' : 'Marcar'}</button>
    </div>
  )
}

function today() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function moneyLine(money: MonthMoney | null, hidden: boolean) {
  if (!money) return '…'
  if (hidden && (money.spentCents > 0 || money.incomeCents > 0)) return 'S/ ••••'
  if (money.incomeCents > 0 && money.remainingCents !== null) return `Te quedan ${soles(money.remainingCents)}`
  if (money.spentCents > 0) return `Llevas ${soles(money.spentCents)} gastados`
  return 'Aún sin movimientos'
}
