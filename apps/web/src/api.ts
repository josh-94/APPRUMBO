import type { Bill, Debt, Habit, MoneyCategory, MoneyDraft, MoneyPlan, MonthMoney, Movement, PayAccount, Task, TaskInput, TaskList } from './types'

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
  createHabit: (name: string, nGoal: number) =>
    request<Habit>('/api/habits', { method: 'POST', body: JSON.stringify({ name, nGoal }) }),
  checkHabit: (id: number, day: string, on: boolean) =>
    on
      ? request<void>(`/api/habits/${id}/checks`, { method: 'POST', body: JSON.stringify({ day }) })
      : request<void>(`/api/habits/${id}/checks?day=${day}`, { method: 'DELETE' }),
  month: (month?: string) => request<MonthMoney>(month ? `/api/money/month?month=${month}` : '/api/money/month'),
  draftMoney: (body: { text?: string; audio?: Blob; image?: Blob; previous?: MoneyDraft }) => {
    const form = new FormData()
    if (body.text) form.set('text', body.text)
    if (body.audio) form.set('audio', body.audio, audioFilename(body.audio))
    if (body.image) form.set('image', body.image, 'foto.jpg')
    if (body.previous) form.set('previous', JSON.stringify(body.previous))
    return request<MoneyDraft>('/api/money/draft', { method: 'POST', body: form })
  },
  createMovement: (body: { kind: 'gasto' | 'ingreso'; amountCents: number; accountId: number; categoryId: number; day: string; note: string }) =>
    request<Movement>('/api/movements', { method: 'POST', body: JSON.stringify(body) }),
  updateMovement: (id: number, body: { kind: 'gasto' | 'ingreso'; amountCents: number; accountId: number; categoryId: number; day: string; note: string }) =>
    request<Movement>(`/api/movements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMovement: (id: number) => request<void>(`/api/movements/${id}`, { method: 'DELETE' }),
  createCategory: (name: string, kind: 'gasto' | 'ingreso', look?: { icon: string; tint: string }) =>
    request<MoneyCategory>('/api/categories', { method: 'POST', body: JSON.stringify({ name, kind, icon: look?.icon ?? '', tint: look?.tint ?? '' }) }),
  plan: () => request<MoneyPlan>('/api/money/plan'),
  setFx: (fxHundredths: number) => request<void>('/api/money/fx', { method: 'PUT', body: JSON.stringify({ fxHundredths }) }),
  saveAccount: (body: Partial<PayAccount> & { name: string }) =>
    request<PayAccount>(body.id ? `/api/accounts/${body.id}` : '/api/accounts', { method: body.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }),
  deleteAccount: (id: number) => request<void>(`/api/accounts/${id}`, { method: 'DELETE' }),
  saveDebt: (body: Partial<Debt> & { name: string; kind: Debt['kind'] }) =>
    request<Debt>(body.id ? `/api/debts/${body.id}` : '/api/debts', { method: body.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }),
  deleteDebt: (id: number) => request<void>(`/api/debts/${id}`, { method: 'DELETE' }),
  saveBill: (body: Partial<Bill> & { name: string }) =>
    request<Bill>(body.id ? `/api/bills/${body.id}` : '/api/bills', { method: body.id ? 'PATCH' : 'POST', body: JSON.stringify(body) }),
  deleteBill: (id: number) => request<void>(`/api/bills/${id}`, { method: 'DELETE' }),
  confirmPay: (body: { kind: string; id: number; amountCents: number; balancePen: number; balanceUsd: number }) =>
    request<void>('/api/money/confirm', { method: 'POST', body: JSON.stringify(body) }),
  exportData: () => request<Record<string, unknown>>('/api/export'),
}

function audioFilename(blob: Blob) {
  if (blob.type.includes('mp4') || blob.type.includes('aac') || blob.type.includes('m4a')) return 'audio.mp4'
  if (blob.type.includes('mpeg') || blob.type.includes('mp3')) return 'audio.mp3'
  if (blob.type.includes('wav')) return 'audio.wav'
  if (blob.type.includes('ogg')) return 'audio.ogg'
  return 'audio.webm'
}
