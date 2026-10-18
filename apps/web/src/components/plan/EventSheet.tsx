import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent, EventColor, EventInput } from '../../types'
import { combineLocal, dateInput, timeInput, weekdayLabel } from '../../format'
import { DURATION_PILLS, EVENT_COLORS, durationMinutes, parseDay } from './calendarUtils'

type Props = {
  event: CalendarEvent | null
  defaultDay?: string
  onClose: () => void
  onSave: (input: EventInput, id?: number) => Promise<void>
  onDelete?: () => Promise<void>
}

export function EventSheet({ event, defaultDay, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [allDay, setAllDay] = useState(Boolean(event?.allDay))
  const [startDate, setStartDate] = useState(dateInput(event?.startsAt ?? null) || defaultDay || dateInput(new Date().toISOString()))
  const [startTime, setStartTime] = useState(event ? timeInput(event.startsAt) : '09:00')
  const [endDate, setEndDate] = useState(dateInput(event?.endsAt ?? null) || defaultDay || dateInput(new Date().toISOString()))
  const [endTime, setEndTime] = useState(event && !event.allDay ? timeInput(event.endsAt) : '10:00')
  const [color, setColor] = useState<EventColor>(event?.color ?? 'menta')
  const [remind, setRemind] = useState(event?.remindMinutes != null)
  const [repeat, setRepeat] = useState(event?.repeatRule === 'weekly')
  const [days, setDays] = useState<number[]>(event?.repeatWeekdays ?? [])
  const [duration, setDuration] = useState(() =>
    event && !event.allDay ? durationMinutes(event.startsAt, event.endsAt) : 60,
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [frame, setFrame] = useState(() => visibleFrame())
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const viewport = window.visualViewport
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function place() {
      setFrame(visibleFrame())
    }
    place()
    viewport?.addEventListener('resize', place)
    viewport?.addEventListener('scroll', place)
    return () => {
      document.body.style.overflow = previousOverflow
      viewport?.removeEventListener('resize', place)
      viewport?.removeEventListener('scroll', place)
    }
  }, [])

  function applyDuration(minutes: number) {
    setDuration(minutes)
    const starts = combineLocal(startDate, startTime)
    if (!starts) return
    const ends = new Date(new Date(starts).getTime() + minutes * 60_000)
    setEndDate(dateInput(ends.toISOString()))
    setEndTime(timeInput(ends.toISOString()))
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const startsAt = allDay
        ? combineLocal(startDate, '00:00')
        : combineLocal(startDate, startTime)
      if (!startsAt) {
        setError('Indica inicio')
        return
      }
      let endsAt: string | null
      if (allDay) {
        const [y, m, d] = startDate.split('-').map(Number)
        endsAt = new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString()
      } else {
        endsAt = combineLocal(endDate, endTime)
      }
      await onSave(
        {
          title,
          location,
          description,
          allDay,
          startsAt,
          endsAt,
          color,
          remindMinutes: remind ? 30 : null,
          repeatRule: repeat ? 'weekly' : 'none',
          repeatWeekdays: repeat ? days : [],
        },
        event?.id,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="sheet-backdrop"
      style={{
        top: frame.top,
        left: frame.left,
        width: frame.width,
        height: frame.height,
        right: 'auto',
        bottom: 'auto',
      }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="sheet"
        style={{ maxHeight: Math.max(frame.height - 12, 160) }}
        role="dialog"
        aria-labelledby="event-sheet-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-head-row">
          <h2 id="event-sheet-title">{event ? 'Evento' : 'Nuevo evento'}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <label className="field">
          Título
          <input value={title} onChange={(ev) => setTitle(ev.target.value)} autoFocus placeholder="Qué vas a hacer" />
        </label>
        <label className="field">
          Lugar o enlace
          <input value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="Opcional" />
        </label>
        <label className="field">
          Descripción
          <textarea value={description} onChange={(ev) => setDescription(ev.target.value)} rows={3} />
        </label>
        <label className="checkline">
          <input type="checkbox" checked={allDay} onChange={(ev) => setAllDay(ev.target.checked)} />
          Todo el día
        </label>
        <div className="split">
          <label className="field">
            Inicio
            <input type="date" value={startDate} onChange={(ev) => setStartDate(ev.target.value)} />
          </label>
          {!allDay && (
            <label className="field">
              Hora
              <input type="time" value={startTime} onChange={(ev) => setStartTime(ev.target.value)} />
            </label>
          )}
        </div>
        {!allDay && (
          <>
            <div className="split">
              <label className="field">
                Fin
                <input type="date" value={endDate} onChange={(ev) => setEndDate(ev.target.value)} />
              </label>
              <label className="field">
                Hora
                <input type="time" value={endTime} onChange={(ev) => setEndTime(ev.target.value)} />
              </label>
            </div>
            <p className="field-label">Duración</p>
            <div className="duration-pills">
              {DURATION_PILLS.map((pill) => (
                <button
                  key={pill.minutes}
                  type="button"
                  className={duration === pill.minutes ? 'chip on' : 'chip'}
                  onClick={() => applyDuration(pill.minutes)}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="split">
          <label className="checkline">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(ev) => {
                const on = ev.target.checked
                setRepeat(on)
                if (on && days.length === 0) {
                  const weekday = ((parseDay(startDate).getDay() + 6) % 7) + 1
                  setDays([weekday])
                }
              }}
            />
            Se repite
          </label>
          <label className="checkline">
            <input type="checkbox" checked={remind} onChange={(ev) => setRemind(ev.target.checked)} />
            Aviso (30 min)
          </label>
        </div>
        {repeat && (
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
        )}
        <p className="field-label">Color</p>
        <div className="event-swatches">
          {EVENT_COLORS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={color === item.id ? `event-swatch color-${item.id} on` : `event-swatch color-${item.id}`}
              aria-label={item.label}
              onClick={() => setColor(item.id)}
            />
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button type="button" className="primary" disabled={busy || !title.trim()} onClick={() => void save()}>
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

function visibleFrame() {
  const viewport = window.visualViewport
  if (!viewport) {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
  }
  return {
    top: viewport.offsetTop,
    left: viewport.offsetLeft,
    width: viewport.width,
    height: viewport.height,
  }
}
