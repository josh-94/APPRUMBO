import { todayKey } from './format'

export type ParsedEventLine = {
  title: string
  date: string
  time: string
  durationMin: number
  allDay: boolean
  preview: string
  dateFromText: boolean
  timeFromText: boolean
}

const MONTHS: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setiembre: 9,
  septiembre: 9,
  sep: 9,
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
}

const MONTH_ALT =
  'enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|setiembre|septiembre|sep|set|octubre|oct|noviembre|nov|diciembre|dic'

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
}

function shiftDay(base: Date, delta: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + delta)
  return todayKey(d)
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function nextWeekday(from: Date, target: number) {
  const d = new Date(from)
  const current = d.getDay()
  let delta = (target - current + 7) % 7
  if (delta === 0) delta = 7
  d.setDate(d.getDate() + delta)
  return todayKey(d)
}

function parseAbsoluteDate(text: string, now: Date): { date: string; rest: string } | null {
  const namedRe = new RegExp(
    String.raw`\b(?:el\s+)?(\d{1,2})\s*(?:de\s+)?(${MONTH_ALT})\.?(?:\s+(?:de\s+)?(\d{4}))?\b`,
    'i',
  )
  const named = text.match(namedRe)
  if (named) {
    const day = Number(named[1])
    const month = MONTHS[named[2].toLowerCase().replace(/\.$/, '')]
    const year = named[3] ? Number(named[3]) : now.getFullYear()
    if (month && day >= 1 && day <= 31) {
      let date = ymd(year, month, day)
      // If the date already passed this year and no year was given, roll to next year.
      if (!named[3]) {
        const candidate = new Date(year, month - 1, day)
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        if (candidate < start) {
          date = ymd(year + 1, month, day)
        }
      }
      return { date, rest: text.replace(named[0], ' ').replace(/\s{2,}/g, ' ').trim() }
    }
  }
  const slash = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/)
  if (slash) {
    const day = Number(slash[1])
    const month = Number(slash[2])
    let year = slash[3] ? Number(slash[3]) : now.getFullYear()
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let date = ymd(year, month, day)
      if (!slash[3]) {
        const candidate = new Date(year, month - 1, day)
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        if (candidate < start) date = ymd(year + 1, month, day)
      }
      return { date, rest: text.replace(slash[0], ' ').replace(/\s{2,}/g, ' ').trim() }
    }
  }
  return null
}

function extractTime(text: string): { time: string; rest: string } | null {
  // Prefer explicit "a las …" so day numbers are not mistaken for hours.
  const aLas = text.match(/\ba\s+las?\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?\b/i)
  if (aLas) {
    const formatted = formatHour(aLas[1], aLas[2], aLas[3])
    if (formatted) {
      return { time: formatted, rest: text.replace(aLas[0], ' ').replace(/\s{2,}/g, ' ').trim() }
    }
  }
  const clock = text.match(/\b(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?\b/i)
  if (clock) {
    const formatted = formatHour(clock[1], clock[2], clock[3])
    if (formatted) {
      return { time: formatted, rest: text.replace(clock[0], ' ').replace(/\s{2,}/g, ' ').trim() }
    }
  }
  const meridiem = text.match(/\b(\d{1,2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/i)
  if (meridiem) {
    const formatted = formatHour(meridiem[1], undefined, meridiem[2])
    if (formatted) {
      return { time: formatted, rest: text.replace(meridiem[0], ' ').replace(/\s{2,}/g, ' ').trim() }
    }
  }
  return null
}

function formatHour(hourRaw: string, minuteRaw?: string, meridiemRaw?: string) {
  let hour = Number(hourRaw)
  const minute = minuteRaw ? Number(minuteRaw) : 0
  const meridiem = meridiemRaw?.toLowerCase().replace(/\./g, '').replace(/\s/g, '')
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
  return ''
}

export function parseEventLine(raw: string, now = new Date()): ParsedEventLine {
  let text = raw.trim()
  let date = todayKey(now)
  let time = ''
  let durationMin = 60
  let allDay = false
  let dateFromText = false
  let timeFromText = false

  const absolute = parseAbsoluteDate(text, now)
  if (absolute) {
    date = absolute.date
    text = absolute.rest
    dateFromText = true
  } else {
    const lower = text.toLowerCase()
    if (/\bpasado mañana\b/.test(lower)) {
      date = shiftDay(now, 2)
      text = text.replace(/\bpasado mañana\b/gi, '').trim()
      dateFromText = true
    } else if (/\bmañana\b/.test(lower)) {
      date = shiftDay(now, 1)
      text = text.replace(/\bmañana\b/gi, '').trim()
      dateFromText = true
    } else if (/\bhoy\b/.test(lower)) {
      date = todayKey(now)
      text = text.replace(/\bhoy\b/gi, '').trim()
      dateFromText = true
    } else {
      const weekday = text.match(/\b(?:el\s+)?(domingo|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado)\b/i)
      if (weekday) {
        const target = WEEKDAYS[weekday[1].toLowerCase()]
        if (target !== undefined) {
          date = nextWeekday(now, target)
          text = text.replace(weekday[0], ' ').replace(/\s{2,}/g, ' ').trim()
          dateFromText = true
        }
      }
    }
  }

  if (/\bpor la mañana\b/.test(text.toLowerCase())) {
    time = '09:00'
    text = text.replace(/\bpor la mañana\b/gi, '').trim()
    timeFromText = true
  } else if (/\bpor la tarde\b/.test(text.toLowerCase())) {
    time = '18:00'
    text = text.replace(/\bpor la tarde\b/gi, '').trim()
    timeFromText = true
  } else if (/\bpor la noche\b/.test(text.toLowerCase())) {
    time = '20:00'
    text = text.replace(/\bpor la noche\b/gi, '').trim()
    timeFromText = true
  }

  const durationMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hora|horas|min|mins|minuto|minutos)\b/i)
  if (durationMatch) {
    const amount = Number(durationMatch[1].replace(',', '.'))
    const unit = durationMatch[2].toLowerCase()
    if (unit.startsWith('h')) durationMin = Math.round(amount * 60)
    else durationMin = Math.round(amount)
    if (durationMin < 5) durationMin = 5
    if (durationMin > 24 * 60) durationMin = 24 * 60
    text = text.replace(durationMatch[0], '').trim()
  }

  const extracted = extractTime(text)
  if (extracted) {
    time = extracted.time
    text = extracted.rest
    timeFromText = true
  }

  if (/\btodo el día\b/i.test(text)) {
    allDay = true
    time = ''
    text = text.replace(/\btodo el día\b/gi, '').trim()
    timeFromText = true
  }

  text = text.replace(/^[+·\-\s]+/, '').replace(/\s{2,}/g, ' ').trim()
  const title = text || raw.trim().replace(/^[+·\-\s]+/, '').trim()
  const preview = title || 'Evento'

  return {
    title: title || 'Evento',
    date,
    time: allDay ? '' : time || '09:00',
    durationMin: allDay ? 24 * 60 : durationMin,
    allDay,
    preview,
    dateFromText,
    timeFromText,
  }
}

export function parsedToStartsEnds(parsed: ParsedEventLine): { startsAt: string; endsAt: string } {
  const [year, month, day] = parsed.date.split('-').map(Number)
  if (parsed.allDay) {
    const starts = new Date(year, month - 1, day, 0, 0, 0, 0)
    const ends = new Date(year, month - 1, day + 1, 0, 0, 0, 0)
    return { startsAt: starts.toISOString(), endsAt: ends.toISOString() }
  }
  const [hour, minute] = (parsed.time || '09:00').split(':').map(Number)
  const starts = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0)
  const ends = new Date(starts.getTime() + parsed.durationMin * 60_000)
  return { startsAt: starts.toISOString(), endsAt: ends.toISOString() }
}

