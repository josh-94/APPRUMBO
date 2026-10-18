import type { CalendarEvent, EventColor, Goal, Task } from '../../types'
import { todayKey } from '../../format'

export const EVENT_COLORS: { id: EventColor; label: string }[] = [
  { id: 'menta', label: 'Menta' },
  { id: 'impulso', label: 'Impulso' },
  { id: 'horizonte', label: 'Horizonte' },
  { id: 'ciruela', label: 'Ciruela' },
  { id: 'alerta', label: 'Alerta' },
  { id: 'bosque', label: 'Bosque' },
]

export const DURATION_PILLS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 h', minutes: 60 },
  { label: '1.5 h', minutes: 90 },
  { label: '2 h', minutes: 120 },
  { label: '3 h', minutes: 180 },
]

export type PlanView = 'day' | 'week' | 'month'
export type PlanLayer = 'events' | 'tasks' | 'goals'

export type OverlayItem = {
  key: string
  kind: 'event' | 'task' | 'goal'
  id: number
  title: string
  day: string
  allDay: boolean
  startsAt: string | null
  endsAt: string | null
  color: EventColor | 'task' | 'goal'
  hour?: string
}

export function startOfWeek(day: string) {
  const d = parseDay(day)
  const delta = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - delta)
  return todayKey(d)
}

export function addDays(day: string, delta: number) {
  const d = parseDay(day)
  d.setDate(d.getDate() + delta)
  return todayKey(d)
}

export function startOfMonth(day: string) {
  const d = parseDay(day)
  d.setDate(1)
  return todayKey(d)
}

export function addMonths(day: string, delta: number) {
  const d = parseDay(day)
  d.setMonth(d.getMonth() + delta, 1)
  return todayKey(d)
}

export function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function weekDays(anchor: string) {
  const start = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function monthGrid(anchor: string) {
  const first = startOfMonth(anchor)
  const gridStart = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

export function rangeForView(view: PlanView, anchor: string): { from: string; to: string } {
  if (view === 'day') {
    return { from: anchor, to: addDays(anchor, 1) }
  }
  if (view === 'week') {
    const from = startOfWeek(anchor)
    return { from, to: addDays(from, 7) }
  }
  const cells = monthGrid(anchor)
  return { from: cells[0], to: addDays(cells[41], 1) }
}

export function navLabel(view: PlanView, anchor: string) {
  const d = parseDay(anchor)
  if (view === 'day') {
    return new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
  }
  if (view === 'week') {
    const days = weekDays(anchor)
    const a = parseDay(days[0])
    const b = parseDay(days[6])
    const sameMonth = a.getMonth() === b.getMonth()
    if (sameMonth) {
      return `${a.getDate()} – ${b.getDate()} ${new Intl.DateTimeFormat('es', { month: 'short', year: 'numeric' }).format(a)}`
    }
    const left = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(a)
    const right = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(b)
    return `${left} – ${right}`
  }
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(d)
}

export function shiftAnchor(view: PlanView, anchor: string, delta: number) {
  if (view === 'day') return addDays(anchor, delta)
  if (view === 'week') return addDays(anchor, delta * 7)
  return addMonths(anchor, delta)
}

export function eventDayKey(iso: string) {
  return todayKey(new Date(iso))
}

export function hourLabel(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

export function minutesFromMidnight(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export function durationMinutes(startsAt: string, endsAt: string) {
  return Math.max(15, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000))
}

export function toOverlayEvents(events: CalendarEvent[]): OverlayItem[] {
  return events.map((event) => ({
    key: `e-${event.id}`,
    kind: 'event' as const,
    id: event.id,
    title: event.title,
    day: eventDayKey(event.startsAt),
    allDay: event.allDay,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    color: event.color,
    hour: event.allDay ? undefined : new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(event.startsAt)),
  }))
}

export function toOverlayTasks(tasks: Task[]): OverlayItem[] {
  return tasks
    .filter((task) => task.status === 'open' && task.dueAt)
    .map((task) => {
      const due = new Date(task.dueAt!)
      const hour = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
      const allDay = hour === '00:00'
      return {
        key: `t-${task.id}`,
        kind: 'task' as const,
        id: task.id,
        title: task.title,
        day: todayKey(due),
        allDay,
        startsAt: task.dueAt,
        endsAt: new Date(due.getTime() + 60 * 60_000).toISOString(),
        color: 'task' as const,
        hour: allDay ? undefined : hour,
      }
    })
}

export function toOverlayGoals(goals: Goal[]): OverlayItem[] {
  return goals
    .filter((goal) => goal.deadline)
    .map((goal) => ({
      key: `g-${goal.id}`,
      kind: 'goal' as const,
      id: goal.id,
      title: goal.name,
      day: goal.deadline!,
      allDay: true,
      startsAt: null,
      endsAt: null,
      color: 'goal' as const,
    }))
}

export function itemsOnDay(items: OverlayItem[], day: string) {
  return items.filter((item) => item.day === day)
}

export function todayStatusLabel(count: number) {
  if (count === 0) return 'Día libre'
  if (count === 1) return '1 evento hoy'
  return `${count} eventos hoy`
}
