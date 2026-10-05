export type Section = 'today' | 'tomorrow' | 'upcoming' | 'someday'

export type Task = {
  id: number
  listId: number
  title: string
  notes: string
  dueAt: string | null
  remindAt: string | null
  status: 'open' | 'done'
  pinned: boolean
  position: number
  repeatWeekdays: number[]
  completedAt: string | null
  section: Section
  dueDay: string | null
}

export type TaskInput = {
  listId: number
  title: string
  notes: string
  dueAt: string | null
  remind: boolean
  pinned: boolean
  repeatWeekdays: number[]
}

export type Habit = {
  id: number
  name: string
  nGoal: number
  doneThisWeek: number
  streakWeeks: number
  checks: string[]
}

export type MoneyAccount = { id: number; name: string }
export type MoneyCategory = { id: number; name: string; kind: 'gasto' | 'ingreso'; position: number }
export type Movement = {
  id: number
  accountId: number
  categoryId: number
  kind: 'gasto' | 'ingreso'
  amountCents: number
  occurredOn: string
  accountName: string
  category: string
}

export type MonthMoney = {
  spentCents: number
  incomeCents: number
  remainingCents: number | null
  accounts: MoneyAccount[]
  categories: MoneyCategory[]
  movements: Movement[]
}

export type TaskList = {
  id: number
  name: string
  position: number
  openCount: number
}
