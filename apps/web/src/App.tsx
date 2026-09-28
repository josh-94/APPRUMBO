import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, setUnauthorized } from './api'
import { atLocalDate } from './format'
import type { Task, TaskInput, TaskList } from './types'
import { TaskSheet } from './components/TaskSheet'
import { MyDay } from './screens/MyDay'
import { ListDetail, ListsHome } from './screens/Lists'
import { Moment } from './screens/Moment'
import { Week } from './screens/Week'
import { Settings } from './screens/Settings'

type Sheet =
  | { mode: 'create'; listId?: number }
  | { mode: 'edit'; task: Task }
  | null

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [pushReady, setPushReady] = useState(false)
  const [lists, setLists] = useState<TaskList[] | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [loginError, setLoginError] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('error') === 'google' ? 'Google no pudo confirmar la cuenta' : ''
  })
  const [sheet, setSheet] = useState<Sheet>(null)
  const [sort, setSort] = useState<'time' | 'manual'>('time')
  const location = useLocation()
  const openTask = useCallback((task: Task) => setSheet({ mode: 'edit', task }), [])

  const loadLists = useCallback(() => {
    api.lists().then((data) => setLists(data.lists)).catch(() => setLists([]))
  }, [])

  useEffect(() => {
    setUnauthorized(() => setAuthed(false))
    api.session().then((data) => {
      setAuthed(true)
      setPushReady(data.push)
      loadLists()
    }).catch(() => setAuthed(false))
  }, [loadLists])

  const view = viewFor(location.pathname, sort)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const reloadTasks = useCallback(() => {
    if (!view || !authed) return
    setTasks(null)
    api.tasks(view).then((data) => setTasks(data.tasks)).catch(() => setTasks([]))
  }, [view, authed])

  useEffect(() => {
    reloadTasks()
  }, [reloadTasks])

  async function enter(event: FormEvent) {
    event.preventDefault()
    try {
      if (creating) await api.register(email, password)
      else await api.login(email, password)
      setAuthed(true)
      setLoginError('')
      const session = await api.session()
      setPushReady(session.push)
      loadLists()
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'No se pudo entrar')
    }
  }

  async function save(input: TaskInput, id?: number) {
    if (id) await api.updateTask(id, input)
    else await api.createTask(input)
    loadLists()
    reloadTasks()
  }

  async function remove(task: Task) {
    await api.deleteTask(task.id)
    loadLists()
    reloadTasks()
  }

  async function done(task: Task) {
    await api.done(task.id)
    reloadTasks()
  }

  async function later(task: Task, day: string) {
    const dueAt = atLocalDate(day, task.dueAt)
    if (!dueAt) return
    await api.later(task.id, dueAt)
    reloadTasks()
  }

  async function today(task: Task) {
    await api.today(task.id)
    reloadTasks()
  }

  if (authed === null) {
    return <div className="app"><p className="empty">Cargando</p></div>
  }
  if (!authed) {
    return (
      <div className="app login">
        <p className="eyebrow">Hoy</p>
        <h1>Tu día, en orden.</h1>
        <form onSubmit={(event) => void enter(event)}>
          <label className="field">
            Correo
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            Contraseña
            <input
              type="password"
              value={password}
              autoComplete={creating ? 'new-password' : 'current-password'}
              minLength={creating ? 8 : undefined}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {loginError && <p className="error">{loginError}</p>}
          <button type="submit" className="primary">{creating ? 'Crear cuenta' : 'Entrar'}</button>
        </form>
        <button type="button" className="text-button" onClick={() => { setCreating((value) => !value); setLoginError('') }}>
          {creating ? 'Ya tengo cuenta' : 'Crear cuenta'}
        </button>
        <a className="google" href="/api/auth/google">Entrar con Google</a>
      </div>
    )
  }

  const defaultList = lists?.[0]?.id

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/dia" replace />} />
        <Route
          path="/dia"
          element={
            <MyDay
              tasks={tasks}
              onOpen={(task) => setSheet({ mode: 'edit', task })}
              onCreate={() => setSheet({ mode: 'create', listId: defaultList })}
              onDone={(task) => void done(task)}
              onLater={(task, day) => void later(task, day)}
              onDelete={(task) => void remove(task)}
            />
          }
        />
        <Route path="/listas" element={<ListsHome lists={lists} onReloadLists={loadLists} />} />
        <Route
          path="/listas/:id"
          element={
            <ListDetail
              lists={lists}
              tasks={tasks}
              sort={sort}
              onSort={setSort}
              onReloadLists={loadLists}
              onOpen={(task) => setSheet({ mode: 'edit', task })}
              onCreate={(listId) => setSheet({ mode: 'create', listId })}
              onDone={(task) => void done(task)}
              onLater={(task, day) => void later(task, day)}
              onDelete={(task) => void remove(task)}
              onMove={(listId, taskIds) => {
                void api.reorder(listId, taskIds).then(reloadTasks)
              }}
            />
          }
        />
        <Route
          path="/momento"
          element={
            <Moment
              tasks={tasks}
              onToday={today}
              onLater={later}
              onDone={done}
              onDelete={remove}
            />
          }
        />
        <Route
          path="/semana"
          element={
            <Week
              tasks={tasks}
              onOpen={(task) => setSheet({ mode: 'edit', task })}
              onDone={(task) => void done(task)}
              onLater={(task, day) => void later(task, day)}
              onDelete={(task) => void remove(task)}
            />
          }
        />
        <Route path="/tarea/:id" element={<TaskRoute onOpen={openTask} />} />
        <Route
          path="/ajustes"
          element={
            <Settings
              pushReady={pushReady}
              onLogout={() => {
                void api.logout().finally(() => setAuthed(false))
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/dia" replace />} />
      </Routes>
      {sheet && lists && (
        <TaskSheet
          lists={lists}
          task={sheet.mode === 'edit' ? sheet.task : null}
          defaultListId={sheet.mode === 'create' ? sheet.listId : undefined}
          onClose={() => setSheet(null)}
          onSave={save}
          onDelete={
            sheet.mode === 'edit'
              ? async () => {
                  await remove(sheet.task)
                }
              : undefined
          }
        />
      )}
    </>
  )
}

function TaskRoute({ onOpen }: { onOpen: (task: Task) => void }) {
  const params = useParams()
  const navigate = useNavigate()
  useEffect(() => {
    const id = Number(params.id)
    if (!id) {
      navigate('/dia', { replace: true })
      return
    }
    api.task(id).then((task) => {
      onOpen(task)
      navigate('/dia', { replace: true })
    }).catch(() => navigate('/dia', { replace: true }))
  }, [params.id, navigate, onOpen])
  return <div className="app"><p className="empty">Abriendo la tarea</p></div>
}

function viewFor(path: string, sort: 'time' | 'manual') {
  if (path === '/dia' || path === '/') return 'view=myday'
  if (path === '/momento') return 'view=moment'
  if (path === '/semana') return 'view=week'
  const list = path.match(/^\/listas\/(\d+)/)
  if (list) return `listId=${list[1]}&sort=${sort}`
  return ''
}
