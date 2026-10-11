import { useState, type FormEvent } from 'react'
import type { MoneyCategory, MonthMoney } from '../types'
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

export function MoneySheet({ money, onClose, onSave, onCreateCategory }: {
  money: MonthMoney
  onClose: () => void
  onSave: (input: { kind: 'gasto' | 'ingreso'; amountCents: number; accountId: number; categoryId: number; day: string; note: string }) => Promise<void>
  onCreateCategory: (name: string, kind: 'gasto' | 'ingreso') => Promise<MoneyCategory>
}) {
  const [kind, setKind] = useState<'gasto' | 'ingreso'>('gasto')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState(0)
  const [created, setCreated] = useState<MoneyCategory[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const categories = [...money.categories, ...created].filter((item, index, all) => item.kind === kind && all.findIndex((other) => other.id === item.id) === index)
  const explicit = categoryId && categories.some((item) => item.id === categoryId) ? categoryId : 0
  const otros = categories.find((item) => item.name === 'Otros')
  const selected = explicit || (kind === 'gasto' && note.trim() && otros ? otros.id : categories[0]?.id)
  const accountId = money.accounts[0]?.id

  function chooseKind(next: 'gasto' | 'ingreso') {
    setKind(next)
    setCategoryId(0)
    setAdding(false)
    setNewName('')
    setError('')
  }

  async function addCategory() {
    const name = newName.trim()
    if (!name) {
      setError('Ponle un nombre de hasta 40 letras.')
      return
    }
    try {
      const category = await onCreateCategory(name, kind)
      setCreated((items) => items.some((item) => item.id === category.id) ? items : [...items, category])
      setCategoryId(category.id)
      setAdding(false)
      setNewName('')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría')
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cents = toCents(amount)
    if (!cents || !selected || !accountId) {
      setError('Ese monto no parece correcto. Usa solo números, por ejemplo 25.50.')
      return
    }
    try {
      await onSave({ kind, amountCents: cents, accountId, categoryId: selected, day: todayKey(), note: note.trim() })
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
          <button type="button" className={kind === 'gasto' ? 'pill on' : 'pill quiet'} onClick={() => chooseKind('gasto')}>Gasto</button>
          <button type="button" className={kind === 'ingreso' ? 'pill on' : 'pill quiet'} onClick={() => chooseKind('ingreso')}>Ingreso</button>
        </div>
        <input
          className="amount-input"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          autoFocus
          onChange={(event) => setAmount(event.target.value)}
        />
        <label className="field">
          {kind === 'gasto' ? 'Gastaste en…' : 'De dónde'}
          <input
            value={note}
            maxLength={80}
            placeholder={kind === 'gasto' ? 'Farmacia, regalo, cine…' : 'Sueldo, yape, venta…'}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <p className="field-label">Opcional. Si se repite, guárdalo como categoría.</p>
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
          <button type="button" className={adding ? 'pill on' : 'pill quiet'} onClick={() => setAdding((open) => !open)}>
            + Categoría
          </button>
          {adding && (
            <div className="chip-add">
              <input
                value={newName}
                maxLength={40}
                placeholder={kind === 'gasto' ? 'Gimnasio' : 'Sueldo'}
                autoFocus
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void addCategory()
                  }
                }}
              />
              <button type="button" className="pill on" onClick={() => void addCategory()}>Agregar</button>
            </div>
          )}
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
