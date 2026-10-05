import { useState, type FormEvent } from 'react'
import type { MonthMoney } from '../types'
import { todayKey } from '../format'

export function HabitSheet({ onClose, onSave }: { onClose: () => void; onSave: (name: string, nGoal: number) => Promise<void> }) {
  const [name, setName] = useState('')
  const [nGoal, setNGoal] = useState(5)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await onSave(name.trim(), nGoal)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>Nuevo hábito</h2>
        <label className="field">
          Nombre
          <input value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="field-label">Cuántos días de 7 cuentan como semana cumplida</p>
        <div className="chips">
          {[3, 4, 5, 6, 7].map((value) => (
            <button key={value} type="button" className={value === nGoal ? 'pill on' : 'pill quiet'} onClick={() => setNGoal(value)}>
              {value} de 7
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
      </form>
    </div>
  )
}

export function MoneySheet({ money, onClose, onSave }: {
  money: MonthMoney
  onClose: () => void
  onSave: (input: { kind: 'gasto' | 'ingreso'; amountCents: number; accountId: number; categoryId: number; day: string }) => Promise<void>
}) {
  const [kind, setKind] = useState<'gasto' | 'ingreso'>('gasto')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(0)
  const [error, setError] = useState('')
  const categories = money.categories.filter((item) => item.kind === kind)
  const selected = categoryId && categories.some((item) => item.id === categoryId) ? categoryId : categories[0]?.id
  const accountId = money.accounts[0]?.id

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cents = toCents(amount)
    if (!cents || !selected || !accountId) {
      setError('Ese monto no parece correcto. Usa solo números, por ejemplo 25.50.')
      return
    }
    try {
      await onSave({ kind, amountCents: cents, accountId, categoryId: selected, day: todayKey() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anotar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>{kind === 'gasto' ? 'Anotar gasto' : 'Anotar ingreso'}</h2>
        <div className="switch-row">
          <button type="button" className={kind === 'gasto' ? 'pill on' : 'pill quiet'} onClick={() => setKind('gasto')}>Gasto</button>
          <button type="button" className={kind === 'ingreso' ? 'pill on' : 'pill quiet'} onClick={() => setKind('ingreso')}>Ingreso</button>
        </div>
        <input
          className="amount-input"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          autoFocus
          onChange={(event) => setAmount(event.target.value)}
        />
        <div className="chips">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selected ? 'pill on' : 'pill quiet'}
              onClick={() => setCategoryId(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Listo</button>
      </form>
    </div>
  )
}

function toCents(raw: string) {
  const cleaned = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return 0
  const [whole, frac = ''] = cleaned.split('.')
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2))
  return Number.isFinite(cents) ? cents : 0
}
