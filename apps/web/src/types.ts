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

export type TaskList = {
  id: number
  name: string
  position: number
  openCount: number
}