export function formatDurationChip(minutes: number) {
  if (minutes % 60 === 0) {
    const h = minutes / 60
    return h === 1 ? '1 h' : `${h} h`
  }
  if (minutes > 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h} h ${m} min`
  }
  return `${minutes} min`
}

export function dateChipLabel(day: string, now = new Date()) {
  const today = todayKey(now)
  const tomorrow = shiftDay(now, 1)
  if (day === today) return 'Hoy'
  if (day === tomorrow) return 'Mañana'
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d))
}

export type LocalCapture = {
  kind: 'evento' | 'tarea' | 'recordatorio' | 'gasto'
  title: string
  day: string
  time: string
  durationMin: number
  allDay: boolean
  remind: boolean
  amountCents: number
  currency: 'pen'
  categoryId: number
  category: string
  confidence: 'baja'
  question: string
  dateFromText: boolean
  timeFromText: boolean
}

/** Map local parse into the shape used by capture draft UI. */
export function localCaptureFromLine(
  raw: string,
  intent: 'evento' | 'tarea' | 'recordatorio' | 'gasto' | 'auto' = 'evento',
  now = new Date(),
): LocalCapture {
  const parsed = parseEventLine(raw, now)
  const kind: 'evento' | 'tarea' | 'recordatorio' | 'gasto' = intent === 'auto' ? 'evento' : intent
  const remind = kind === 'recordatorio' || (kind === 'tarea' && parsed.timeFromText)
  let amountCents = 0
  if (kind === 'gasto') {
    const money = raw.match(/(?:s\s*\/\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:soles?)?/i)
    if (money) {
      const [whole, frac = ''] = money[1].replace(',', '.').split('.')
      amountCents = Number(whole) * 100 + Number((frac + '00').slice(0, 2))
    }
  }
  return {
    kind,
    title: parsed.title,
    day: parsed.date,
    time: kind === 'gasto' ? '' : parsed.allDay ? '' : parsed.time,
    durationMin: kind === 'evento' ? parsed.durationMin : 0,
    allDay: kind === 'evento' ? parsed.allDay : false,
    remind: kind === 'recordatorio' ? true : remind,
    amountCents,
    currency: 'pen',
    categoryId: 0,
    category: '',
    confidence: 'baja',
    question: '',
    dateFromText: parsed.dateFromText,
    timeFromText: parsed.timeFromText || parsed.allDay,
  }
}

const TITLE_LEFTOVER =
  /\b(hoy|mañana|ayer|pasado\s+mañana|a\s+las?|\d{1,2}:\d{2}|\d{1,2}\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)|por\s+la\s+(mañana|tarde|noche)|todo\s+el\s+día)\b/i

/** True when local rules are enough — skip Ollama for speed. */
export function isClearCapture(
  raw: string,
  local: LocalCapture,
  intent: 'evento' | 'tarea' | 'recordatorio' | 'gasto' | 'auto',
): boolean {
  if (intent === 'gasto') return false
  const title = local.title.trim()
  if (title.length < 2) return false
  if (TITLE_LEFTOVER.test(title)) return false
  const monthLeft = new RegExp(String.raw`\b(?:el\s+)?\d{1,2}\s*(?:de\s+)?(?:${MONTH_ALT})\.?\b`, 'i')
  if (monthLeft.test(title)) return false
  if (title.toLowerCase() === raw.trim().toLowerCase() && (local.dateFromText || local.timeFromText)) {
    return false
  }
  if (intent === 'evento' || (intent === 'auto' && local.kind === 'evento')) {
    return local.dateFromText && (local.timeFromText || local.allDay)
  }
  // tarea / recordatorio: título limpio basta; fecha/hora opcionales (defaults locales)
  return true
}
