import { useMemo, useState } from 'react'
import { Shell } from '../components/Shell'
import { longDate, todayKey, weekChips } from '../format'
import {
  HABIT_CATEGORIES,
  addDaysKey,
  dayPct,
  habitCountOn,
  habitDoneOn,
  habitMetaLine,
  maxStreakDays,
  monthPct,
  pendingSummary,
} from '../habitUtils'
import type { Habit, HabitCategory } from '../types'

type Tab = 'dia' | 'semana' | 'mes' | 'stats' | 'mine'

type Props = {
  habits: Habit[]
  onCreate: () => void
  onEdit: (habit: Habit) => void
  onSetCount: (habit: Habit, day: string, count: number) => void
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'stats', label: 'Estadísticas' },
  { id: 'mine', label: 'Mis hábitos' },
]

export function HabitsPage({ habits, onCreate, onEdit, onSetCount }: Props) {
  const today = todayKey()
  const [selected, setSelected] = useState(today)
  const [tab, setTab] = useState<Tab>('dia')
  const [category, setCategory] = useState<HabitCategory | 'todas'>('todas')

  const chips = useMemo(() => weekChips(parseKey(selected)), [selected])
  const filtered = habits.filter((habit) => category === 'todas' || habit.category === category)
  const pending = filtered.filter((habit) => !habitDoneOn(habit, selected))
  const doneList = filtered.filter((habit) => habitDoneOn(habit, selected))
  const pct = dayPct(habits, selected)
  const monthKey = selected.slice(0, 7)
  const month = monthPct(habits, monthKey)
  const streak = maxStreakDays(habits)
  const canEdit = selected <= today

  return (
    <Shell tabs action={(
      <button type="button" className="icon-btn habits-add" onClick={onCreate} aria-label="Nuevo hábito">+</button>
    )}>
      <div className="habits-top">
        <button type="button" className="pill quiet habits-date-pill">{formatShort(selected)}</button>
      </div>
      <h1 className="habits-title">Hábitos.</h1>
      <p className="habits-lead">{pendingSummary(habits, selected)}</p>

      <div className="habits-stats">
        <div className="habits-stat">
          <div className="habits-ring" style={{ ['--pct' as string]: `${pct}%` }}>
            <span>{pct}%</span>
          </div>
          <small>{habits.filter((h) => habitDoneOn(h, selected)).length}/{habits.length} hoy</small>
        </div>
        <div className="habits-stat">
          <strong>{streak}</strong>
          <small>{streak === 1 ? 'día de racha' : 'días de racha'}</small>
        </div>
        <div className="habits-stat">
          <strong>{month}%</strong>
          <small>este mes</small>
        </div>
      </div>

      <div className="habits-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'pill on' : 'pill quiet'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab !== 'dia' && (
        <section className="habits-card paper-card">
          <p className="empty">Pronto: vista {tabs.find((t) => t.id === tab)?.label?.toLowerCase()}.</p>
        </section>
      )}

      {tab === 'dia' && (
        <section className="habits-card paper-card">
          <div className="habits-card-head">
            <div>
              <strong>{longDate(parseKey(selected))}</strong>
              <p className="meta">
                {selected === today ? 'Hoy' : formatShort(selected)}
                {' · '}
                {doneList.length} de {filtered.length} hechos
              </p>
            </div>
            <div className="habits-nav">
              <button type="button" className="icon-btn" aria-label="Día anterior" onClick={() => setSelected(addDaysKey(selected, -1))}>‹</button>
              <button type="button" className="pill quiet" onClick={() => setSelected(today)}>Hoy</button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Día siguiente"
                disabled={selected >= today}
                onClick={() => setSelected(addDaysKey(selected, 1))}
              >
                ›
              </button>
            </div>
          </div>

          <div className="habits-week">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={chip.key === selected ? 'habits-day on' : 'habits-day'}
                disabled={chip.key > today}
                onClick={() => setSelected(chip.key)}
              >
                <small>{chip.label.charAt(0)}</small>
                <strong>{chip.day}</strong>
              </button>
            ))}
          </div>

          <div className="habits-filters">
            {HABIT_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={category === item.id ? 'pill on dark' : 'pill quiet'}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="section-head">
            <h2 className="section-label">Por hacer · {pending.length}</h2>
          </div>
          {pending.length === 0 && <p className="empty">Nada pendiente este día.</p>}
          {pending.map((habit) => (
            <HabitDayRow
              key={habit.id}
              habit={habit}
              day={selected}
              canEdit={canEdit}
              onEdit={() => onEdit(habit)}
              onToggle={() => onSetCount(habit, selected, habit.dailyGoal)}
              onInc={() => onSetCount(habit, selected, Math.min(habit.dailyGoal, habitCountOn(habit, selected) + 1))}
            />
          ))}

          {doneList.length > 0 && (
            <>
              <div className="section-head">
                <h2 className="section-label">Hechos · {doneList.length}</h2>
              </div>
              {doneList.map((habit) => (
                <HabitDayRow
                  key={habit.id}
                  habit={habit}
                  day={selected}
                  canEdit={canEdit}
                  onEdit={() => onEdit(habit)}
                  onToggle={() => onSetCount(habit, selected, 0)}
                  onInc={() => onSetCount(habit, selected, Math.min(habit.dailyGoal, habitCountOn(habit, selected) + 1))}
                />
              ))}
            </>
          )}
        </section>
      )}
    </Shell>
  )
}

function HabitDayRow({
  habit,
  day,
  canEdit,
  onEdit,
  onToggle,
  onInc,
}: {
  habit: Habit
  day: string
  canEdit: boolean
  onEdit: () => void
  onToggle: () => void
  onInc: () => void
}) {
  const done = habitDoneOn(habit, day)
  return (
    <div className={done ? 'habits-row done' : 'habits-row'}>
      <button
        type="button"
        className={done ? 'habits-check on' : 'habits-check'}
        disabled={!canEdit}
        aria-label={done ? 'Desmarcar' : 'Marcar'}
        onClick={onToggle}
      />
      <span className="habits-icon" aria-hidden>{habit.icon || '✨'}</span>
      <div className="habits-copy">
        <strong>{habit.name}</strong>
        <p className="meta">{habitMetaLine(habit, day)}</p>
      </div>
      {habit.dailyGoal > 1 && canEdit && !done && (
        <button type="button" className="habits-plus" onClick={onInc} aria-label="Sumar">+</button>
      )}
      <button type="button" className="habits-more" onClick={onEdit} aria-label="Editar">⋯</button>
    </div>
  )
}

function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatShort(key: string) {
  const text = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short' }).format(parseKey(key))
  return text.charAt(0).toUpperCase() + text.slice(1)
}
