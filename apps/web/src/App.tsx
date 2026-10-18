import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, setUnauthorized } from './api'
import { atLocalDate, todayKey } from './format'
import type { Habit, MonthMoney, Task, TaskInput, TaskList } from './types'
import { TaskSheet } from './components/TaskSheet'
import { HabitSheet, MoneySheet } from './components/CaptureSheets'
import { MoneyChat } from './components/MoneyChat'
import { UnifiedCapture } from './components/UnifiedCapture'
import { PayConfirm } from './components/PlanSheets'
import { MyDay } from './screens/MyDay'
import { Tiempo } from './screens/Tiempo'
import { AccountHistory, CuentasPage, PagosPage, Plata, PrestamosPage, TarjetaDetail, TarjetasPage } from './screens/Plata'
import { GoalsPage } from './screens/Goals'
import { HabitsPage } from './screens/Habits'
import { WorkoutsPage } from './screens/Workouts'
import { habitDoneOn } from './habitUtils'
import { ListDetail, ListsHome } from './screens/Lists'
import { Moment } from './screens/Moment'
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
  const [habitOpen, setHabitOpen] = useState(false)
  const [habitEdit, setHabitEdit] = useState<Habit | null>(null)
  const [moneyOpen, setMoneyOpen] = useState(false)
  const [moneyChatOpen, setMoneyChatOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [lifeTick, setLifeTick] = useState(0)
  const [payTask, setPayTask] = useState<Task | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  const [habits, setHabits] = useState<Habit[]>([])
  const [money, setMoney] = useState<MonthMoney | null>(null)
  const [moneyTick, setMoneyTick] = useState(0)
  const [sort, setSort] = useState<'time' | 'manual'>('time')
  const location = useLocation()
  const openTask = useCallback((task: Task) => setSheet({ mode: 'edit', task }), [])

  const loadLife = useCallback(() => {
    setMoneyTick((n) => n + 1)
    setLifeTick((n) => n + 1)
    api.habits().then((data) => setHabits(data.habits)).catch(() => setHabits([]))
    api.month().then(setMoney).catch(() => setMoney(null))
  }, [])

  const loadLists = useCallback(() => {
    api.lists().then((data) => setLists(data.lists)).catch(() => setLists([]))
  }, [])

  useEffect(() => {
    setUnauthorized(() => setAuthed(false))
    api.session().then((data) => {
      setAuthed(true)
      setPushReady(data.push)
      setAccountEmail(data.email || '')
      loadLists()
      loadLife()
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
      setAccountEmail(session.email || '')
      loadLists()
      loadLife()
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
    if (task.payKind && task.payRef) {
      setPayTask(task)
      return
    }
    await api.done(task.id)
    reloadTasks()
  }

  async function later(task: Task, day: string) {
    const dueAt = atLocalDate(day, task.dueAt)
    if (!dueAt) return
    await api.later(task.id, dueAt)
    reloadTasks()
  }

  async function toggleHabit(habit: Habit) {
    const day = todayKey()
    const done = habitDoneOn(habit, day)
    await api.checkHabit(habit.id, day, done ? 0 : Math.max(1, habit.dailyGoal || 1))
    loadLife()
  }

  async function setHabitCount(habit: Habit, day: string, count: number) {
    await api.checkHabit(habit.id, day, count)
    loadLife()
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
        <div className="login-brand">
          <img src="/logo.svg" alt="" width="64" height="64" />
          <p>rumbo</p>
        </div>
        <h1>Tu día y tu plata, con rumbo.</h1>
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
        <p className="login-links">
          <a href="/privacidad">Privacidad</a>
          <a href="/condiciones">Condiciones</a>
        </p>
        <p className="login-copy">© 2026 Rumbo</p>
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
              email={accountEmail}
              tasks={tasks}
              habits={habits}
              currency={money?.currency || 'PEN'}
              onOpen={(task) => setSheet({ mode: 'edit', task })}
              onCreateTask={() => setSheet({ mode: 'create', listId: defaultList })}
              onCreateHabit={() => { setHabitEdit(null); setHabitOpen(true) }}
              onCreateMoney={() => setMoneyOpen(true)}
              onMoneyChat={() => {
                if (!navigator.onLine || !money) {
                  setMoneyOpen(true)
                  return
                }
                setMoneyChatOpen(true)
              }}
              onCapture={() => setCaptureOpen(true)}
              onToggleHabit={(habit) => void toggleHabit(habit)}
              onEditHabit={(habit) => { setHabitEdit(habit); setHabitOpen(true) }}
              onIncHabit={(habit) => {
                const day = todayKey()
                const next = Math.min(habit.dailyGoal, (habit.checks.find((c) => c.day === day)?.count ?? 0) + 1)
                void setHabitCount(habit, day, next)
              }}
              onDone={(task) => void done(task)}
              onLater={(task, day) => void later(task, day)}
              onDelete={(task) => void remove(task)}
            />
          }
        />
        <Route path="/semana" element={<Navigate to="/tiempo" replace />} />
        <Route path="/ajustes" element={<Navigate to="/cuenta" replace />} />
        <Route
          path="/tiempo"
          element={
            <Tiempo
              tasks={tasks}
              onOpenTask={(task) => setSheet({ mode: 'edit', task })}
              refresh={lifeTick}
            />
          }
        />
        <Route path="/tiempo/entrenamientos" element={<WorkoutsPage />} />
        <Route
          path="/habitos"
          element={
            <HabitsPage
              habits={habits}
              onCreate={() => { setHabitEdit(null); setHabitOpen(true) }}
              onEdit={(habit) => { setHabitEdit(habit); setHabitOpen(true) }}
              onSetCount={(habit, day, count) => void setHabitCount(habit, day, count)}
            />
          }
        />
        <Route path="/plata" element={<Plata onCreate={() => setMoneyOpen(true)} onChanged={loadLife} refresh={moneyTick} />} />
        <Route path="/plata/deudas" element={<Navigate to="/plata/tarjetas" replace />} />
        <Route path="/plata/tarjetas" element={<TarjetasPage />} />
        <Route path="/plata/tarjetas/:id" element={<TarjetaDetail />} />
        <Route path="/plata/prestamos" element={<PrestamosPage />} />
        <Route path="/plata/cuentas" element={<CuentasPage />} />
        <Route path="/plata/cuentas/:id" element={<AccountHistory />} />
        <Route path="/plata/pagos" element={<PagosPage />} />
        <Route path="/plata/metas" element={<GoalsPage />} />
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
        <Route path="/tarea/:id" element={<TaskRoute onOpen={openTask} />} />
        <Route
          path="/cuenta"
          element={
            <Settings
              pushReady={pushReady}
              onCurrencyChange={loadLife}
              onLogout={() => {
                void api.logout().finally(() => setAuthed(false))
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/dia" replace />} />
      </Routes>
      {habitOpen && (
        <HabitSheet
          key={habitEdit?.id ?? 'new'}
          habit={habitEdit}
          onClose={() => { setHabitOpen(false); setHabitEdit(null) }}
          onSave={async (input) => {
            if (habitEdit) await api.updateHabit(habitEdit.id, input)
            else await api.createHabit(input)
            loadLife()
          }}
          onDelete={habitEdit ? async () => { await api.deleteHabit(habitEdit.id); loadLife() } : undefined}
        />
      )}
      {payTask && (
        <PayConfirm
          task={payTask}
          onClose={() => setPayTask(null)}
          onSaved={() => {
            setPayTask(null)
            reloadTasks()
            loadLife()
          }}
        />
      )}
      {moneyOpen && money && (
        <MoneySheet
          money={money}
          onClose={() => setMoneyOpen(false)}
          onSave={async (input) => {
            await api.createMovement(input)
            loadLife()
          }}
          onCreateCategory={async (name, kind) => {
            const category = await api.createCategory(name, kind)
            loadLife()
            return category
          }}
        />
      )}
      {moneyChatOpen && money && (
        <MoneyChat
          money={money}
          userKey={accountEmail}
          onClose={() => setMoneyChatOpen(false)}
          onSaved={() => {
            loadLife()
          }}
          onOffline={() => {
            setMoneyChatOpen(false)
            setMoneyOpen(true)
          }}
        />
      )}
      {captureOpen && lists && (
        <UnifiedCapture
          lists={lists}
          money={money}
          defaultListId={defaultList}
          onClose={() => setCaptureOpen(false)}
          onSaveTask={async (input) => {
            await save(input)
          }}
          onSaveMoney={async (input) => {
            await api.createMovement(input)
            loadLife()
          }}
          onCreateCategory={async (name, kind) => {
            const category = await api.createCategory(name, kind)
            loadLife()
            return category
          }}
        />
      )}
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
  if (path === '/tiempo' || path === '/semana') return 'view=week'
  const list = path.match(/^\/listas\/(\d+)/)
  if (list) return `listId=${list[1]}&sort=${sort}`
  return ''
}
