import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { cardTint, cardTints } from '../cardTints'
import { centsToInput, currencies, dolares, money, parseCents, soles, todayKey } from '../format'
import type { Bill, CardTint, Debt, MoneyCategory, MoneyPlan, PayAccount, PayEvery, Task } from '../types'

const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const payChoices: { id: Exclude<PayEvery, ''>; label: string }[] = [
  { id: 'semana', label: 'Cada semana' },
  { id: 'quincena', label: 'Cada quincena' },
  { id: 'mes', label: 'Cada mes' },
]

function currencyLabel(code: string) {
  return currencies.find((item) => item.code === code)?.name ?? code
}

const latinCurrencies = currencies
  .filter((item) => item.code !== 'PEN' && item.code !== 'USD')
  .sort((a, b) => a.name.localeCompare(b.name, 'es'))

export function AccountSheet({ account, onClose, onSaved }: { account: PayAccount | null; onClose: () => void; onSaved: () => void }) {
  const saved = account?.currency || 'PEN'
  const listed = currencies.some((item) => item.code === saved)
  const [name, setName] = useState(account?.name ?? '')
  const [every, setEvery] = useState<PayEvery>(account?.payEvery || (account?.payday ? 'mes' : ''))
  const [payday, setPayday] = useState(account?.payday ? String(account.payday) : '')
  const [amount, setAmount] = useState(centsToInput(account?.paydayCents ?? 0))
  const [payday2, setPayday2] = useState(account?.payday2 ? String(account.payday2) : '')
  const [amount2, setAmount2] = useState(centsToInput(account?.payday2Cents ?? 0))
  const [currency, setCurrency] = useState(listed ? saved : 'custom')
  const [custom, setCustom] = useState(listed ? '' : saved)
  const [error, setError] = useState('')

  function chooseEvery(next: PayEvery) {
    setEvery((current) => current === next ? '' : next)
    setError('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const typed = custom.trim()
    const code = currency === 'custom' ? (/^[A-Za-z]+$/.test(typed) ? typed.toUpperCase() : typed) : currency
    if (currency === 'custom' && !code) {
      setError('Escribe la moneda, por ejemplo EUR.')
      return
    }
    const day = Number(payday)
    const cents = parseCents(amount)
    const day2 = Number(payday2)
    const cents2 = parseCents(amount2)
    let pay = { payEvery: '' as PayEvery, payday: 0, paydayCents: 0, payday2: 0, payday2Cents: 0 }
    if (every === 'semana') {
      if (day < 1 || day > 7 || !cents) {
        setError('El sueldo semanal necesita un día y un monto.')
        return
      }
      pay = { payEvery: 'semana', payday: day, paydayCents: cents, payday2: 0, payday2Cents: 0 }
    }
    if (every === 'mes') {
      if (!day || day > 31 || !cents) {
        setError('El sueldo mensual necesita un día del mes y un monto.')
        return
      }
      pay = { payEvery: 'mes', payday: day, paydayCents: cents, payday2: 0, payday2Cents: 0 }
    }
    if (every === 'quincena') {
      if (!day || day > 31 || !day2 || day2 > 31 || day === day2 || !cents || !cents2) {
        setError('Cada quincena necesita su día y su monto.')
        return
      }
      pay = { payEvery: 'quincena', payday: day, paydayCents: cents, payday2: day2, payday2Cents: cents2 }
    }
    try {
      await api.saveAccount({ id: account?.id, name: name.trim(), currency: code, ...pay })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void save(event)}>
        <div className="sheet-handle" />
        <h2>{account ? 'Cuenta' : 'Nueva cuenta'}</h2>
        {account && <p className="field-label">Saldo {money(account.balanceCents, account.currency || 'PEN')}</p>}
        <label className="field">Nombre<input value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field">
          Moneda
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <optgroup label="Soles y dólares">
              <option value="PEN">Sol (S/)</option>
              <option value="USD">Dólar ($)</option>
            </optgroup>
            <optgroup label="Latinoamérica">
              {latinCurrencies.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.symbol})</option>)}
            </optgroup>
            <option value="custom">Personalizar</option>
          </select>
        </label>
        {currency === 'custom' && (
          <label className="field">
            Tu moneda
            <input value={custom} required maxLength={6} placeholder="EUR" onChange={(event) => setCustom(event.target.value)} />
          </label>
        )}
        <p className="field-label">Cada cuánto llega el sueldo</p>
        <div className="chips">
          {payChoices.map((item) => (
            <button key={item.id} type="button" className={every === item.id ? 'pill on' : 'pill quiet'} onClick={() => chooseEvery(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {every === 'semana' && (
          <label className="field">
            Día de la semana
            <select value={payday} onChange={(event) => setPayday(event.target.value)}>
              <option value="">Elige</option>
              {weekdays.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </select>
          </label>
        )}
        {every === 'mes' && (
          <label className="field">Día del mes<input inputMode="numeric" placeholder="28" value={payday} onChange={(event) => setPayday(event.target.value)} /></label>
        )}
        {every === 'quincena' && (
          <>
            <label className="field">Día de la primera quincena<input inputMode="numeric" placeholder="15" value={payday} onChange={(event) => setPayday(event.target.value)} /></label>
            <label className="field">Monto de la primera<input inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <label className="field">Día de la segunda quincena<input inputMode="numeric" placeholder="30" value={payday2} onChange={(event) => setPayday2(event.target.value)} /></label>
            <label className="field">Monto de la segunda<input inputMode="decimal" placeholder="0.00" value={amount2} onChange={(event) => setAmount2(event.target.value)} /></label>
          </>
        )}
        {(every === 'semana' || every === 'mes') && (
          <label className="field">Cuánto entra<input inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        )}
        <p className="field-label">Si no llega un sueldo, deja las opciones sin elegir.</p>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {account && (
          <button type="button" className="ghost danger" onClick={() => void api.deleteAccount(account.id).then(onSaved).then(onClose).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo borrar'))}>
            Borrar cuenta
          </button>
        )}
      </form>
    </div>
  )
}

export function DebtSheet({ debt, kind: lockedKind, onClose, onSaved }: {
  debt: Debt | null
  kind?: Debt['kind']
  onClose: () => void
  onSaved: () => void
}) {
  const [kind] = useState<Debt['kind']>(debt?.kind ?? lockedKind ?? 'tarjeta')
  const [currency, setCurrency] = useState<Debt['currency']>(debt?.currency ?? 'pen')
  const [name, setName] = useState(debt?.name ?? '')
  const [dueDay, setDueDay] = useState(debt ? String(debt.dueDay) : '')
  const [limit, setLimit] = useState(centsToInput(debt?.limitCents ?? 0))
  const [tint, setTint] = useState<CardTint>(cardTint(debt?.tint ?? 'noche'))
  const [balancePen, setBalancePen] = useState(centsToInput(debt?.balancePen ?? 0))
  const [balanceUsd, setBalanceUsd] = useState(centsToInput(debt?.balanceUsd ?? 0))
  const [cuotaPen, setCuotaPen] = useState(centsToInput(debt?.cuotaPen ?? 0))
  const [cuotaUsd, setCuotaUsd] = useState(centsToInput(debt?.cuotaUsd ?? 0))
  const [error, setError] = useState('')
  const card = kind === 'tarjeta'

  async function save(event: FormEvent) {
    event.preventDefault()
    const day = Number(dueDay)
    if (!day || day > 31) {
      setError('El día de pago va del 1 al 31.')
      return
    }
    try {
      await api.saveDebt({
        id: debt?.id,
        kind,
        name: name.trim(),
        dueDay: day,
        currency: card ? 'pen' : currency,
        balancePen: parseCents(balancePen),
        balanceUsd: parseCents(balanceUsd),
        cuotaPen: parseCents(cuotaPen),
        cuotaUsd: parseCents(cuotaUsd),
        last4: '',
        limitCents: card ? parseCents(limit) : 0,
        tint: card ? tint : 'noche',
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void save(event)}>
        <div className="sheet-handle" />
        <h2>{debt ? debt.name : card ? 'Nueva tarjeta' : 'Nuevo préstamo'}</h2>
        <label className="field">Nombre<input value={name} required maxLength={80} placeholder={card ? 'Amex Gold' : 'Préstamo vehicular'} onChange={(event) => setName(event.target.value)} /></label>
        {card && (
          <>
            <label className="field">Línea de crédito<input inputMode="decimal" placeholder="0.00" value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
            <p className="field-label">Color de la tarjeta</p>
            <div className="card-tint-pick">
              {cardTints.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`card-tint-swatch tone-${item.id}${tint === item.id ? ' on' : ''}`}
                  aria-label={item.label}
                  aria-pressed={tint === item.id}
                  onClick={() => setTint(item.id)}
                />
              ))}
            </div>
          </>
        )}
        <label className="field">Día de pago<input inputMode="numeric" required placeholder="19" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>
        {!card && (
          <div className="switch-row">
            <button type="button" className={currency === 'pen' ? 'pill on' : 'pill quiet'} onClick={() => setCurrency('pen')}>Soles</button>
            <button type="button" className={currency === 'usd' ? 'pill on' : 'pill quiet'} onClick={() => setCurrency('usd')}>Dólares</button>
          </div>
        )}
        {(card || currency === 'pen') && (
          <>
            <label className="field">{card ? 'Consumido en soles' : 'Debes en soles'}<input inputMode="decimal" placeholder="0.00" value={balancePen} onChange={(event) => setBalancePen(event.target.value)} /></label>
            <label className="field">{card ? 'Próximo pago en soles' : 'Cuota en soles'}<input inputMode="decimal" placeholder="0.00" value={cuotaPen} onChange={(event) => setCuotaPen(event.target.value)} /></label>
          </>
        )}
        {(card || currency === 'usd') && (
          <>
            <label className="field">{card ? 'Consumido en dólares' : 'Debes en dólares'}<input inputMode="decimal" placeholder="0.00" value={balanceUsd} onChange={(event) => setBalanceUsd(event.target.value)} /></label>
            <label className="field">{card ? 'Próximo pago en dólares' : 'Cuota en dólares'}<input inputMode="decimal" placeholder="0.00" value={cuotaUsd} onChange={(event) => setCuotaUsd(event.target.value)} /></label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {debt && (
          <button type="button" className="ghost danger" onClick={() => void api.deleteDebt(debt.id).then(onSaved).then(onClose).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo borrar'))}>
            {card ? 'Borrar tarjeta' : 'Borrar préstamo'}
          </button>
        )}
      </form>
    </div>
  )
}

export function DebtMoveSheet({ debtId, onClose, onSaved }: { debtId: number; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'consumo' | 'pago'>('consumo')
  const [currency, setCurrency] = useState<'pen' | 'usd'>('pen')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [day, setDay] = useState(todayKey())
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    const cents = parseCents(amount)
    if (!cents) {
      setError('Ese monto no parece correcto.')
      return
    }
    try {
      await api.addDebtMove(debtId, { kind, currency, amountCents: cents, day, note: note.trim() })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anotar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void save(event)}>
        <div className="sheet-handle" />
        <h2>{kind === 'consumo' ? 'Anotar consumo' : 'Anotar pago'}</h2>
        <div className="switch-row">
          <button type="button" className={kind === 'consumo' ? 'pill on' : 'pill quiet'} onClick={() => setKind('consumo')}>Consumo</button>
          <button type="button" className={kind === 'pago' ? 'pill on' : 'pill quiet'} onClick={() => setKind('pago')}>Pago</button>
        </div>
        <div className="switch-row">
          <button type="button" className={currency === 'pen' ? 'pill on' : 'pill quiet'} onClick={() => setCurrency('pen')}>Soles</button>
          <button type="button" className={currency === 'usd' ? 'pill on' : 'pill quiet'} onClick={() => setCurrency('usd')}>Dólares</button>
        </div>
        <label className="field">Monto<input inputMode="decimal" required placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label className="field">Día<input type="date" required value={day} onChange={(event) => setDay(event.target.value)} /></label>
        <label className="field">Nota<input value={note} maxLength={80} placeholder={kind === 'consumo' ? 'Supermercado, Uber…' : 'Pago de tarjeta'} onChange={(event) => setNote(event.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
      </form>
    </div>
  )
}

export function BillSheet({ bill, categories, onClose, onSaved }: { bill: Bill | null; categories: MoneyCategory[]; onClose: () => void; onSaved: () => void }) {
  const gastos = categories.filter((item) => item.kind === 'gasto')
  const [name, setName] = useState(bill?.name ?? '')
  const [amount, setAmount] = useState(centsToInput(bill?.amountCents ?? 0))
  const [dueDay, setDueDay] = useState(bill ? String(bill.dueDay) : '')
  const [categoryId, setCategoryId] = useState(bill?.categoryId || gastos[0]?.id || 0)
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    const day = Number(dueDay)
    const cents = parseCents(amount)
    if (!day || day > 31 || !cents) {
      setError('Hace falta el día y el monto.')
      return
    }
    try {
      await api.saveBill({ id: bill?.id, name: name.trim(), amountCents: cents, dueDay: day, categoryId })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void save(event)}>
        <div className="sheet-handle" />
        <h2>{bill ? bill.name : 'Pago del mes'}</h2>
        <label className="field">Nombre<input value={name} required maxLength={80} placeholder="Universidad" onChange={(event) => setName(event.target.value)} /></label>
        <label className="field">Monto<input inputMode="decimal" required placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label className="field">Día del mes<input inputMode="numeric" required placeholder="5" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>
        <label className="field">
          Categoría
          <select value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}>
            {gastos.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <p className="field-label">No entra en la deuda. Al confirmar, se anota el gasto y vuelve el mes siguiente.</p>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {bill && (
          <button type="button" className="ghost danger" onClick={() => void api.deleteBill(bill.id).then(onSaved).then(onClose).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo borrar'))}>
            Borrar pago
          </button>
        )}
      </form>
    </div>
  )
}

export function PayConfirm({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<MoneyPlan | null>(null)
  const [amount, setAmount] = useState('')
  const [balancePen, setBalancePen] = useState('')
  const [balanceUsd, setBalanceUsd] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.plan().then((next) => {
      setPlan(next)
      const fx = next.fxHundredths
      if (task.payKind === 'sueldo') {
        const account = next.accounts.find((item) => item.id === task.payRef)
        setAmount(centsToInput(salaryCents(account, task.dueAt)))
      }
      if (task.payKind === 'mes') {
        const bill = next.bills.find((item) => item.id === task.payRef)
        setAmount(centsToInput(bill?.amountCents ?? 0))
      }
      if (task.payKind === 'tarjeta' || task.payKind === 'prestamo') {
        const debt = next.debts.find((item) => item.id === task.payRef && item.kind === task.payKind)
        if (!debt) return
        const pago = debt.cuotaPen + Math.floor((debt.cuotaUsd * fx) / 100)
        setAmount(centsToInput(pago))
        setBalancePen(centsToInput(Math.max(0, debt.balancePen - debt.cuotaPen)))
        setBalanceUsd(centsToInput(Math.max(0, debt.balanceUsd - debt.cuotaUsd)))
      }
      setReady(true)
    }).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo leer'))
  }, [task])

  async function save(event: FormEvent) {
    event.preventDefault()
    const cents = parseCents(amount)
    if (!cents || !task.payKind || !task.payRef) {
      setError('El monto del pago no parece correcto.')
      return
    }
    try {
      await api.confirmPay({
        kind: task.payKind,
        id: task.payRef,
        amountCents: cents,
        balancePen: parseCents(balancePen),
        balanceUsd: parseCents(balanceUsd),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar')
    }
  }

  const debt = plan?.debts.find((item) => item.id === task.payRef && item.kind === task.payKind)
  const payAccount = plan?.accounts.find((item) => item.id === task.payRef)
  const title = task.payKind === 'sueldo' ? 'Confirmar sueldo' : task.payKind === 'mes' ? 'Confirmar pago' : 'Confirmar cuota'

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void save(event)}>
        <div className="sheet-handle" />
        <h2>{title}</h2>
        <p className="field-label">{task.notes}</p>
        <label className="field">{task.payKind === 'sueldo' ? 'Te llega' : 'Sale'}<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        {task.payKind === 'sueldo' && payAccount && <p className="field-label">Moneda: {currencyLabel(payAccount.currency)}</p>}
        {debt && debt.kind === 'tarjeta' && (
          <>
            <p className="field-label">La tarjeta sigue moviéndose. Corrige lo que quedaría debiendo.</p>
            <label className="field">Te queda debiendo en soles<input inputMode="decimal" value={balancePen} onChange={(event) => setBalancePen(event.target.value)} /></label>
            <label className="field">Te queda debiendo en dólares<input inputMode="decimal" value={balanceUsd} onChange={(event) => setBalanceUsd(event.target.value)} /></label>
          </>
        )}
        {debt && debt.kind === 'prestamo' && (
          <label className="field">
            Deuda que queda {debt.currency === 'usd' ? 'en dólares' : 'en soles'}
            <input inputMode="decimal" value={debt.currency === 'usd' ? balanceUsd : balancePen} onChange={(event) => debt.currency === 'usd' ? setBalanceUsd(event.target.value) : setBalancePen(event.target.value)} />
          </label>
        )}
        {debt && <p className="field-label">Hoy debes {hiddenDebt(debt)}.</p>}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={!ready}>Listo</button>
      </form>
    </div>
  )
}

function salaryCents(account: PayAccount | undefined, dueAt: string | null) {
  if (!account) return 0
  const day = Number(dueAt?.slice(0, 10).split('-')[2])
  if (account.payEvery === 'quincena' && day === account.payday2) return account.payday2Cents
  return account.paydayCents
}

function hiddenDebt(debt: Debt) {
  const parts = []
  if (debt.balancePen) parts.push(soles(debt.balancePen))
  if (debt.balanceUsd) parts.push(dolares(debt.balanceUsd))
  return parts.join(' y ') || soles(0)
}
