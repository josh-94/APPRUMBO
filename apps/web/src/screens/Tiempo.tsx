import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import type { CalendarEvent, EventInput, Goal, Task } from '../types'
import { todayKey } from '../format'
import { Shell } from '../components/Shell'
import { EventSheet } from '../components/plan/EventSheet'
import { CalendarDayView, CalendarMonthView, CalendarWeekView } from '../components/plan/CalendarViews'
import {
  type PlanLayer,
  type PlanView,
  navLabel,
  rangeForView,
  shiftAnchor,
  toOverlayEvents,
  toOverlayGoals,
  toOverlayTasks,
  todayStatusLabel,
} from '../components/plan/calendarUtils'
import { dateChipLabel, formatDurationChip, parsedToStartsEnds } from '../parseEventLine'
import { captureToParsed, useCaptureDraft } from '../useCaptureDraft'

type Props = {
  tasks: Task[] | null
  onOpenTask: (task: Task) => void
  refresh: number
}

export function Tiempo({ tasks, onOpenTask, refresh }: Props) {
  const [view, setView] = useState<PlanView>('day')
  const [anchor, setAnchor] = useState(todayKey())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [layers, setLayers] = useState<Record<PlanLayer, boolean>>({
    events: true,
    tasks: true,
    goals: true,
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [quick, setQuick] = useState('')
  const [sheet, setSheet] = useState<{ mode: 'create' } | { mode: 'edit'; event: CalendarEvent } | null>(null)
  const [tick, setTick] = useState(0)
  const [savingQuick, setSavingQuick] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const today = todayKey()
  const { draft, loading: drafting } = useCaptureDraft(quick, 'evento')
  const parsed = useMemo(() => (draft ? captureToParsed(draft) : null), [draft])

  const range = useMemo(() => rangeForView(view, anchor), [view, anchor])

  useEffect(() => {
    api.events(range.from, range.to).then((data) => setEvents(data.events)).catch(() => setEvents([]))
  }, [range.from, range.to, refresh, tick])

  useEffect(() => {
    api.goals().then((data) => setGoals(data.goals)).catch(() => setGoals([]))
  }, [refresh, tick])

  useEffect(() => {
    if (!filtersOpen) return
    function onPointer(ev: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(ev.target as Node)) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [filtersOpen])

  const overlays = useMemo(() => {
    const items = []
    if (layers.events) items.push(...toOverlayEvents(events))
    if (layers.tasks) items.push(...toOverlayTasks(tasks ?? []))
    if (layers.goals) items.push(...toOverlayGoals(goals))
    return items
  }, [events, tasks, goals, layers])

  const todayTimedCount = useMemo(
    () => events.filter((event) => !event.allDay && todayKey(new Date(event.startsAt)) === today).length,
    [events, today],
  )

  const todayTotal = useMemo(
    () => events.filter((event) => todayKey(new Date(event.startsAt)) === today).length,
    [events, today],
  )

  const weekdayLong = useMemo(() => {
    const text = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric' }).format(new Date())
    return text.charAt(0).toUpperCase() + text.slice(1)
  }, [])

  async function saveEvent(input: EventInput, id?: number) {
    if (id) await api.updateEvent(id, input)
    else await api.createEvent(input)
    setTick((n) => n + 1)
  }

  async function addQuick() {
    if (!parsed || !parsed.title.trim() || savingQuick) return
    setSavingQuick(true)
    try {
      const { startsAt, endsAt } = parsedToStartsEnds(parsed)
      await api.createEvent({
        title: parsed.title,
        location: '',
        description: '',
        allDay: parsed.allDay,
        startsAt,
        endsAt,
        color: 'menta',
        remindMinutes: null,
        repeatRule: 'none',
        repeatWeekdays: [],
      })
      if (parsed.date !== anchor) setAnchor(parsed.date)
      setQuick('')
      setTick((n) => n + 1)
    } finally {
      setSavingQuick(false)
    }
  }

  function openEvent(id: number) {
    const event = events.find((item) => item.id === id)
    if (event) setSheet({ mode: 'edit', event })
  }

  function openTask(id: number) {
    const task = (tasks ?? []).find((item) => item.id === id)
    if (task) onOpenTask(task)
  }

  return (
    <Shell tabs>
      <div className="plan-head">
        <div className="plan-title-row">
          <span className="plan-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M4 10h16" />
            </svg>
          </span>
          <div>
            <h1 className="plan-title">Planificar</h1>
            <p className="plan-sub">
              {todayTimedCount === 0
                ? 'Hoy no tienes nada con hora en el calendario.'
                : todayTimedCount === 1
                  ? 'Hoy tienes 1 cosa con hora.'
                  : `Hoy tienes ${todayTimedCount} cosas con hora.`}
            </p>
          </div>
        </div>
        <button type="button" className="primary plan-cta" onClick={() => setSheet({ mode: 'create' })}>
          + Nuevo evento
        </button>
      </div>

      <div className="plan-status-card">
        <p className="kicker">Hoy · {weekdayLong.toLowerCase()}</p>
        <strong>{todayStatusLabel(todayTotal)}</strong>
      </div>

      <div className="plan-quick">
        <input
          value={quick}
          onChange={(ev) => setQuick(ev.target.value)}
          placeholder="+ Agregar evento… ej: Reunión mañana"
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault()
              void addQuick()
            }
          }}
        />
        <button type="button" className="primary compact" disabled={!parsed?.title || savingQuick} onClick={() => void addQuick()}>
          Agregar
        </button>
      </div>
      {parsed && quick.trim() && (
        <div className="plan-parse">
          <p className="plan-parse-preview">
            Se guardará: ‘{parsed.preview}’
            {drafting ? <span className="hint"> · Entendiendo…</span> : null}
          </p>
          <div className="plan-parse-chips">
            <span className="chip quiet">{dateChipLabel(parsed.date)}</span>
            {!parsed.allDay && <span className="chip quiet">{parsed.time}</span>}
            {!parsed.allDay && <span className="chip quiet">{formatDurationChip(parsed.durationMin)}</span>}
            {parsed.allDay && <span className="chip quiet">Todo el día</span>}
          </div>
        </div>
      )}

      <div className="plan-nav">
        <button type="button" className="pill quiet" onClick={() => setAnchor(today)}>Hoy</button>
        <div className="plan-nav-range">
          <button type="button" className="month-step" aria-label="Anterior" onClick={() => setAnchor((d) => shiftAnchor(view, d, -1))}>‹</button>
          <strong className="plan-nav-label">{navLabel(view, anchor)}</strong>
          <button type="button" className="month-step" aria-label="Siguiente" onClick={() => setAnchor((d) => shiftAnchor(view, d, 1))}>›</button>
        </div>
      </div>

      <div className="plan-switch-row">
        <div className="plan-switch">
          {([
            ['day', 'Día'],
            ['week', 'Semana'],
            ['month', 'Mes'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={view === key ? 'on' : ''}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="plan-filter-wrap" ref={filterRef}>
          <button
            type="button"
            className={filtersOpen ? 'plan-filter-btn on' : 'plan-filter-btn'}
            aria-label="Filtros del calendario"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span className="plan-filter-dots" aria-hidden="true">
              <i className="dot menta" />
              <i className="dot horizonte" />
              <i className="dot ciruela" />
              <i className="dot impulso" />
            </span>
          </button>
          {filtersOpen && (
            <div className="plan-filter-pop">
              <p className="plan-filter-title">Elige qué mostrar en el calendario.</p>
              {(
                [
                  ['events', 'Eventos', 'menta'],
                  ['tasks', 'Tareas', 'horizonte'],
                  ['goals', 'Objetivos', 'ciruela'],
                ] as const
              ).map(([key, label, tint]) => (
                <label key={key} className="plan-filter-row">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={(ev) => setLayers((current) => ({ ...current, [key]: ev.target.checked }))}
                  />
                  <span className={`plan-filter-tint color-${tint}`} />
                  {label}
                </label>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() => setLayers({ events: true, tasks: true, goals: true })}
              >
                Mostrar todo
              </button>
            </div>
          )}
        </div>
      </div>

      {view === 'day' && (
        <CalendarDayView items={overlays} anchor={anchor} onOpenEvent={openEvent} onOpenTask={openTask} />
      )}
      {view === 'week' && (
        <CalendarWeekView
          items={overlays}
          anchor={anchor}
          onOpenEvent={openEvent}
          onOpenTask={openTask}
          onSelectDay={(day) => {
            setAnchor(day)
            setView('day')
          }}
        />
      )}
      {view === 'month' && (
        <CalendarMonthView
          items={overlays}
          anchor={anchor}
          onOpenEvent={openEvent}
          onOpenTask={openTask}
          onSelectDay={(day) => {
            setAnchor(day)
            setView('day')
          }}
        />
      )}

      {sheet && (
        <EventSheet
          key={sheet.mode === 'edit' ? sheet.event.id : 'new'}
          event={sheet.mode === 'edit' ? sheet.event : null}
          defaultDay={anchor}
          onClose={() => setSheet(null)}
          onSave={saveEvent}
          onDelete={
            sheet.mode === 'edit'
              ? async () => {
                  await api.deleteEvent(sheet.event.id)
                  setTick((n) => n + 1)
                }
              : undefined
          }
        />
      )}
    </Shell>
  )
}
