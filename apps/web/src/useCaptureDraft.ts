import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { localCaptureFromLine } from './parseEventLine'
import type { CaptureDraft } from './types'

type Intent = 'evento' | 'tarea' | 'recordatorio' | 'gasto' | 'auto'

export function useCaptureDraft(text: string, intent: Intent) {
  const local = useMemo(() => (text.trim() ? localCaptureFromLine(text, intent) : null), [text, intent])
  const [model, setModel] = useState<CaptureDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [fromModel, setFromModel] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const trimmed = text.trim()
    if (!trimmed) {
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
    }, 400)
    return () => {
      window.clearTimeout(timer)
    }
  }, [text, intent])

  const draft: CaptureDraft | null = model ?? (local
    ? {
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
        confidence: local.confidence,
        question: local.question,
      }
    : null)

  return { draft, loading, fromModel, local }
}

export function captureToParsed(draft: CaptureDraft) {
  return {
    title: draft.title,
    date: draft.day,
    time: draft.allDay ? '' : draft.time || '09:00',
    durationMin: draft.allDay ? 24 * 60 : draft.durationMin || 60,
    allDay: draft.allDay,
    preview: draft.title,
  }
}
