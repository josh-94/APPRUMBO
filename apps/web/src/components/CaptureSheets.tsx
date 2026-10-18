import { useEffect, useState, type FormEvent } from 'react'
import type { MoneyCategory, MonthMoney, Movement, MovementInput } from '../types'
import { categoryIcon, categoryIcons, categoryTints } from '../categories'
import { centsToInput, currencySymbol, todayKey } from '../format'
import { dateChipLabel } from '../parseEventLine'
import { useCaptureDraft } from '../useCaptureDraft'

type MoneySource = { type: 'account'; id: number } | { type: 'debt'; id: number }

function initialSource(money: MonthMoney, movement?: Movement | null): MoneySource {
  if (movement?.debtId) return { type: 'debt', id: movement.debtId }
  if (movement?.accountId) return { type: 'account', id: movement.accountId }
  if (money.accounts[0]) return { type: 'account', id: money.accounts[0].id }
  if (money.cards?.[0]) return { type: 'debt', id: money.cards[0].id }
  return { type: 'account', id: 0 }
}

function initialCurrency(money: MonthMoney, movement?: Movement | null): 'pen' | 'usd' {
  if (movement?.currency === 'usd' || movement?.currency === 'pen') return movement.currency
  const source = initialSource(money, movement)
  if (source.type === 'debt') {
    const card = money.cards?.find((item) => item.id === source.id)
    if (card?.currency === 'usd') return 'usd'
  }
  return 'pen'
}

