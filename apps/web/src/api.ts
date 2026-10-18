import type { Bill, CalendarEvent, CaptureDraft, Debt, DebtMove, EventInput, FoodHit, Goal, GymLog, GymWeek, Habit, HomeCard, Meal, MealItem, MoneyCategory, MoneyDraft, MoneyPlan, MonthMoney, Movement, MovementInput, PayAccount, Task, TaskInput, TaskList, WorkoutRecord, WorkoutRoutine, WorkoutSession, WorkoutSet } from './types'

let onUnauthorized = () => {}

export function setUnauthorized(fn: () => void) {
  onUnauthorized = fn
}

async function request<T>(path: string, options: RequestInit = {}, redirectOnAuth = true): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, { ...options, headers, credentials: 'include' })
  if (response.status === 401 && redirectOnAuth) {
    onUnauthorized()
    throw new Error('Necesitas entrar')
  }
  if (response.status === 204) {
    return undefined as T
  }
  const text = await response.text()
  const data = text ? JSON.parse(text) as T & { error?: string } : undefined
  if (!response.ok) {
    throw new Error(data?.error || 'No se pudo completar')
  }
  return data as T
}

export type AgendaItem = {
  type: 'task' | 'habit' | 'workout'
  id: number
  title: string
  hour?: string
  done?: boolean
  nGoal?: number
  doneWeek?: number
  note?: string
  payKind?: string
  payRef?: number
}

