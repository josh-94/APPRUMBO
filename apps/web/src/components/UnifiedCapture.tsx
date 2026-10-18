import { useMemo, useState, type FormEvent } from 'react'
import type { MoneyCategory, MonthMoney, Movement, MovementInput, TaskInput, TaskList } from '../types'
import { combineLocal, currencySymbol, todayKey } from '../format'
import { dateChipLabel } from '../parseEventLine'
import { useCaptureDraft } from '../useCaptureDraft'
import { MoneySheet } from './CaptureSheets'

type Kind = 'tarea' | 'recordatorio' | 'gasto'

function formatMoneyChip(cents: number, currency: string) {
  if (!cents) return ''
  const symbol = currencySymbol(currency === 'usd' ? 'USD' : 'PEN')
  return `${symbol} ${(cents / 100).toFixed(2)}`
}

export function UnifiedCapture({
  lists,
  money,
  defaultListId,
  onClose,
  onSaveTask,
  onSaveMoney,
  onCreateCategory,
}: {
  lists: TaskList[]
  money: MonthMoney | null
  defaultListId?: number
  onClose: () => void
  onSaveTask: (input: TaskInput) => Promise<void>
  onSaveMoney: (input: MovementInput) => Promise<void>
  onCreateCategory: (name: string, kind: 'gasto' | 'ingreso') => Promise<MoneyCategory>
}) {
  const [kind, setKind] = useState<Kind>('tarea')
  const [line, setLine] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [moneyPrefill, setMoneyPrefill] = useState<Movement | null>(null)
  const { draft, loading: drafting } = useCaptureDraft(line, kind, money)

  const previewTitle = draft?.title || ''
  const moneyReady = useMemo(() => {
    if (!draft || draft.kind !== 'gasto') return false
    const hasSource = Boolean(draft.debtId || draft.accountId)
    return draft.confidence === 'alta' && draft.amountCents > 0 && draft.categoryId > 0 && hasSource
  }, [draft])

  if (moneyPrefill && money) {
    return (
      <MoneySheet
        money={money}
        movement={moneyPrefill}
        onClose={onClose}
        onSave={onSaveMoney}
        onCreateCategory={onCreateCategory}
      />
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft || !previewTitle.trim()) {
      setError('Escribe qué quieres anotar.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (kind === 'gasto') {
        if (!money) {
          setError('Cargando finanzas…')
          return
        }
        if (moneyReady) {
          await onSaveMoney({
            kind: 'gasto',
            currency: draft.currency === 'usd' ? 'usd' : 'pen',
            amountCents: draft.amountCents,
            accountId: draft.debtId ? undefined : (draft.accountId || money.accounts[0]?.id),
            debtId: draft.debtId || undefined,
            categoryId: draft.categoryId,
            day: draft.day || todayKey(),
            note: draft.title,
          })
          onClose()
          return
        }
        setMoneyPrefill({
          id: 0,
          accountId: draft.accountId || money.accounts[0]?.id || 0,
          debtId: draft.debtId || 0,
          categoryId: draft.categoryId || 0,
          kind: 'gasto',
          currency: draft.currency === 'usd' ? 'usd' : 'pen',
          amountCents: draft.amountCents || 0,
          occurredOn: draft.day || todayKey(),
          accountName: draft.sourceName || '',
          category: draft.category || '',
          note: draft.title || line.trim(),
        })
        return
      }

      const listId = defaultListId || lists[0]?.id
      if (!listId) {
        setError('Crea una lista primero.')
        return
      }
      const time = draft.time || '09:00'
      const remind = kind === 'recordatorio' ? true : draft.remind || Boolean(draft.time)
      await onSaveTask({
        listId,
        title: draft.title,
        notes: '',
        dueAt: combineLocal(draft.day || todayKey(), time),
        remind,
        pinned: false,
        repeatWeekdays: [],
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>Anotar</h2>
        <div className="switch-row">
          <button type="button" className={kind === 'tarea' ? 'pill on' : 'pill quiet'} onClick={() => { setKind('tarea'); setError('') }}>Tarea</button>
          <button type="button" className={kind === 'recordatorio' ? 'pill on' : 'pill quiet'} onClick={() => { setKind('recordatorio'); setError('') }}>Recordatorio</button>
          <button type="button" className={kind === 'gasto' ? 'pill on' : 'pill quiet'} onClick={() => { setKind('gasto'); setError('') }}>Gasto</button>
        </div>
        <label className="field">
          {kind === 'gasto' ? 'Qué gastaste' : kind === 'recordatorio' ? 'Qué te aviso' : 'Qué hacer'}
          <input
            value={line}
            autoFocus
            placeholder={
              kind === 'gasto'
                ? 'gaste 25 en farmacia con amex'
                : kind === 'recordatorio'
                  ? 'Pagar luz mañana 6pm'
                  : 'Reunión mañana 8am'
            }
            onChange={(event) => setLine(event.target.value)}
          />
        </label>
        {line.trim() && draft && (
          <div className="plan-parse">
            <p className="plan-parse-preview">
              Se guarda: “{previewTitle}”
              {drafting ? <span className="hint"> · Entendiendo…</span> : null}
            </p>
            <div className="plan-parse-chips">
              {kind !== 'gasto' && <span className="chip quiet">{dateChipLabel(draft.day || todayKey())}</span>}
              {kind !== 'gasto' && draft.time ? <span className="chip quiet">{draft.time}</span> : null}
              {kind === 'recordatorio' || draft.remind ? <span className="chip quiet">aviso</span> : null}
              {kind === 'gasto' && draft.amountCents > 0 ? (
                <span className="chip quiet">{formatMoneyChip(draft.amountCents, draft.currency)}</span>
              ) : null}
              {kind === 'gasto' && draft.sourceName ? <span className="chip quiet">{draft.sourceName}</span> : null}
              {kind === 'gasto' && draft.category ? <span className="chip quiet">{draft.category}</span> : null}
              {kind === 'gasto' && draft.day ? <span className="chip quiet">{dateChipLabel(draft.day)}</span> : null}
            </div>
            {kind === 'gasto' && draft.question ? <p className="hint">{draft.question}</p> : null}
            {kind === 'gasto' && !moneyReady && !drafting ? (
              <p className="hint">Al guardar te pediré completar lo que falte.</p>
            ) : null}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={saving || !line.trim()}>
          {kind === 'gasto' && !moneyReady ? 'Continuar' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