export function HabitSheet({ habit, onClose, onSave, onDelete }: {
  habit?: { id: number; name: string; nGoal: number; icon?: string; category?: string; dailyGoal?: number } | null
  onClose: () => void
  onSave: (input: { name: string; nGoal: number; icon: string; category: string; dailyGoal: number }) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [name, setName] = useState(habit?.name ?? '')
  const [nGoal, setNGoal] = useState(habit?.nGoal ?? 5)
  const [icon, setIcon] = useState(habit?.icon || '✨')
  const [category, setCategory] = useState(habit?.category || 'general')
  const [dailyGoal, setDailyGoal] = useState(habit?.dailyGoal ?? 1)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await onSave({ name: name.trim(), nGoal, icon, category, dailyGoal })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>{habit ? 'Editar hábito' : 'Nuevo hábito'}</h2>
        <label className="field">
          Nombre
          <input value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="field-label">Icono</p>
        <div className="chips">
          {['✨', '😴', '🏃', '💰', '💧', '📚', '🧘', '🥗', '✍️', '🎯'].map((value) => (
            <button key={value} type="button" className={value === icon ? 'pill on' : 'pill quiet'} onClick={() => setIcon(value)}>
              {value}
            </button>
          ))}
        </div>
        <p className="field-label">Categoría</p>
        <div className="chips">
          {([
            ['general', 'General'],
            ['estudios', 'Estudios'],
            ['finanzas', 'Finanzas'],
            ['salud', 'Salud'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={value === category ? 'pill on' : 'pill quiet'} onClick={() => setCategory(value)}>
              {label}
            </button>
          ))}
        </div>
        <p className="field-label">Cuántos días de 7 cuentan como semana cumplida</p>
        <div className="chips">
          {[3, 4, 5, 6, 7].map((value) => (
            <button key={value} type="button" className={value === nGoal ? 'pill on' : 'pill quiet'} onClick={() => setNGoal(value)}>
              {value} de 7
            </button>
          ))}
        </div>
        <p className="field-label">Meta del día (1 = checkbox; más = cantidad)</p>
        <div className="chips">
          {[1, 2, 3, 5, 8, 10].map((value) => (
            <button key={value} type="button" className={value === dailyGoal ? 'pill on' : 'pill quiet'} onClick={() => setDailyGoal(value)}>
              {value === 1 ? '1 vez' : `${value}`}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {habit && onDelete && !confirming && (
          <button type="button" className="ghost danger" onClick={() => setConfirming(true)}>Archivar</button>
        )}
        {habit && onDelete && confirming && (
          <div className="confirm-delete">
            <p>¿Archivar este hábito?</p>
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>Cancelar</button>
            <button type="button" className="ghost danger" onClick={() => void onDelete().then(onClose).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo archivar'))}>
              Sí, archivar
            </button>
          </div>
        )}
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
  const homeCurrency = money.currency || 'PEN'
  const homeSymbol = currencySymbol(homeCurrency)
  const [kind, setKind] = useState<'gasto' | 'ingreso'>(movement?.kind ?? 'gasto')
  const [currency, setCurrency] = useState<'pen' | 'usd'>(() => initialCurrency(money, movement))
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
  const [phrase, setPhrase] = useState('')
  const [settledPhrase, setSettledPhrase] = useState('')
  const phraseEnabled = !movement?.id && kind === 'gasto'
  const phrasePending = phraseEnabled && phrase.trim() !== settledPhrase
  const { draft, loading: drafting } = useCaptureDraft(phraseEnabled ? settledPhrase : '', 'gasto', money)

  // Espera a que deje de tipear antes de interpretar la frase.
  useEffect(() => {
    if (!phraseEnabled) {
      setSettledPhrase('')
      return
    }
    const timer = window.setTimeout(() => setSettledPhrase(phrase.trim()), 2000)
    return () => window.clearTimeout(timer)
  }, [phrase, phraseEnabled])

  useEffect(() => {
    if (!phraseEnabled || !settledPhrase || !draft || phrasePending) return
    if (draft.amountCents > 0) setAmount(centsToInput(draft.amountCents))
    if (draft.currency === 'usd' || draft.currency === 'pen') setCurrency(draft.currency)
    if (draft.title.trim()) setNote(draft.title.trim())
    if (draft.day) setDay(draft.day)
    if (draft.categoryId > 0) setCategoryId(draft.categoryId)
    if (draft.debtId) setSource({ type: 'debt', id: draft.debtId })
    else if (draft.accountId) setSource({ type: 'account', id: draft.accountId })
  }, [draft, settledPhrase, phraseEnabled, phrasePending])

  const noteSuggestions = uniqueNotes(money.movements, kind)
  const categories = [...money.categories, ...created].filter((item, index, all) => item.kind === kind && all.findIndex((other) => other.id === item.id) === index)
  const explicit = categoryId && categories.some((item) => item.id === categoryId) ? categoryId : 0
  const otros = categories.find((item) => item.name === 'Otros')
  const selected = explicit || (kind === 'gasto' && note.trim() && otros ? otros.id : categories[0]?.id)
  const selectedCategory = categories.find((item) => item.id === selected)
  const sourceReady = source.id > 0 && (source.type === 'account' || kind === 'gasto')
  const sourceLabel = source.type === 'debt'
    ? cards.find((item) => item.id === source.id)?.name
    : money.accounts.find((item) => item.id === source.id)?.name
  const cents = toCents(amount)
  const amountLabel = cents
    ? `${currency === 'usd' ? '$' : homeSymbol} ${(cents / 100).toFixed(2)}`
    : ''

  function chooseSource(next: MoneySource) {
    setSource(next)
    if (next.type === 'debt') {
      const card = cards.find((item) => item.id === next.id)
      if (card?.currency === 'usd' || card?.currency === 'pen') setCurrency(card.currency)
    } else {
      setCurrency('pen')
    }
  }

  function chooseKind(next: 'gasto' | 'ingreso') {
    setKind(next)
    setCategoryId(0)
    setAdding(false)
    setNewName('')
    setError('')
    if (next === 'ingreso') setPhrase('')
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
    if (!cents || !selected || !sourceReady) {
      setError(sourceReady ? 'Ese monto no parece correcto. Usa solo números, por ejemplo 25.50.' : 'Elige de dónde sale o a dónde entra el dinero.')
      return
    }
    try {
      await onSave({
        kind,
        currency,
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
      <form className="sheet money-sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <div className="sheet-top">
          <h2>{movement?.id ? (kind === 'gasto' ? 'Editar gasto' : 'Editar ingreso') : (kind === 'gasto' ? 'Anotar gasto' : 'Anotar ingreso')}</h2>
          <button type="button" className="sheet-close" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>

        <div className="switch-row money-kind">
          <button type="button" className={kind === 'gasto' ? 'pill on' : 'pill quiet'} onClick={() => chooseKind('gasto')}>Gasto</button>
          <button type="button" className={kind === 'ingreso' ? 'pill on' : 'pill quiet'} onClick={() => chooseKind('ingreso')}>Ingreso</button>
        </div>

        {phraseEnabled && (
          <>
            <label className="field">
              Qué gastaste
              <input
                value={phrase}
                autoFocus
                placeholder="gaste 25 en farmacia con amex"
                onChange={(event) => setPhrase(event.target.value)}
              />
            </label>
            {phrase.trim() && phrasePending && (
              <p className="hint money-phrase-wait">Sigue escribiendo… al terminar, lo completo solo.</p>
            )}
            {phrase.trim() && !phrasePending && draft && (
              <div className="plan-parse money-parse">
                <p className="plan-parse-preview">
                  Se guarda: “{draft.title || '…'}”
                  {drafting ? <span className="hint"> · Entendiendo…</span> : null}
                </p>
                <div className="plan-parse-chips">
                  {draft.amountCents > 0 ? (
                    <span className="chip quiet">
                      {currencySymbol(draft.currency === 'usd' ? 'USD' : 'PEN')} {(draft.amountCents / 100).toFixed(2)}
                    </span>
                  ) : null}
                  {draft.sourceName ? <span className="chip quiet">{draft.sourceName}</span> : null}
                  {draft.category ? <span className="chip quiet">{draft.category}</span> : null}
                  {draft.day ? <span className="chip quiet">{dateChipLabel(draft.day)}</span> : null}
                </div>
                {draft.question ? <p className="hint">{draft.question}</p> : null}
              </div>
            )}
          </>
        )}

        <div className="amount-field money-amount">
          {homeCurrency !== 'USD' && (
            <div className="currency-toggle" role="group" aria-label="Moneda">
              <button type="button" className={currency === 'pen' ? 'on' : ''} aria-pressed={currency === 'pen'} onClick={() => setCurrency('pen')}>
                Soles
              </button>
              <button type="button" className={currency === 'usd' ? 'on' : ''} aria-pressed={currency === 'usd'} onClick={() => setCurrency('usd')}>
                Dólares
              </button>
            </div>
          )}
          <div className="amount-value">
            <span className="amount-prefix" aria-hidden="true">{currency === 'usd' ? '$' : homeSymbol}</span>
            <input
              className="amount-input"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              autoFocus={!phraseEnabled}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </div>

        <label className="field">
          {kind === 'gasto' ? 'Gastaste en…' : 'De dónde'}
          <input
            list="money-note-suggestions"
            value={note}
            maxLength={80}
            placeholder={kind === 'gasto' ? 'Farmacia, regalo, cine…' : 'Sueldo, yape, venta…'}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <datalist id="money-note-suggestions">
          {noteSuggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        {noteSuggestions.length > 0 && (
          <div className="money-suggest">
            {noteSuggestions.slice(0, 6).map((item) => (
              <button key={item} type="button" className="chip quiet" onClick={() => setNote(item)}>
                {item}
              </button>
            ))}
          </div>
        )}

        {movement && (
          <label className="field">
            Día
            <input type="date" required max={todayKey()} value={day} onChange={(event) => setDay(event.target.value)} />
          </label>
        )}

        <p className="field-label money-section-label">
          {kind === 'gasto' ? 'Sale de' : 'Entra a'}
        </p>
        <div className="chips money-source-chips">
          {money.accounts.map((account) => (
            <button
              key={`a-${account.id}`}
              type="button"
              className={source.type === 'account' && source.id === account.id ? 'pill on' : 'pill quiet'}
              onClick={() => chooseSource({ type: 'account', id: account.id })}
            >
              {account.name}
            </button>
          ))}
          {kind === 'gasto' && cards.map((card) => (
            <button
              key={`c-${card.id}`}
              type="button"
              className={source.type === 'debt' && source.id === card.id ? 'pill on source-card' : 'pill quiet source-card'}
              onClick={() => chooseSource({ type: 'debt', id: card.id })}
            >
              {card.name}
            </button>
          ))}
        </div>

        <p className="field-label money-section-label">Categoría</p>
        <div className="chips money-cat-chips">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selected ? 'pill on' : 'pill quiet'}
              onClick={() => setCategoryId(item.id)}
            >
              <span className="cat-ico" aria-hidden="true">{categoryIcon(item.icon)}</span>
              {item.name}
            </button>
          ))}
          <button type="button" className={adding ? 'pill on' : 'pill quiet'} onClick={() => setAdding((open) => !open)}>
            + Nueva
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

        {(amountLabel || sourceLabel || selectedCategory) && (
          <p className="money-summary" aria-live="polite">
            {[
              amountLabel ? `${kind === 'gasto' ? '−' : '+'} ${amountLabel}` : null,
              sourceLabel,
              selectedCategory?.name,
            ].filter(Boolean).join(' · ')}
          </p>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">{movement?.id ? 'Guardar' : 'Listo'}</button>
        {movement?.id && onDelete && !confirmingDelete && (
          <button type="button" className="ghost danger" onClick={() => setConfirmingDelete(true)}>
            Borrar
          </button>
        )}
        {movement?.id && onDelete && confirmingDelete && (
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

function uniqueNotes(movements: Movement[], kind: 'gasto' | 'ingreso') {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of movements) {
    if (item.kind !== kind) continue
    const note = item.note.trim()
    if (!note) continue
    const key = note.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(note)
    if (out.length >= 8) break
  }
  return out
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
