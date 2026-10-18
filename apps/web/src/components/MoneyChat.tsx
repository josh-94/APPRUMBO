import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import {
  actionLabel,
  loadMoneyChat,
  memoryForDraft,
  nextChatId,
  saveMoneyChat,
  trimChat,
  type ChatBubble,
} from '../moneyChatMemory'
import { soles, todayKey } from '../format'
import type { MoneyDraft, MonthMoney } from '../types'

export function MoneyChat({ money, userKey = '', onClose, onSaved, onOffline }: {
  money: MonthMoney
  userKey?: string
  onClose: () => void
  onSaved: () => void
  onOffline: () => void
}) {
  const [messages, setMessages] = useState<ChatBubble[]>(() => loadMoneyChat(userKey))
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  const offlineRef = useRef(onOffline)
  const ids = useRef(nextChatId(loadMoneyChat(userKey)))
  const persistTimer = useRef(0)
  offlineRef.current = onOffline

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, busy, error])

  useEffect(() => {
    window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      saveMoneyChat(userKey, messages)
    }, 200)
    return () => window.clearTimeout(persistTimer.current)
  }, [messages, userKey])

  useEffect(() => {
    alive.current = true
    function down() {
      offlineRef.current()
    }
    window.addEventListener('offline', down)
    return () => {
      alive.current = false
      window.removeEventListener('offline', down)
    }
  }, [])

  function nextId() {
    const id = ids.current
    ids.current += 1
    return id
  }

  function previousDraft() {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const item = messages[i]
      if (item.role === 'draft' && !item.saved) return item.draft
    }
    return undefined
  }

  async function send(value: string) {
    if (!navigator.onLine) {
      onOffline()
      return
    }
    const label = value.trim()
    if (!label) return
    const id = nextId()
    const previous = previousDraft()
    const memory = memoryForDraft(messages)
    setMessages((items) => trimChat([...items, { id, role: 'user', text: label }]))
    setText('')
    setBusy(true)
    setError('')
    try {
      const draft = await api.draftMoney({
        text: label,
        previous,
        memory: memory || undefined,
      })
      if (!alive.current) return
      const draftId = nextId()
      setMessages((items) => trimChat([
        ...items.map((item) => (item.id === id && item.role === 'user' ? { ...item, text: draft.transcript || item.text } : item)),
        { id: draftId, role: 'draft', draft, saved: false },
      ]))
    } catch (err) {
      if (!alive.current) return
      if (!navigator.onLine || err instanceof TypeError) {
        onOffline()
        return
      }
      setError(err instanceof Error ? err.message : 'No pude leer eso')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    void send(value)
  }

  async function confirm(id: number, draft: MoneyDraft) {
    const debtId = draft.debtId || 0
    const accountId = debtId ? 0 : (draft.accountId || money.accounts[0]?.id || 0)
    if ((!accountId && !debtId) || !draft.amountCents || !draft.categoryId) return
    setSaving(id)
    setError('')
    try {
      await api.createMovement({
        kind: draft.kind,
        currency: 'pen',
        amountCents: draft.amountCents,
        accountId,
        debtId,
        categoryId: draft.categoryId,
        day: draft.day,
        note: draft.note,
      })
      const actionId = nextId()
      const label = actionLabel(draft, soles)
      setMessages((items) => trimChat([
        ...items.map((item) => (item.id === id && item.role === 'draft' ? { ...item, saved: true } : item)),
        { id: actionId, role: 'action', text: label },
      ]))
      onSaved()
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        onOffline()
        return
      }
      setError(err instanceof Error ? err.message : 'No se pudo anotar')
    } finally {
      setSaving(0)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet chat-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-top">
          <h2>Contar un gasto</h2>
          <button type="button" className="sheet-close" aria-label="Cerrar" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="chat-log" ref={logRef}>
          {messages.length === 0 && (
            <p className="hint">Escribe el gasto. Lo anotas cuando la tarjeta esté lista.</p>
          )}
          {messages.map((item) => {
            if (item.role === 'user') {
              return (
                <div key={item.id} className="chat-user">
                  <p>{item.text}</p>
                </div>
              )
            }
            if (item.role === 'action') {
              return (
                <div key={item.id} className="chat-action">
                  <p>{item.text}</p>
                </div>
              )
            }
            const ready = item.draft.amountCents > 0 && item.draft.categoryId > 0
            return (
              <div key={item.id} className="chat-draft">
                <p className="kicker">{item.draft.kind === 'ingreso' ? 'Ingreso' : 'Gasto'}</p>
                <strong>{item.draft.amountCents ? soles(item.draft.amountCents) : 'Sin monto'}</strong>
                <p>
                  {item.draft.category || 'Sin categoría'}
                  {item.draft.sourceName ? ` · ${item.draft.sourceName}` : ''}
                  {item.draft.note ? ` · ${item.draft.note}` : ''}
                </p>
                <p className="meta">{draftDay(item.draft.day)}</p>
                {item.draft.question && <p className="hint">{item.draft.question}</p>}
                {item.saved && <p className="ok">Anotado</p>}
                {!item.saved && ready && (
                  <button type="button" className="primary" disabled={saving === item.id} onClick={() => void confirm(item.id, item.draft)}>
                    {saving === item.id ? 'Anotando…' : 'Anotar'}
                  </button>
                )}
              </div>
            )
          })}
          {busy && (
            <p className="chat-reading" role="status">
              Leyendo
              <span className="chat-dots" aria-hidden="true"><i /><i /><i /></span>
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        <form className="chat-compose" onSubmit={submit}>
          <input
            className="chat-text"
            value={text}
            maxLength={2000}
            placeholder="Almuerzo 18.50"
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="chat-tool send" aria-label="Enviar" disabled={busy || !text.trim()}>
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  )
}

function draftDay(day: string) {
  if (day === todayKey()) return 'Hoy'
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(year, month - 1, date))
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
