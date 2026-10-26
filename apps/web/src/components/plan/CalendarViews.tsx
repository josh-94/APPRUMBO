import { useEffect, useRef, useState } from 'react'
import type { OverlayItem } from './calendarUtils'
import {
  durationMinutes,
  hourLabel,
  itemsOnDay,
  minutesFromMidnight,
  monthGrid,
  parseDay,
  startOfMonth,
  weekDays,
} from './calendarUtils'
import { todayKey } from '../../format'

const DAY_START_HOUR = 0
const DAY_END_HOUR = 24 // exclusivo: filas 00:00 – 23:00
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => i + DAY_START_HOUR)
const DAY_ROW_PX = 52
const WEEK_ROW_PX = 44

type Common = {
  items: OverlayItem[]
  anchor: string
  onOpenEvent: (id: number) => void
  onOpenTask?: (id: number) => void
  onSelectDay?: (day: string) => void
}

function nowMinutesFromMidnight() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

function useNowMinutes(active: boolean) {
  const [minutes, setMinutes] = useState(nowMinutesFromMidnight)
  useEffect(() => {
    if (!active) return
    setMinutes(nowMinutesFromMidnight())
    const id = window.setInterval(() => setMinutes(nowMinutesFromMidnight()), 30_000)
    return () => window.clearInterval(id)
  }, [active])
  return minutes
}

function nowTopPx(minutes: number, rowPx: number) {
  return ((minutes - DAY_START_HOUR * 60) / 60) * rowPx
}

export function CalendarDayView({ items, anchor, onOpenEvent, onOpenTask }: Common) {
  const dayItems = itemsOnDay(items, anchor)
  const allDay = dayItems.filter((item) => item.allDay)
  const timed = dayItems.filter((item) => !item.allDay && item.startsAt)
  const today = todayKey()
  const isToday = anchor === today
  const nowMin = useNowMinutes(isToday)
  const timelineRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)

  useEffect(() => {
    scrolled.current = false
  }, [anchor])

  useEffect(() => {
    if (!isToday || scrolled.current) return
    const el = timelineRef.current
    if (!el) return
    scrolled.current = true
    const top = nowTopPx(nowMin, DAY_ROW_PX)
    const rect = el.getBoundingClientRect()
    const target = window.scrollY + rect.top + top - window.innerHeight * 0.35
    window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [isToday, nowMin, timed.length])

  return (
    <div className="cal-day">
      {allDay.length > 0 && (
        <div className="cal-allday">
          <span className="cal-allday-label">Todo el día</span>
          <div className="cal-allday-items">
            {allDay.map((item) => (
              <OverlayChip key={item.key} item={item} onOpenEvent={onOpenEvent} onOpenTask={onOpenTask} />
            ))}
          </div>
        </div>
      )}
      <div className="cal-timeline" ref={timelineRef}>
        {HOURS.map((hour) => (
          <div key={hour} className="cal-hour-row">
            <span className="cal-hour-label">{hourLabel(hour)}</span>
            <div className="cal-hour-lane" />
          </div>
        ))}
        <div className="cal-timed-layer">
          {timed.map((item) => {
            const startMin = minutesFromMidnight(item.startsAt!)
            const dur = item.endsAt ? durationMinutes(item.startsAt!, item.endsAt) : 60
            if (startMin < DAY_START_HOUR * 60 || startMin >= DAY_END_HOUR * 60) return null
            const top = ((startMin - DAY_START_HOUR * 60) / 60) * DAY_ROW_PX
            const height = Math.max((dur / 60) * DAY_ROW_PX, 44)
            const endLabel = item.endsAt
              ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.endsAt))
              : ''
            return (
              <button
                key={item.key}
                type="button"
                className={`cal-block color-${item.color}`}
                style={{ top, height }}
                onClick={() => {
                  if (item.kind === 'event') onOpenEvent(item.id)
                  else if (item.kind === 'task') onOpenTask?.(item.id)
                }}
              >
                <strong className="cal-block-title">{item.title}</strong>
                {item.hour && (
                  <span className="cal-block-time">
                    {item.hour}{endLabel ? ` – ${endLabel}` : ''}
                  </span>
                )}
              </button>
            )
          })}
          {isToday && (
            <div
              className="cal-now"
              style={{ top: nowTopPx(nowMin, DAY_ROW_PX) }}
              aria-hidden="true"
            >
              <span className="cal-now-dot" />
              <span className="cal-now-line" />
            </div>
          )}
        </div>
      </div>
      {dayItems.length === 0 && (
        <p className="empty">{anchor === today ? 'Hoy no tienes nada con hora en el calendario.' : 'Nada en este día.'}</p>
      )}
    </div>
  )
}

