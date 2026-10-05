export function soles(cents: number) {
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents) / 100
  const formatted = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs)
  return `${sign}S/ ${formatted}`
}

export function todayKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function displayName(email: string) {
  const local = email.split('@')[0] || 'ahí'
  const name = local.replace(/[._-]+/g, ' ').trim()
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'ahí'
}

export function weekChips(date = new Date()) {
  const monday = new Date(date)
  const delta = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - delta)
  const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
  return labels.map((label, index) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + index)
    return { label, day: day.getDate(), key: todayKey(day), today: todayKey(day) === todayKey(date) }
  })
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function longDate(date = new Date()) {
  const text = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function clock(iso: string | null) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function dayLabel(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  const value = new Date(year, month - 1, date)
  const text = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short' }).format(value)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function dateInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function timeInput(iso: string | null) {
  if (!iso) return '08:00'
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function combineLocal(date: string, time: string) {
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = (time || '08:00').split(':').map(Number)
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0).toISOString()
}

export function tomorrowMorning(from = new Date()) {
  const date = new Date(from)
  date.setDate(date.getDate() + 1)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

export function atLocalDate(day: string, fromIso: string | null) {
  const time = timeInput(fromIso)
  return combineLocal(day, fromIso ? time : '09:00')
}

const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function weekdayLabel(day: number) {
  return weekdayLabels[day - 1] || ''
}

export function repeatSummary(days: number[]) {
  if (days.length === 0) return ''
  if (days.length === 7) return 'Cada día'
  return days.map(weekdayLabel).join(' ')
}

export const sectionTitle: Record<string, string> = {
  today: 'Hoy',
  tomorrow: 'Mañana',
  upcoming: 'Próximo',
  someday: 'Algún día',
}
