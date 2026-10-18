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

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6) // 06:00 – 21:00

type Common = {
  items: OverlayItem[]
  anchor: string
  onOpenEvent: (id: number) => void
  onOpenTask?: (id: number) => void
  onSelectDay?: (day: string) => void
}

export function CalendarDayView({ items, anchor, onOpenEvent, onOpenTask }: Common) {
  const dayItems = itemsOnDay(items, anchor)
  const allDay = dayItems.filter((item) => item.allDay)
  const timed = dayItems.filter((item) => !item.allDay && item.startsAt)
  const today = todayKey()

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
      <div className="cal-timeline">
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
            const top = ((startMin - 6 * 60) / 60) * 52
            const height = Math.max((dur / 60) * 52, 44)
            if (startMin < 6 * 60 || startMin >= 22 * 60) return null
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
                const top = ((startMin - 6 * 60) / 60) * 44
                const height = Math.max((dur / 60) * 44, 22)
                if (startMin < 6 * 60 || startMin >= 22 * 60) return null
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