export function CalendarWeekView({ items, anchor, onOpenEvent, onOpenTask, onSelectDay }: Common) {
  const days = weekDays(anchor)
  const today = todayKey()
  const showNow = days.includes(today)
  const nowMin = useNowMinutes(showNow)

  return (
    <div className="cal-week">
      <div className="cal-week-head">
        <span className="cal-week-gutter" />
        {days.map((day) => {
          const d = parseDay(day)
          const label = new Intl.DateTimeFormat('es', { weekday: 'short' }).format(d).replace('.', '')
          return (
            <button
              key={day}
              type="button"
              className={day === today ? 'cal-week-day today' : 'cal-week-day'}
              onClick={() => onSelectDay?.(day)}
            >
              <span>{label.toUpperCase().slice(0, 3)}</span>
              <strong>{d.getDate()}</strong>
            </button>
          )
        })}
      </div>
      <div className="cal-week-allday">
        <span className="cal-allday-label">Todo el día</span>
        {days.map((day) => (
          <div key={day} className="cal-week-allday-cell">
            {itemsOnDay(items, day)
              .filter((item) => item.allDay)
              .map((item) => (
                <OverlayChip key={item.key} item={item} compact onOpenEvent={onOpenEvent} onOpenTask={onOpenTask} />
              ))}
          </div>
        ))}
      </div>
      <div className="cal-week-body">
        <div className="cal-week-hours">
          {HOURS.map((hour) => (
            <div key={hour} className="cal-hour-row">
              <span className="cal-hour-label">{hourLabel(hour)}</span>
            </div>
          ))}
        </div>
        {days.map((day) => (
          <div key={day} className="cal-week-col">
            {HOURS.map((hour) => (
              <div key={hour} className="cal-hour-lane" />
            ))}
            {itemsOnDay(items, day)
              .filter((item) => !item.allDay && item.startsAt)
              .map((item) => {
                const startMin = minutesFromMidnight(item.startsAt!)
                const dur = item.endsAt ? durationMinutes(item.startsAt!, item.endsAt) : 60
                if (startMin < DAY_START_HOUR * 60 || startMin >= DAY_END_HOUR * 60) return null
                const top = ((startMin - DAY_START_HOUR * 60) / 60) * WEEK_ROW_PX
                const height = Math.max((dur / 60) * WEEK_ROW_PX, 22)
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`cal-block compact color-${item.color}`}
                    style={{ top, height }}
                    onClick={() => {
                      if (item.kind === 'event') onOpenEvent(item.id)
                      else if (item.kind === 'task') onOpenTask?.(item.id)
                    }}
                  >
                    <strong className="cal-block-title">{item.title}</strong>
                  </button>
                )
              })}
          </div>
        ))}
        {showNow && (
          <div
            className="cal-now cal-now-week"
            style={{ top: nowTopPx(nowMin, WEEK_ROW_PX) }}
            aria-hidden="true"
          >
            <span className="cal-now-dot" />
            <span className="cal-now-line" />
          </div>
        )}
      </div>
    </div>
  )
}

export function CalendarMonthView({ items, anchor, onOpenEvent, onOpenTask, onSelectDay }: Common) {
  const cells = monthGrid(anchor)
  const month = startOfMonth(anchor).slice(0, 7)
  const today = todayKey()
  const labels = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

  return (
    <div className="cal-month">
      <div className="cal-month-labels">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="cal-month-grid">
        {cells.map((day) => {
          const inMonth = day.startsWith(month)
          const dayItems = itemsOnDay(items, day).slice(0, 3)
          return (
            <button
              key={day}
              type="button"
              className={[
                'cal-month-cell',
                inMonth ? '' : 'muted',
                day === today ? 'today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectDay?.(day)}
            >
              <span className="cal-month-num">{parseDay(day).getDate()}</span>
              <div className="cal-month-pills">
                {dayItems.map((item) => (
                  <span
                    key={item.key}
                    className={`cal-month-pill color-${item.color}`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      if (item.kind === 'event') onOpenEvent(item.id)
                      else if (item.kind === 'task') onOpenTask?.(item.id)
                    }}
                  >
                    {item.title}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OverlayChip({
  item,
  compact,
  onOpenEvent,
  onOpenTask,
}: {
  item: OverlayItem
  compact?: boolean
  onOpenEvent: (id: number) => void
  onOpenTask?: (id: number) => void
}) {
  return (
    <button
      type="button"
      className={compact ? `cal-chip compact color-${item.color}` : `cal-chip color-${item.color}`}
      onClick={() => {
        if (item.kind === 'event') onOpenEvent(item.id)
        else if (item.kind === 'task') onOpenTask?.(item.id)
      }}
    >
      {item.title}
    </button>
  )
}
