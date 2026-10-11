import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { centsToInput, dolares, parseCents, soles } from '../format'
import type { Bill, Debt, MoneyCategory, MoneyPlan, PayAccount, Task } from '../types'

export function AccountSheet({ account, onClose, onSaved }: { account: PayAccount | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(account?.name ?? '')
  const [payday, setPayday] = useState(account?.payday ? String(account.payday) : '')
  const [amount, setAmount] = useState(centsToInput(account?.paydayCents ?? 0))
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    const day = Number(payday)
    const cents = parseCents(amount)
    if ((payday !== '' || amount !== '') && (!day || day > 31 || !cents)) {
      setError('El sueldo necesita un día del mes y un monto.')
      return
    }
    try {
      await api.saveAccount({ id: account?.id, name: name.trim(), payday: day || 0, paydayCents: cents })
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
        <label className="field">Nombre<input value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field">Día en que llega el sueldo<input inputMode="numeric" placeholder="28" value={payday} onChange={(event) => setPayday(event.target.value)} /></label>
        <label className="field">Monto<input inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <p className="field-label">Si no es un sueldo, deja el día y el monto vacíos.</p>
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

export function DebtSheet({ debt, onClose, onSaved }: { debt: Debt | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<Debt['kind']>(debt?.kind ?? 'tarjeta')
  const [currency, setCurrency] = useState<Debt['currency']>(debt?.currency ?? 'pen')
  const [name, setName] = useState(debt?.name ?? '')
  const [dueDay, setDueDay] = useState(debt ? String(debt.dueDay) : '')
  const [balancePen, setBalancePen] = useState(centsToInput(debt?.balancePen ?? 0))
  const [balanceUsd, setBalanceUsd] = useState(centsToInput(debt?.balanceUsd ?? 0))
  const [cuotaPen, setCuotaPen] = useState(centsToInput(debt?.cuotaPen ?? 0))
  const [cuotaUsd, setCuotaUsd] = useState(centsToInput(debt?.cuotaUsd ?? 0))
  const [error, setError] = useState('')

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
        currency: kind === 'prestamo' ? currency : 'pen',
        balancePen: parseCents(balancePen),
        balanceUsd: parseCents(balanceUsd),
        cuotaPen: parseCents(cuotaPen),
        cuotaUsd: parseCents(cuotaUsd),
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
        <h2>{debt ? debt.name : 'Nueva deuda'}</h2>
        <div className="switch-row">
          <button type="button" className={kind === 'tarjeta' ? 'pill on' : 'pill quiet'} onClick={() => setKind('tarjeta')}>Tarjeta</button>
          <button type="button" className={kind === 'prestamo' ? 'pill on' : 'pill quiet'} onClick={() => setKind('prestamo')}>Préstamo</button>
        </div>
        <label className="field">Nombre<input value={name} required maxLength={80} placeholder="Visa BCP" onChange={(event) => setName(event.target.value)} /></label>
        <label className="field">Día de pago<input inputMode="numeric" required placeholder="19" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label>
        {kind === 'prestamo' && (
          <div className="switch-row">
            <button type="button" className={currency === 'pen' ? 'pill on' : 'pill quiet'} onClick={() => setCurrency('pen')}>Soles</button>
            <button type="button" className={currency === 'usd' ? 'pill on' : 'pill quiet'} onClick={() => setCurrency('usd')}>Dólares</button>
          </div>
        )}
        {(kind === 'tarjeta' || currency === 'pen') && (
          <>
            <label className="field">Debes en soles<input inputMode="decimal" placeholder="0.00" value={balancePen} onChange={(event) => setBalancePen(event.target.value)} /></label>
            <label className="field">Cuota en soles<input inputMode="decimal" placeholder="0.00" value={cuotaPen} onChange={(event) => setCuotaPen(event.target.value)} /></label>
          </>
        )}
        {(kind === 'tarjeta' || currency === 'usd') && (
          <>
            <label className="field">Debes en dólares<input inputMode="decimal" placeholder="0.00" value={balanceUsd} onChange={(event) => setBalanceUsd(event.target.value)} /></label>
            <label className="field">Cuota en dólares<input inputMode="decimal" placeholder="0.00" value={cuotaUsd} onChange={(event) => setCuotaUsd(event.target.value)} /></label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {debt && (
          <button type="button" className="ghost danger" onClick={() => void api.deleteDebt(debt.id).then(onSaved).then(onClose).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo borrar'))}>
            Borrar deuda
          </button>
        )}
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
        setAmount(centsToInput(account?.paydayCents ?? 0))
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
  const title = task.payKind === 'sueldo' ? 'Confirmar sueldo' : task.payKind === 'mes' ? 'Confirmar pago' : 'Confirmar cuota'

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void save(event)}>
        <div className="sheet-handle" />
        <h2>{title}</h2>
        <p className="field-label">{task.notes}</p>
        <label className="field">{task.payKind === 'sueldo' ? 'Te llega' : 'Sale'}<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
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

function hiddenDebt(debt: Debt) {
  const parts = []
  if (debt.balancePen) parts.push(soles(debt.balancePen))
  if (debt.balanceUsd) parts.push(dolares(debt.balanceUsd))
  return parts.join(' y ') || soles(0)
}
