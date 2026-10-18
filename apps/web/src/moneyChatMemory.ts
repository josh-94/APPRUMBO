import type { MoneyDraft } from './types'

export const MONEY_CHAT_CAP = 20

export type ChatUserBubble = { id: number; role: 'user'; text: string }
export type ChatDraftBubble = { id: number; role: 'draft'; draft: MoneyDraft; saved: boolean }
export type ChatActionBubble = { id: number; role: 'action'; text: string }
export type ChatBubble = ChatUserBubble | ChatDraftBubble | ChatActionBubble

type StoredUser = { id: number; role: 'user'; text: string }
type StoredDraft = { id: number; role: 'draft'; draft: MoneyDraft; saved: boolean }
type StoredAction = { id: number; role: 'action'; text: string }
type StoredBubble = StoredUser | StoredDraft | StoredAction

function storageKey(userKey: string) {
  const safe = (userKey || 'anon').trim().toLowerCase() || 'anon'
  return `rumbo.moneyChat.${safe}`
}

function isDraft(value: unknown): value is MoneyDraft {
  if (!value || typeof value !== 'object') return false
  const item = value as MoneyDraft
  return typeof item.kind === 'string' && typeof item.amountCents === 'number'
}

function parseBubble(raw: unknown): StoredBubble | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as StoredBubble
  if (typeof item.id !== 'number') return null
  if (item.role === 'user' && typeof item.text === 'string') {
    return { id: item.id, role: 'user', text: item.text.slice(0, 500) }
  }
  if (item.role === 'action' && typeof item.text === 'string') {
    return { id: item.id, role: 'action', text: item.text.slice(0, 200) }
  }
  if (item.role === 'draft' && isDraft(item.draft)) {
    return {
      id: item.id,
      role: 'draft',
      saved: Boolean(item.saved),
      draft: {
        kind: item.draft.kind === 'ingreso' ? 'ingreso' : 'gasto',
        amountCents: item.draft.amountCents || 0,
        categoryId: item.draft.categoryId || 0,
        category: String(item.draft.category || '').slice(0, 80),
        note: String(item.draft.note || '').slice(0, 80),
        day: String(item.draft.day || ''),
        confidence: item.draft.confidence === 'alta' ? 'alta' : 'baja',
        question: String(item.draft.question || '').slice(0, 160),
        transcript: item.draft.transcript ? String(item.draft.transcript).slice(0, 500) : undefined,
      },
    }
  }
  return null
}

export function loadMoneyChat(userKey: string): ChatBubble[] {
  try {
    const raw = localStorage.getItem(storageKey(userKey))
    if (!raw) return []
    const parsed = JSON.parse(raw) as { messages?: unknown[] }
    if (!Array.isArray(parsed.messages)) return []
    const out: ChatBubble[] = []
    for (const item of parsed.messages) {
      const bubble = parseBubble(item)
      if (bubble) out.push(bubble)
      if (out.length >= MONEY_CHAT_CAP) break
    }
    return out
  } catch {
    return []
  }
}

export function saveMoneyChat(userKey: string, messages: ChatBubble[]) {
  try {
    const trimmed = messages.slice(-MONEY_CHAT_CAP)
    const stored: StoredBubble[] = trimmed.map((item) => {
      if (item.role === 'user') return { id: item.id, role: 'user', text: item.text.slice(0, 500) }
      if (item.role === 'action') return { id: item.id, role: 'action', text: item.text.slice(0, 200) }
      return {
        id: item.id,
        role: 'draft',
        saved: item.saved,
        draft: {
          kind: item.draft.kind,
          amountCents: item.draft.amountCents,
          categoryId: item.draft.categoryId,
          category: item.draft.category,
          note: item.draft.note,
          day: item.draft.day,
          confidence: item.draft.confidence,
          question: item.draft.question,
        },
      }
    })
    localStorage.setItem(storageKey(userKey), JSON.stringify({ messages: stored }))
  } catch {
    /* quota / private mode */
  }
}

export function nextChatId(messages: ChatBubble[]) {
  let max = 0
  for (const item of messages) {
    if (item.id > max) max = item.id
  }
  return max + 1
}

export function trimChat(messages: ChatBubble[]) {
  return messages.length > MONEY_CHAT_CAP ? messages.slice(-MONEY_CHAT_CAP) : messages
}

/** Compact text for the draft model (max ~1.8 KB). */
export function memoryForDraft(messages: ChatBubble[]): string {
  const recent = messages.slice(-12)
  const lines: string[] = []
  const hintMap = new Map<string, string>()

  for (const item of recent) {
    if (item.role === 'user') {
      lines.push(`Usuario: ${item.text}`)
      continue
    }
    if (item.role === 'action') {
      lines.push(`Hecho: ${item.text}`)
      continue
    }
    const amount = item.draft.amountCents ? `${(item.draft.amountCents / 100).toFixed(2)}` : '?'
    const bits = [
      item.draft.kind,
      amount,
      item.draft.category || '',
      item.draft.note || '',
      item.saved ? 'anotado' : '',
    ].filter(Boolean)
    lines.push(`Borrador: ${bits.join(' · ')}`)
    if (item.saved && item.draft.note && item.draft.category) {
      const key = item.draft.note.trim().toLowerCase()
      if (key) hintMap.set(key, item.draft.category)
    }
  }

  const hints = [...hintMap.entries()]
    .slice(-6)
    .map(([note, category]) => `Si dice “${note}” suele ser categoría ${category}.`)

  const body = [...hints, ...lines].join('\n').trim()
  if (body.length <= 1800) return body
  return body.slice(body.length - 1800)
}

export function actionLabel(draft: MoneyDraft, formatAmount: (cents: number) => string) {
  const parts = [
    draft.amountCents ? formatAmount(draft.amountCents) : null,
    draft.category || null,
    draft.note || null,
  ].filter(Boolean)
  return parts.length ? `Anoté ${parts.join(' · ')}` : 'Anoté el movimiento'
}
