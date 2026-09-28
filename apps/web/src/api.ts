import type { Task, TaskInput, TaskList } from './types'

let onUnauthorized = () => {}

export function setUnauthorized(fn: () => void) {
  onUnauthorized = fn
}

async function request<T>(path: string, options: RequestInit = {}, redirectOnAuth = true): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
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
  session: () => request<{ ok: boolean; push: boolean }>('/api/session'),
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
}
