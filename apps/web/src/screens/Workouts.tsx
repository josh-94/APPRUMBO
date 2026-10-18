import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Shell } from '../components/Shell'
import { todayKey } from '../format'
import type { WorkoutRecord, WorkoutRoutine, WorkoutSession } from '../types'

export function WorkoutsPage() {
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([])
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [records, setRecords] = useState<WorkoutRecord[]>([])
  const [editing, setEditing] = useState<WorkoutRoutine | null | undefined>(undefined)
  const [logging, setLogging] = useState<WorkoutRoutine | null>(null)

  function reload() {
    api.workoutRoutines().then((data) => setRoutines(data.routines)).catch(() => setRoutines([]))
    api.workoutSessions().then((data) => setSessions(data.sessions)).catch(() => setSessions([]))
    api.workoutRecords().then((data) => setRecords(data.records)).catch(() => setRecords([]))
  }

  useEffect(() => { reload() }, [])

  const week = weekMarks(sessions)

  return (
    <Shell title="Entrenamientos" back="/tiempo">
      <section className="summary">
        <p className="label">Esta semana</p>
        <div className="week-row">
          {week.map((day) => (
            <div key={day.label} className={day.on ? 'day-chip today' : 'day-chip'}>
              <small>{day.label}</small>
              <strong>{day.on ? '●' : '·'}</strong>
            </div>
          ))}
        </div>
      </section>

      <h2 className="section-label">Rutinas</h2>
      {routines.length === 0 && <p className="empty">Crea una rutina con tus ejercicios.</p>}
      {routines.map((routine) => (
        <article key={routine.id} className="goal-card">
          <strong>{routine.name}</strong>
          <p className="meta">{routine.exercises.map((item) => item.name).join(' · ') || 'Sin ejercicios'}</p>
          <div className="switch-row">
            <button type="button" className="pill on" onClick={() => setLogging(routine)}>Registrar hoy</button>
            <button type="button" className="pill quiet" onClick={() => setEditing(routine)}>Editar</button>
          </div>
        </article>
      ))}
      <button type="button" className="ghost" onClick={() => setEditing(null)}>Nueva rutina</button>

      {records.length > 0 && (
        <>
          <h2 className="section-label">Récords</h2>
          {records.map((item) => (
            <div key={item.exerciseName} className="money-row">
              <div>
                <strong>{item.exerciseName}</strong>
                <p className="meta">{item.occurredOn}</p>
              </div>
              <strong>{(item.weightGrams / 1000).toFixed(1)} kg × {item.reps}</strong>
            </div>
          ))}
        </>
      )}

      <h2 className="section-label">Últimas sesiones</h2>
      {sessions.slice(0, 8).map((session) => (
        <div key={session.id} className="money-row">
          <div>
            <strong>{session.routineName || 'Sesión'}</strong>
            <p className="meta">{session.occurredOn}{session.durationMin ? ` · ${session.durationMin} min` : ''}</p>
          </div>
          <strong>{session.sets.length} series</strong>
        </div>
      ))}

      {editing !== undefined && (
        <RoutineSheet
          routine={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); reload() }}
        />
      )}
      {logging && (
        <SessionSheet
          routine={logging}
          onClose={() => setLogging(null)}
          onSaved={() => { setLogging(null); reload() }}
        />
      )}
    </Shell>
  )
}

function weekMarks(sessions: WorkoutSession[]) {
  const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const monday = new Date()
  const delta = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - delta)
  return labels.map((label, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const key = todayKey(date)
    return { label, on: sessions.some((session) => session.occurredOn === key) }
  })
}

function RoutineSheet({ routine, onClose, onSaved }: {
  routine: WorkoutRoutine | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(routine?.name ?? '')
  const [lines, setLines] = useState((routine?.exercises.map((item) => item.name) ?? ['']).join('\n') || '')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const exercises = lines.split('\n').map((line) => line.trim()).filter(Boolean).map((item) => ({ name: item }))
    try {
      await api.saveWorkoutRoutine({ id: routine?.id, name: name.trim(), exercises })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>{routine ? 'Editar rutina' : 'Nueva rutina'}</h2>
        <label className="field">Nombre<input value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field">
          Ejercicios (uno por línea)
          <textarea rows={5} value={lines} onChange={(event) => setLines(event.target.value)} placeholder={'Sentadilla\nPress banca\nRemo'} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {routine && (
          <button type="button" className="ghost danger" onClick={() => void api.deleteWorkoutRoutine(routine.id).then(onSaved)}>
            Archivar
          </button>
        )}
      </form>
    </div>
  )
}

function SessionSheet({ routine, onClose, onSaved }: {
  routine: WorkoutRoutine
  onClose: () => void
  onSaved: () => void
}) {
  const [rows, setRows] = useState(routine.exercises.map((item) => ({ exerciseName: item.name, reps: 10, weightKg: '' })))
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await api.addWorkoutSession({
        routineId: routine.id,
        day: todayKey(),
        sets: rows.map((row, index) => ({
          exerciseName: row.exerciseName,
          reps: row.reps,
          weightGrams: Math.round(Number(row.weightKg.replace(',', '.') || 0) * 1000),
          position: index,
        })),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>{routine.name} · hoy</h2>
        {rows.map((row, index) => (
          <div key={row.exerciseName} className="field">
            <strong>{row.exerciseName}</strong>
            <div className="switch-row">
              <label>
                Reps
                <input
                  type="number"
                  min={0}
                  value={row.reps}
                  onChange={(event) => setRows((items) => items.map((item, i) => i === index ? { ...item, reps: Number(event.target.value) } : item))}
                />
              </label>
              <label>
                Peso kg
                <input
                  inputMode="decimal"
                  value={row.weightKg}
                  onChange={(event) => setRows((items) => items.map((item, i) => i === index ? { ...item, weightKg: event.target.value } : item))}
                />
              </label>
            </div>
          </div>
        ))}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar sesión</button>
      </form>
    </div>
  )
}