export const api = {
  session: () => request<{ ok: boolean; push: boolean; email: string }>('/api/session'),
  login: (email: string, password: string) =>
    request<{ ok: boolean }>('/api/session', { method: 'POST', body: JSON.stringify({ email, password }) }, false),
  register: (email: string, password: string) =>
    request<{ ok: boolean }>('/api/register', { method: 'POST', body: JSON.stringify({ email, password }) }, false),
  logout: () => request<void>('/api/session', { method: 'DELETE' }),
  lists: () => request<{ lists: TaskList[] }>('/api/lists'),
  createList: (name: string) =>
    request<TaskList>('/api/lists', { method: 'POST', body: JSON.stringify({ name }) }),
  renameList: (id: number, name: string) =>
    request<TaskList>(`/api/lists/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteList: (id: number) => request<void>(`/api/lists/${id}`, { method: 'DELETE' }),
  reorder: (id: number, taskIds: number[]) =>
    request<void>(`/api/lists/${id}/order`, { method: 'POST', body: JSON.stringify({ taskIds }) }),
  tasks: (query: string) => request<{ tasks: Task[] }>(`/api/tasks?${query}`),
  task: (id: number) => request<Task>(`/api/tasks/${id}`),
  createTask: (input: TaskInput) =>
    request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
  updateTask: (id: number, input: TaskInput) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteTask: (id: number) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  done: (id: number) => request<Task>(`/api/tasks/${id}/done`, { method: 'POST' }),
  today: (id: number) => request<Task>(`/api/tasks/${id}/today`, { method: 'POST' }),
  later: (id: number, dueAt: string) =>
    request<Task>(`/api/tasks/${id}/later`, { method: 'POST', body: JSON.stringify({ dueAt }) }),
  vapid: () => request<{ publicKey: string }>('/api/push/vapid'),
  savePush: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<void>('/api/push/subscriptions', { method: 'POST', body: JSON.stringify(body) }),
  habits: () => request<{ habits: Habit[] }>('/api/habits'),
  createHabit: (input: { name: string; nGoal: number; icon?: string; category?: string; dailyGoal?: number }) =>
    request<Habit>('/api/habits', { method: 'POST', body: JSON.stringify(input) }),
  updateHabit: (id: number, input: { name: string; nGoal: number; icon?: string; category?: string; dailyGoal?: number }) =>
    request<Habit>(`/api/habits/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteHabit: (id: number) => request<void>(`/api/habits/${id}`, { method: 'DELETE' }),
  checkHabit: (id: number, day: string, count: number) =>
    count > 0
      ? request<void>(`/api/habits/${id}/checks`, { method: 'POST', body: JSON.stringify({ day, count }) })
      : request<void>(`/api/habits/${id}/checks?day=${day}`, { method: 'DELETE' }),
  agenda: (day: string) => request<{ day: string; items: AgendaItem[] }>(`/api/agenda?day=${day}`),
  events: (from: string, to: string) =>
    request<{ events: CalendarEvent[] }>(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  event: (id: number) => request<CalendarEvent>(`/api/events/${id}`),
  createEvent: (input: EventInput) =>
    request<CalendarEvent>('/api/events', { method: 'POST', body: JSON.stringify(input) }),
  updateEvent: (id: number, input: EventInput) =>
    request<CalendarEvent>(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteEvent: (id: number) => request<void>(`/api/events/${id}`, { method: 'DELETE' }),
  goals: () => request<{ goals: Goal[] }>('/api/goals'),
  saveGoal: (body: Partial<Goal> & { name: string; targetCents: number }) =>
    request<Goal>(body.id ? `/api/goals/${body.id}` : '/api/goals', { method: body.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }),
  deleteGoal: (id: number) => request<void>(`/api/goals/${id}`, { method: 'DELETE' }),
  contributeGoal: (id: number, body: { amountCents: number; accountId?: number; day?: string; note?: string }) =>
    request<Goal>(`/api/goals/${id}/contribute`, { method: 'POST', body: JSON.stringify(body) }),
  workoutRoutines: () => request<{ routines: WorkoutRoutine[] }>('/api/workouts/routines'),
  saveWorkoutRoutine: (body: { id?: number; name: string; exercises: { name: string }[] }) =>
    request<WorkoutRoutine>(body.id ? `/api/workouts/routines/${body.id}` : '/api/workouts/routines', {
      method: body.id ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    }),
  deleteWorkoutRoutine: (id: number) => request<void>(`/api/workouts/routines/${id}`, { method: 'DELETE' }),
  workoutSessions: () => request<{ sessions: WorkoutSession[] }>('/api/workouts/sessions'),
  addWorkoutSession: (body: { routineId?: number; day?: string; note?: string; durationMin?: number; sets: WorkoutSet[] }) =>
    request<WorkoutSession>('/api/workouts/sessions', { method: 'POST', body: JSON.stringify(body) }),
  workoutRecords: () => request<{ records: WorkoutRecord[] }>('/api/workouts/records'),
  gymWeek: (week?: string) =>
    request<GymWeek>(week ? `/api/gym/week?week=${encodeURIComponent(week)}` : '/api/gym/week'),
  setGymWeek: (weekStart: string, weekdays: number[]) =>
    request<GymWeek>('/api/gym/week', { method: 'PUT', body: JSON.stringify({ weekStart, weekdays }) }),
  setGymLog: (body: { day: string; attended: boolean; attendedAt?: string }) =>
    request<GymLog>('/api/gym/log', { method: 'PUT', body: JSON.stringify(body) }),
  meals: (day: string) => request<{ meals: Meal[] }>(`/api/meals?day=${encodeURIComponent(day)}`),
  createMeal: (body: { day: string; title: string; eatenAt?: string }) =>
    request<Meal>('/api/meals', { method: 'POST', body: JSON.stringify(body) }),
  deleteMeal: (id: number) => request<void>(`/api/meals/${id}`, { method: 'DELETE' }),
  addMealItem: (mealId: number, body: Omit<MealItem, 'id'>) =>
    request<MealItem>(`/api/meals/${mealId}/items`, { method: 'POST', body: JSON.stringify(body) }),
  deleteMealItem: (mealId: number, itemId: number) =>
    request<void>(`/api/meals/${mealId}/items/${itemId}`, { method: 'DELETE' }),
  searchFoods: (q: string) =>
    request<{ foods: FoodHit[] }>(`/api/foods/search?q=${encodeURIComponent(q)}`),
  homePrefs: () => request<{ cards: HomeCard[] }>('/api/home/prefs'),
  saveHomePrefs: (cards: HomeCard[]) =>
    request<{ cards: HomeCard[] }>('/api/home/prefs', { method: 'PUT', body: JSON.stringify({ cards }) }),
  month: (month?: string) => request<MonthMoney>(month ? `/api/money/month?month=${month}` : '/api/money/month'),
  draftMoney: (body: { text?: string; previous?: MoneyDraft; memory?: string }) => {
    const form = new FormData()
    if (body.text) form.set('text', body.text)
    if (body.previous) form.set('previous', JSON.stringify(body.previous))
    if (body.memory) form.set('memory', body.memory)
    return request<MoneyDraft>('/api/money/draft', { method: 'POST', body: form })
  },
  draftCapture: (body: { text: string; intent?: 'evento' | 'tarea' | 'recordatorio' | 'gasto' | 'auto' }) =>
    request<CaptureDraft>('/api/capture/draft', { method: 'POST', body: JSON.stringify(body) }),
  createMovement: (body: MovementInput) =>
    request<Movement>('/api/movements', { method: 'POST', body: JSON.stringify(body) }),
  updateMovement: (id: number, body: MovementInput) =>
    request<Movement>(`/api/movements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMovement: (id: number) => request<void>(`/api/movements/${id}`, { method: 'DELETE' }),
  createCategory: (name: string, kind: 'gasto' | 'ingreso', look?: { icon: string; tint: string }) =>
    request<MoneyCategory>('/api/categories', { method: 'POST', body: JSON.stringify({ name, kind, icon: look?.icon ?? '', tint: look?.tint ?? '' }) }),
  plan: () => request<MoneyPlan>('/api/money/plan'),
  setFx: (fxHundredths: number) => request<void>('/api/money/fx', { method: 'PUT', body: JSON.stringify({ fxHundredths }) }),
  setHomeCurrency: (currency: string) =>
    request<void>('/api/money/currency', { method: 'PUT', body: JSON.stringify({ currency }) }),
  saveAccount: (body: Partial<PayAccount> & { name: string }) =>
    request<PayAccount>(body.id ? `/api/accounts/${body.id}` : '/api/accounts', { method: body.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }),
  deleteAccount: (id: number) => request<void>(`/api/accounts/${id}`, { method: 'DELETE' }),
  saveDebt: (body: Partial<Debt> & { name: string; kind: Debt['kind'] }) =>
    request<Debt>(body.id ? `/api/debts/${body.id}` : '/api/debts', { method: body.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }),
  deleteDebt: (id: number) => request<void>(`/api/debts/${id}`, { method: 'DELETE' }),
  debtMoves: (id: number) => request<DebtMove[]>(`/api/debts/${id}/moves`),
  addDebtMove: (id: number, body: { kind: DebtMove['kind']; currency: DebtMove['currency']; amountCents: number; day: string; note: string }) =>
    request<DebtMove>(`/api/debts/${id}/moves`, { method: 'POST', body: JSON.stringify(body) }),
  deleteDebtMove: (id: number, moveId: number) => request<void>(`/api/debts/${id}/moves/${moveId}`, { method: 'DELETE' }),
  saveBill: (body: Partial<Bill> & { name: string }) =>
    request<Bill>(body.id ? `/api/bills/${body.id}` : '/api/bills', { method: body.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }),
  deleteBill: (id: number) => request<void>(`/api/bills/${id}`, { method: 'DELETE' }),
  confirmPay: (body: { kind: string; id: number; amountCents: number; balancePen: number; balanceUsd: number }) =>
    request<void>('/api/money/confirm', { method: 'POST', body: JSON.stringify(body) }),
  exportData: () => request<Record<string, unknown>>('/api/export'),
}
