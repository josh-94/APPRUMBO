import type { Habit, HabitCategory } from './types'

export const HABIT_CATEGORIES: { id: HabitCategory | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'estudios', label: 'Estudios' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'salud', label: 'Salud' },
]

export const HABIT_ICONS = ['✨', '😴', '🏃', '💰', '💧', '📚', '🧘', '🥗', '✍️', '🎯']

export function habitCountOn(habit: Habit, day: string) {
  return habit.checks.find((check) => check.day === day)?.count ?? 0
}

export function habitDoneOn(habit: Habit, day: string) {
  return habitCountOn(habit, day) >= Math.max(1, habit.dailyGoal || 1)
}

export function habitFreqLabel(habit: Habit) {
  if (habit.nGoal >= 7) return 'Todos los días'
  return `${habit.nGoal} ${habit.nGoal === 1 ? 'vez' : 'veces'} por semana`
}

export function habitMetaLine(habit: Habit, day: string) {
  const freq = habitFreqLabel(habit)
  if (habit.dailyGoal > 1) {
    return `${freq} · ${habitCountOn(habit, day)}/${habit.dailyGoal}`
  }
  if (habit.nGoal < 7) {
    return `${freq} · ${habit.doneThisWeek}/${habit.nGoal} esta semana`
  }
  return freq
}

export function pendingSummary(habits: Habit[], day: string) {
  const pending = habits.filter((habit) => !habitDoneOn(habit, day))
  if (pending.length === 0) return 'Todo al día por ahora.'
  if (pending.length === 1) return `Te falta ${pending[0].name}`
  if (pending.length === 2) return `Te faltan ${pending[0].name} y ${pending[1].name}`
  return `Te faltan ${pending[0].name}, ${pending[1].name} y ${pending.length - 2} más`
}

export function dayPct(habits: Habit[], day: string) {
  if (habits.length === 0) return 0
  const done = habits.filter((habit) => habitDoneOn(habit, day)).length
  return Math.round((done / habits.length) * 100)
}

export function monthPct(habits: Habit[], monthPrefix: string) {
  if (habits.length === 0) return 0
  const today = new Date()
  const [y, m] = monthPrefix.split('-').map(Number)
  const end = today.getFullYear() === y && today.getMonth() + 1 === m
    ? today.getDate()
    : new Date(y, m, 0).getDate()
  const possible = habits.length * end
  let done = 0
  for (const habit of habits) {
    const goal = Math.max(1, habit.dailyGoal || 1)
    for (let d = 1; d <= end; d++) {
      const key = `${monthPrefix}-${String(d).padStart(2, '0')}`
      const count = habit.checks.find((c) => c.day === key)?.count ?? 0
      if (count >= goal) done += 1
    }
  }
  if (possible === 0) return 0
  return Math.round((done / possible) * 100)
}

export function maxStreakDays(habits: Habit[]) {
  if (habits.length === 0) return 0
  return Math.max(...habits.map((habit) => habit.streakDays || 0))
}

export function addDaysKey(key: string, delta: number) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
