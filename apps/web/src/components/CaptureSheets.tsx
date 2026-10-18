import { useState, type FormEvent } from 'react'
import type { MoneyCategory, MonthMoney, Movement, MovementInput } from '../types'
import { categoryIcon, categoryIcons, categoryTints } from '../categories'
import { centsToInput, todayKey } from '../format'

type MoneySource = { type: 'account'; id: number } | { type: 'debt'; id: number }

function initialSource(money: MonthMoney, movement?: Movement | null): MoneySource {
  if (movement?.debtId) return { type: 'debt', id: movement.debtId }
  if (movement?.accountId) return { type: 'account', id: movement.accountId }
  if (money.accounts[0]) return { type: 'account', id: money.accounts[0].id }
  if (money.cards?.[0]) return { type: 'debt', id: money.cards[0].id }
  return { type: 'account', id: 0 }
}

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

export function MoneySheet({ money, movement, onClose, onSave, onDelete, onCreateCategory }: {
  money: MonthMoney
  movement?: Movement | null
  onClose: () => void
  onSave: (input: MovementInput) => Promise<void>
  onDelete?: () => Promise<void>
  onCreateCategory: (name: string, kind: 'gasto' | 'ingreso') => Promise<MoneyCategory>
}) {
  const cards = money.cards ?? []
  const [kind, setKind] = useState<'gasto' | 'ingreso'>(movement?.kind ?? 'gasto')
  const [amount, setAmount] = useState(movement ? centsToInput(movement.amountCents) : '')
  const [note, setNote] = useState(movement?.note ?? '')
  const [day, setDay] = useState(movement?.occurredOn || todayKey())
  const [categoryId, setCategoryId] = useState(movement?.categoryId ?? 0)
  const [source, setSource] = useState<MoneySource>(() => initialSource(money, movement))
  const [created, setCreated] = useState<MoneyCategory[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const categories = [...money.categories, ...created].filter((item, index, all) => item.kind === kind && all.findIndex((other) => other.id === item.id) === index)
  const explicit = categoryId && categories.some((item) => item.id === categoryId) ? categoryId : 0
  const otros = categories.find((item) => item.name === 'Otros')
  const selected = explicit || (kind === 'gasto' && note.trim() && otros ? otros.id : categories[0]?.id)
  const sourceReady = source.id > 0 && (source.type === 'account' || kind === 'gasto')

  function chooseKind(next: 'gasto' | 'ingreso') {
    setKind(next)
    setCategoryId(0)
    setAdding(false)
    setNewName('')
    setError('')
    if (next === 'ingreso' && source.type === 'debt') {
      setSource(money.accounts[0] ? { type: 'account', id: money.accounts[0].id } : { type: 'account', id: 0 })
    }
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
    if (!cents || !selected || !sourceReady) {
      setError(sourceReady ? 'Ese monto no parece correcto. Usa solo números, por ejemplo 25.50.' : 'Elige de dónde sale o a dónde entra el dinero.')
      return
    }
    try {
      await onSave({
        kind,
        amountCents: cents,
        accountId: source.type === 'account' ? source.id : 0,
        debtId: source.type === 'debt' ? source.id : 0,
        categoryId: selected,
        day,
        note: note.trim(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anotar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>{movement ? (kind === 'gasto' ? 'Editar gasto' : 'Editar ingreso') : (kind === 'gasto' ? 'Anotar gasto' : 'Anotar ingreso')}</h2>
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
        {movement && (
          <label className="field">
            Día
            <input type="date" required max={todayKey()} value={day} onChange={(event) => setDay(event.target.value)} />
          </label>
        )}
        <p className="field-label">
          {kind === 'gasto' ? '¿De qué cuenta o tarjeta sale?' : '¿En qué cuenta entra?'}
        </p>
        <div className="chips">
          {money.accounts.map((account) => (
            <button
              key={`a-${account.id}`}
              type="button"
              className={source.type === 'account' && source.id === account.id ? 'pill on' : 'pill quiet'}
              onClick={() => setSource({ type: 'account', id: account.id })}
            >
              {account.name}
            </button>
          ))}
          {kind === 'gasto' && cards.map((card) => (
            <button
              key={`c-${card.id}`}
              type="button"
              className={source.type === 'debt' && source.id === card.id ? 'pill on' : 'pill quiet'}
              onClick={() => setSource({ type: 'debt', id: card.id })}
            >
              {card.name}
            </button>
          ))}
        </div>
        <p className="field-label">Opcional. Si se repite, guárdalo como categoría.</p>
        <div className="chips">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selected ? 'pill on' : 'pill quiet'}
              onClick={() => setCategoryId(item.id)}
            >
              {categoryIcon(item.icon)} {item.name}
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
        <button type="submit" className="primary">{movement ? 'Guardar' : 'Listo'}</button>
        {movement && onDelete && !confirmingDelete && (
          <button type="button" className="ghost danger" onClick={() => setConfirmingDelete(true)}>
            Borrar
          </button>
        )}
        {movement && onDelete && confirmingDelete && (
          <div className="confirm-delete">
            <p>¿Borrar este {kind === 'gasto' ? 'gasto' : 'ingreso'}?</p>
            <button type="button" className="ghost" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
            <button type="button" className="ghost danger" onClick={() => void onDelete().catch((err) => setError(err instanceof Error ? err.message : 'No se pudo borrar'))}>
              Sí, borrar
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

export function CategorySheet({ onClose, onSave }: {
  onClose: () => void
  onSave: (name: string, icon: string, tint: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(categoryIcons[0])
  const [tint, setTint] = useState<string>(categoryTints[0].id)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await onSave(name.trim(), icon, tint)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>Añadir categoría</h2>
        <label className="field">
          Nombre
          <input value={name} required maxLength={40} placeholder="Gimnasio, mascotas…" autoFocus onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="field-label">Elige un ícono</p>
        <div className="icon-pick">
          {categoryIcons.map((item) => (
            <button key={item} type="button" className={item === icon ? `tint ${tint} on` : 'tint bruma'} onClick={() => setIcon(item)}>
              {item}
            </button>
          ))}
        </div>
        <p className="field-label">Elige un color</p>
        <div className="chips">
          {categoryTints.map((item) => (
            <button key={item.id} type="button" className={item.id === tint ? 'pill on' : 'pill quiet'} onClick={() => setTint(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
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
