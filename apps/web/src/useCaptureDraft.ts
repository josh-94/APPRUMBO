import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { mergeCaptureDraft } from './enrichGasto'
import { isClearCapture, localCaptureFromLine } from './parseEventLine'
import type { CaptureDraft, MonthMoney } from './types'

type Intent = 'evento' | 'tarea' | 'recordatorio' | 'gasto' | 'auto'

function toDraft(local: ReturnType<typeof localCaptureFromLine>): CaptureDraft {
  return {
    kind: local.kind,
    title: local.title,
    day: local.day,
    time: local.time,
    durationMin: local.durationMin,
    allDay: local.allDay,
    remind: local.remind,
    amountCents: local.amountCents,
    currency: local.currency,
    categoryId: local.categoryId,
    category: local.category,
    accountId: 0,
    debtId: 0,
    sourceName: '',
    confidence: local.confidence,
    question: local.question,
  }
}

export function useCaptureDraft(text: string, intent: Intent, money?: MonthMoney | null) {
  const local = useMemo(() => (text.trim() ? localCaptureFromLine(text, intent) : null), [text, intent])
  const clear = useMemo(
    () => (local && text.trim() ? isClearCapture(text, local, intent) : false),
    [local, text, intent],
  )
  const [model, setModel] = useState<CaptureDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [fromModel, setFromModel] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const trimmed = text.trim()
    if (!trimmed || !local) {
      setModel(null)
      setFromModel(false)
      setLoading(false)
      return
    }
    if (clear) {
      seq.current += 1
      setModel(null)
      setFromModel(false)
      setLoading(false)
      return
    }
    const id = ++seq.current
    setModel(null)
    setFromModel(false)
    setLoading(true)
    const timer = window.setTimeout(() => {
      void api
        .draftCapture({ text: trimmed, intent })
        .then((draft) => {
          if (id !== seq.current) return
          setModel(draft)
          setFromModel(true)
        })
        .catch(() => {
          if (id !== seq.current) return
          setModel(null)
          setFromModel(false)
        })
        .finally(() => {
          if (id === seq.current) setLoading(false)
        })
    }, 500)
    return () => {
      window.clearTimeout(timer)
    }
  }, [text, intent, local, clear])

  const draft = useMemo(() => {
    if (!text.trim()) return null
    const baseLocal = local ? toDraft(local) : null
    if (intent === 'gasto') {
      return mergeCaptureDraft(model, baseLocal, text.trim(), money)
    }
    return model ?? baseLocal
  }, [model, local, text, intent, money])

  return { draft, loading, fromModel, local, clear }
}

export function captureToParsed(draft: CaptureDraft) {
  return {
    title: draft.title,
    date: draft.day,
    time: draft.allDay ? '' : draft.time || '09:00',
    durationMin: draft.allDay ? 24 * 60 : draft.durationMin || 60,
    allDay: draft.allDay,
    preview: draft.title,
    dateFromText: true,
    timeFromText: Boolean(draft.time) || draft.allDay,
  }
}
