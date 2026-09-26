import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Task, TaskList } from '../types'
import { sectionTitle } from '../format'
import { Shell } from '../components/Shell'
import { TaskRow } from '../components/TaskRow'
import { api } from '../api'

type Props = {
  lists: TaskList[] | null
  tasks: Task[] | null
  sort: 'time' | 'manual'
  onSort: (sort: 'time' | 'manual') => void
  onReloadLists: () => void
  onOpen: (task: Task) => void
  onCreate: (listId: number) => void
  onDone: (task: Task) => void
  onLater: (task: Task, day: string) => void
  onDelete: (task: Task) => void
  onMove: (listId: number, taskIds: number[]) => void
}

export function ListsHome({ lists, onReloadLists }: { lists: TaskList[] | null; onReloadLists: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await api.createList(trimmed)
      setName('')
      setError('')
      onReloadLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    }
  }

  return (
    <Shell title="Listas" tabs>
      {lists === null && <p className="empty">Cargando</p>}
      <div className="stack">
        {lists?.map((list) => (
          <Link key={list.id} className="list-link" to={`/listas/${list.id}`}>
            <span>{list.name}</span>
            <strong>{list.openCount}</strong>
          </Link>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nueva lista" aria-label="Nueva lista" />
        <button type="submit" className="primary">
          Crear
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </Shell>
  )
}

export function ListDetail(props: Props) {
  const params = useParams()
  const listId = Number(params.id)
  const list = props.lists?.find((item) => item.id === listId)
  const tasks = props.tasks ?? []
  const groups = props.sort === 'manual' ? [{ key: 'manual', title: '', items: tasks }] : groupBySection(tasks)

  return (
    <Shell title={list?.name ?? 'Lista'} back="/listas">
      <div className="shortcuts">
        <button type="button" className={props.sort === 'time' ? 'pill' : 'pill quiet'} onClick={() => props.onSort('time')}>
          Por tiempo
        </button>
        <button type="button" className={props.sort === 'manual' ? 'pill' : 'pill quiet'} onClick={() => props.onSort('manual')}>
          Manual
        </button>
      </div>
      {props.tasks === null && <p className="empty">Cargando</p>}
      {props.tasks && tasks.length === 0 && <p className="empty">Esta lista está vacía.</p>}
      {groups.map((group) => (
        <section key={group.key}>
          {group.title && <h2 className="section-label">{group.title}</h2>}
          {group.items.map((task, index) => (
            <div key={task.id}>
              <TaskRow
                task={task}
                onOpen={() => props.onOpen(task)}
                onDone={() => props.onDone(task)}
                onLater={(day) => props.onLater(task, day)}
                onDelete={() => props.onDelete(task)}
              />
              {props.sort === 'manual' && task.status === 'open' && (
                <div className="nudge">
                  <button type="button" disabled={index === 0} onClick={() => swap(props, tasks, index, -1)}>
                    Subir
                  </button>
                  <button
                    type="button"
                    disabled={index === tasks.filter((item) => item.status === 'open').length - 1}
                    onClick={() => swap(props, tasks, index, 1)}
                  >
                    Bajar
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
      <button type="button" className="fab" onClick={() => props.onCreate(listId)}>
        Añadir tarea
      </button>
    </Shell>
  )
}

function groupBySection(tasks: Task[]) {
  const order = ['today', 'tomorrow', 'upcoming', 'someday']
  const groups: { key: string; title: string; items: Task[] }[] = order
    .map((key) => ({
      key,
      title: sectionTitle[key],
      items: tasks.filter((task) => task.status !== 'done' && task.section === key),
    }))
    .filter((group) => group.items.length > 0)
  const done = tasks.filter((task) => task.status === 'done')
  if (done.length > 0) groups.push({ key: 'done', title: 'Hechas', items: done })
  return groups
}

function swap(props: Props, tasks: Task[], index: number, direction: number) {
  const open = tasks.filter((task) => task.status === 'open')
  const next = index + direction
  if (next < 0 || next >= open.length) return
  const ids = open.map((task) => task.id)
  const [moved] = ids.splice(index, 1)
  ids.splice(next, 0, moved)
  const listId = Number(tasks[0]?.listId)
  props.onMove(listId, ids)
}
