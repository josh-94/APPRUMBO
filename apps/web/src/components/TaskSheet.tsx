import { useEffect, useState } from 'react'
import type { Task, TaskInput, TaskList } from '../types'
import { combineLocal, dateInput, timeInput, weekdayLabel } from '../format'

type Props = {
  lists: TaskList[]
  task: Task | null
  defaultListId?: number
  onClose: () => void
  onSave: (input: TaskInput, id?: number) => Promise<void>
  onDelete?: () => Promise<void>
}

export function TaskSheet({ lists, task, defaultListId, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [listId, setListId] = useState(task?.listId ?? defaultListId ?? lists[0]?.id ?? 0)
  const [date, setDate] = useState(dateInput(task?.dueAt ?? null))
  const [time, setTime] = useState(timeInput(task?.dueAt ?? null))
  const [remind, setRemind] = useState(Boolean(task?.remindAt))
  const [pinned, setPinned] = useState(Boolean(task?.pinned))
  const [days, setDays] = useState<number[]>(task?.repeatWeekdays ?? [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setBusy(true)
    setError('')
    try {
      await onSave(
        {
          listId,
          title,
          notes,
          dueAt: combineLocal(date, time),
          remind,
          pinned,
          repeatWeekdays: days,
        },
        task?.id,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-labelledby="sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 id="sheet-title">{task ? 'Tarea' : 'Nueva tarea'}</h2>
        <label className="field">
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus placeholder="Qué hay que hacer" />
        </label>
        <label className="field">
          Nota
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        <label className="field">
          Lista
          <select value={listId} onChange={(event) => setListId(Number(event.target.value))}>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
        <div className="split">
          <label className="field">
            Fecha
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            Hora
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
        </div>
        <p className="field-label">Se repite</p>
        <div className="weekdays">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <button
              type="button"
              key={day}
              className={days.includes(day) ? 'weekday on' : 'weekday'}
              onClick={() =>
                setDays((current) =>
                  current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort(),
                )
              }
            >
              {weekdayLabel(day)}
            </button>
          ))}
        </div>
        <label className="checkline">
          <input type="checkbox" checked={remind} onChange={(event) => setRemind(event.target.checked)} />
          Recordarme
        </label>
        <label className="checkline">
          <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
          Fijar en Mi día
        </label>
        {error && <p className="error">{error}</p>}
        <button type="button" className="primary" disabled={busy} onClick={save}>
          Guardar
        </button>
        {onDelete && (
          <button
            type="button"
            className="ghost danger"
            onClick={() => {
              void onDelete().then(onClose).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'No se pudo borrar')
              })
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  )
}
