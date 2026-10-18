import { useMemo, useState, type FormEvent } from 'react'
import type { MoneyCategory, MonthMoney, MovementInput, TaskInput, TaskList } from '../types'
import { combineLocal, todayKey } from '../format'
import { MoneySheet } from './CaptureSheets'

type Kind = 'tarea' | 'recordatorio' | 'gasto'

function parseLine(raw: string, kind: Kind): { title: string; date: string; time: string; remind: boolean } {
  let text = raw.trim()
  let date = todayKey()
  let time = kind === 'recordatorio' ? '09:00' : ''
  const lower = text.toLowerCase()
  if (/\bmañana\b/.test(lower)) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    date = todayKey(d)
    text = text.replace(/\bmañana\b/gi, '').trim()
  } else if (/\bhoy\b/.test(lower)) {
    date = todayKey()
    text = text.replace(/\bhoy\b/gi, '').trim()
  }
  const hourMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
  if (hourMatch) {
    let hour = Number(hourMatch[1])
    const minute = hourMatch[2] ? Number(hourMatch[2]) : 0
    const meridiem = hourMatch[3]?.toLowerCase()
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    text = text.replace(hourMatch[0], '').trim()
  }
  text = text.replace(/\s{2,}/g, ' ').trim()
  return {
    title: text || raw.trim(),
    date,
    time: time || (kind === 'recordatorio' ? '09:00' : ''),
    remind: kind === 'recordatorio',
  }
}

export function UnifiedCapture({
  lists,
  money,
  defaultListId,
  onClose,
  onSaveTask,
  onSaveMoney,
  onCreateCategory,
}: {
  lists: TaskList[]
  money: MonthMoney | null
  defaultListId?: number
  onClose: () => void
  onSaveTask: (input: TaskInput) => Promise<void>
  onSaveMoney: (input: MovementInput) => Promise<void>
  onCreateCategory: (name: string, kind: 'gasto' | 'ingreso') => Promise<MoneyCategory>
}) {
  const [kind, setKind] = useState<Kind>('tarea')
  const [line, setLine] = useState('')
  const [error, setError] = useState('')
  const parsed = useMemo(() => parseLine(line, kind), [line, kind])

  if (kind === 'gasto') {
    if (!money) {
      return (
        <div className="sheet-backdrop" onClick={onClose}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <p className="empty">Cargando finanzas…</p>
          </div>
        </div>
      )
    }
    return (
      <MoneySheet
        money={money}
        onClose={onClose}
        onSave={onSaveMoney}
        onCreateCategory={onCreateCategory}
      />
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!parsed.title) {
      setError('Escribe qué quieres anotar.')
      return
    }
    const listId = defaultListId || lists[0]?.id
    if (!listId) {
      setError('Crea una lista primero.')
      return
    }
    try {
      await onSaveTask({
        listId,
        title: parsed.title,
        notes: '',
        dueAt: combineLocal(parsed.date, parsed.time || '09:00'),
        remind: parsed.remind || Boolean(parsed.time),
        pinned: false,
        repeatWeekdays: [],
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>Anotar</h2>
        <div className="switch-row">
          <button type="button" className={kind === 'tarea' ? 'pill on' : 'pill quiet'} onClick={() => setKind('tarea')}>Tarea</button>
          <button type="button" className={kind === 'recordatorio' ? 'pill on' : 'pill quiet'} onClick={() => setKind('recordatorio')}>Recordatorio</button>
          <button type="button" className="pill quiet" onClick={() => setKind('gasto' as Kind)}>Gasto</button>
        </div>
        <label className="field">
          {kind === 'recordatorio' ? 'Qué te aviso' : 'Qué hacer'}
          <input
            value={line}
            autoFocus
            placeholder={kind === 'recordatorio' ? 'Pagar luz mañana 6pm' : 'Reunión mañana 8am'}
            onChange={(event) => setLine(event.target.value)}
          />
        </label>
        {line.trim() && (
          <p className="hint">
            Se guarda: “{parsed.title}”
            {parsed.date ? ` · ${parsed.date}` : ''}
            {parsed.time ? ` · ${parsed.time}` : ''}
            {parsed.remind ? ' · aviso' : ''}
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
      </form>
    </div>
  )
}
