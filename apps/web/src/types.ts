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
  payKind?: string
  payRef?: number
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

export type HabitCategory = 'general' | 'estudios' | 'finanzas' | 'salud'

export type HabitCheck = {
  day: string
  count: number
}

export type HabitInput = {
  name: string
  nGoal: number
  icon?: string
  category?: HabitCategory
  dailyGoal?: number
}

export type Habit = {
  id: number
  name: string
  nGoal: number
  icon: string
  category: HabitCategory
  dailyGoal: number
  doneToday: number
  doneThisWeek: number
  streakWeeks: number
  streakDays: number
  checks: HabitCheck[]
}

export type Goal = {
  id: number
  name: string
  kind: 'ahorro' | 'numero' | 'etapas'
  targetCents: number
  savedCents: number
  deadline?: string
  accountId?: number
  pct: number
  daysLeft?: number | null
}

export type WorkoutExercise = { id: number; name: string; position: number }
export type WorkoutRoutine = { id: number; name: string; exercises: WorkoutExercise[] }
export type WorkoutSet = { id?: number; exerciseName: string; reps: number; weightGrams: number; position?: number }
export type WorkoutSession = {
  id: number
  routineId?: number
  routineName?: string
  occurredOn: string
  note: string
  durationMin: number
  sets: WorkoutSet[]
}
export type WorkoutRecord = { exerciseName: string; weightGrams: number; reps: number; occurredOn: string }

export type GymLog = { day: string; attended: boolean; attendedAt?: string }
export type DayMacros = { day: string; proteinG: number; carbsG: number; fatG: number; kcal: number }
export type GymWeek = {
  weekStart: string
  weekdays: number[]
  logs: GymLog[]
  dayMacros: DayMacros[]
}
export type MealItem = {
  id: number
  foodName: string
  brand: string
  offId: string
  grams: number
  proteinG: number
  carbsG: number
  fatG: number
  kcal: number
}
export type Meal = {
  id: number
  day: string
  title: string
  eatenAt?: string
  items: MealItem[]
}
export type FoodHit = {
  id: string
  name: string
  brand: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  perGrams: number
  source?: 'local' | 'off' | string
  servingGrams?: number
  servingLabel?: string
}

export type HomeCard = 'agenda' | 'habits' | 'goals' | 'workouts'

export type EventColor = 'menta' | 'impulso' | 'horizonte' | 'ciruela' | 'alerta' | 'bosque'

export type CalendarEvent = {
  id: number
  title: string
  location: string
  description: string
  allDay: boolean
  startsAt: string
  endsAt: string
  color: EventColor
  remindMinutes?: number
  repeatRule: 'none' | 'weekly'
  repeatWeekdays: number[]
}

export type EventInput = {
  title: string
  location: string
  description: string
  allDay: boolean
  startsAt: string
  endsAt: string | null
  color: EventColor
  remindMinutes?: number | null
  repeatRule: 'none' | 'weekly'
  repeatWeekdays: number[]
}

export type MoneyAccount = { id: number; name: string }
export type MoneyCategory = { id: number; name: string; kind: 'gasto' | 'ingreso'; position: number; icon: string; tint: string }
export type MoneyCard = { id: number; name: string; currency: 'pen' | 'usd' }
export type Movement = {
  id: number
  accountId: number
  debtId: number
  categoryId: number
  kind: 'gasto' | 'ingreso'
  currency: 'pen' | 'usd'
  amountCents: number
  occurredOn: string
  accountName: string
  category: string
  note: string
}
export type MovementInput = {
  kind: 'gasto' | 'ingreso'
  currency: 'pen' | 'usd'
  amountCents: number
  accountId?: number
  debtId?: number
  categoryId: number
  day: string
  note: string
}

export type PayEvery = '' | 'semana' | 'quincena' | 'mes'
export type PayAccount = {
  id: number
  name: string
  payEvery: PayEvery
  payday: number
  paydayCents: number
  payday2: number
  payday2Cents: number
  currency: string
  balanceCents: number
}
export type CardTint = 'noche' | 'oro' | 'azul' | 'ciruela' | 'bosque' | 'grafito' | 'cobre'
export type Debt = {
  id: number
  kind: 'tarjeta' | 'prestamo'
  name: string
  balancePen: number
  balanceUsd: number
  cuotaPen: number
  cuotaUsd: number
  dueDay: number
  currency: 'pen' | 'usd'
  last4: string
  limitCents: number
  tint: CardTint
}
export type DebtMove = {
  id: number
  debtId: number
  kind: 'consumo' | 'pago'
  currency: 'pen' | 'usd'
  amountCents: number
  occurredOn: string
  note: string
  source: 'card' | 'month'
}
export type Bill = { id: number; name: string; amountCents: number; dueDay: number; categoryId: number; category: string }
export type MoneyPlan = {
  fxHundredths: number
  currency: string
  accounts: PayAccount[]
  debts: Debt[]
  bills: Bill[]
  debtPen: number
  debtUsd: number
  debtTotalPen: number
  cuotaTotalPen: number
}

export type MoneyDraft = {
  kind: 'gasto' | 'ingreso'
  amountCents: number
  categoryId: number
  category: string
  accountId?: number
  debtId?: number
  sourceName?: string
  note: string
  day: string
  confidence: 'alta' | 'baja'
  question: string
  transcript?: string
}

export type CaptureDraft = {
  kind: 'evento' | 'tarea' | 'recordatorio' | 'gasto'
  title: string
  day: string
  time: string
  durationMin: number
  allDay: boolean
  remind: boolean
  amountCents: number
  currency: 'pen' | 'usd' | string
  categoryId: number
  category: string
  categoryHint?: string
  accountId?: number
  debtId?: number
  sourceName?: string
  confidence: 'alta' | 'baja'
  question: string
  transcript?: string
}

export type MonthMoney = {
  spentCents: number
  incomeCents: number
  remainingCents: number | null
  fxHundredths: number
  currency: string
  accounts: MoneyAccount[]
  cards: MoneyCard[]
  categories: MoneyCategory[]
  movements: Movement[]
}

export type TaskList = {
  id: number
  name: string
  position: number
  openCount: number
}
