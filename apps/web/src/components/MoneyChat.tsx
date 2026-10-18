import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '../api'
import { shrinkImage } from '../image'
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
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
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
      const recorder = recorderRef.current
      if (recorder && recorder.state === 'recording') recorder.stop()
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

  async function send(input: { text?: string; audio?: Blob; image?: Blob }) {
    if (!navigator.onLine) {
      onOffline()
      return
    }
    const imageUrl = input.image ? URL.createObjectURL(input.image) : undefined
    const label = input.text?.trim() || (input.audio ? 'Voz' : 'Foto')
    const id = nextId()
    const previous = previousDraft()
    const memory = memoryForDraft(messages)
    setMessages((items) => trimChat([...items, { id, role: 'user', text: label, imageUrl }]))
    setText('')
    setBusy(true)
    setError('')
    try {
      const draft = await api.draftMoney({
        text: input.text?.trim(),
        audio: input.audio,
        image: input.image,
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
    if (!value || busy || recording) return
    void send({ text: value })
  }

  async function toggleMic() {
    if (busy) return
    const current = recorderRef.current
    if (current && current.state === 'recording') {
      current.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no puede dictar.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = recorderMime()
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        if (!alive.current) return
        setRecording(false)
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size) void send({ audio: blob, text: text.trim() || undefined })
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setError('')
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 30000)
    } catch {
      setError('No pude usar el micrófono.')
    }
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    try {
      const image = await shrinkImage(file)
      const caption = text.trim()
      void send({ image, text: caption || undefined })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Esa foto no se pudo leer. Prueba con otra.')
    }
  }

  async function confirm(id: number, draft: MoneyDraft) {
    const accountId = money.accounts[0]?.id
    if (!accountId || !draft.amountCents || !draft.categoryId) return
    setSaving(id)
    setError('')
    try {
      await api.createMovement({
        kind: draft.kind,
        currency: 'pen',
        amountCents: draft.amountCents,
        accountId,
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
            <p className="hint">Escribe, dicta o manda una foto. Lo anotas cuando la tarjeta esté lista.</p>
          )}
          {messages.map((item) => {
            if (item.role === 'user') {
              return (
                <div key={item.id} className="chat-user">
                  {item.imageUrl && <img src={item.imageUrl} alt="" />}
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
                <p>{item.draft.category || 'Sin categoría'}{item.draft.note ? ` · ${item.draft.note}` : ''}</p>
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
            disabled={busy || recording}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="button" className="chat-tool" aria-label="Foto" disabled={busy || recording} onClick={() => fileRef.current?.click()}>
            <CameraIcon />
          </button>
          <button type="button" className={recording ? 'chat-tool on' : 'chat-tool'} aria-label={recording ? 'Detener' : 'Dictar'} aria-pressed={recording} disabled={busy} onClick={() => void toggleMic()}>
            <MicIcon />
          </button>
          <button type="submit" className="chat-tool send" aria-label="Enviar" disabled={busy || recording || !text.trim()}>
            <SendIcon />
          </button>
          <input ref={fileRef} className="chat-file" type="file" accept="image/*" onChange={(event) => void onPhoto(event)} />
        </form>
      </div>
    </div>
  )
}

function recorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  if (MediaRecorder.isTypeSupported('audio/ogg')) return 'audio/ogg'
  return ''
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

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M4 8h3l2-2h6l2 2h3v11H4V8Z" />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
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
