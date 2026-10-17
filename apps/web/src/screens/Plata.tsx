import { useEffect, useState } from 'react'
import { api } from '../api'
import { MoneySheet } from '../components/CaptureSheets'
import { AccountSheet, BillSheet, DebtSheet } from '../components/PlanSheets'
import { EyeButton, useHideMoney } from '../components/HideMoney'
import { Shell } from '../components/Shell'
import { dolares, soles } from '../format'
import type { Bill, Debt, MoneyPlan, MonthMoney, Movement, PayAccount } from '../types'

export function Plata({ onCreate, onChanged, refresh }: { onCreate: () => void; onChanged: () => void; refresh: number }) {
  const current = currentMonthKey()
  const { hidden, toggle } = useHideMoney()
  const [month, setMonth] = useState(current)
  const [money, setMoney] = useState<MonthMoney | null>(null)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [plan, setPlan] = useState<MoneyPlan | null>(null)
  const [fx, setFx] = useState('')
  const [account, setAccount] = useState<PayAccount | null | undefined>(undefined)
  const [debt, setDebt] = useState<Debt | null | undefined>(undefined)
  const [bill, setBill] = useState<Bill | null | undefined>(undefined)
  const viewingNow = month === current

  function reload() {
    api.plan().then((next) => {
      setPlan(next)
      setFx((next.fxHundredths / 100).toFixed(2))
    }).catch(() => setPlan(null))
  }

  useEffect(() => {
    reload()
  }, [])

  useEffect(() => {
    api.month(month).then(setMoney).catch(() => setMoney(null))
  }, [month, refresh])

  async function saveFx() {
    const hundredths = Math.round(Number(fx.replace(',', '.')) * 100)
    if (!hundredths) return
    try {
      await api.setFx(hundredths)
      reload()
    } catch {
      setFx(plan ? (plan.fxHundredths / 100).toFixed(2) : '')
    }
  }

  return (
    <Shell tabs>
      <div className="month-nav">
        <button type="button" className="month-step" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <p className="kicker">{monthTitle(month, current)}</p>
        <button type="button" className="month-step" aria-label="Mes siguiente" disabled={viewingNow} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      <div className="headline-row">
        <h1 className="headline">{headline(money, hidden, viewingNow)}</h1>
        <EyeButton hidden={hidden} onToggle={toggle} />
      </div>
      <button type="button" className="primary" onClick={() => { setMonth(current); onCreate() }}>Anotar gasto</button>
      {money && money.movements.length === 0 && (
        <p className="empty">{viewingNow ? 'Aún no registras nada este mes. Empieza con lo último que gastaste.' : 'En este mes no anotaste nada.'}</p>
      )}
      {money && money.movements.length > 0 && (
        <div className="ledger">
          {money.movements.map((item) => {
            const title = item.note || item.category || (item.kind === 'ingreso' ? 'Ingreso' : 'Gasto')
            return (
              <button key={item.id} type="button" className={item.kind === 'ingreso' ? 'move ingreso' : 'move gasto'} onClick={() => setEditing(item)}>
                <span className="move-mark" aria-hidden="true">{title.trim().charAt(0).toUpperCase()}</span>
                <span className="move-copy">
                  <strong>{title}</strong>
                  <span className="meta">{movementDate(item.occurredOn)}</span>
                </span>
                <strong className="move-amount">{movementAmount(item.kind, item.amountCents, hidden)}</strong>
                <span className="move-chevron" aria-hidden="true">›</span>
              </button>
            )
          })}
        </div>
      )}

      <h2 className="section-label">Debo</h2>
      <section className="summary">
        <p className="label">Deuda total</p>
        <strong>{plan ? mask(hidden, soles(plan.debtTotalPen)) : '…'}</strong>
        <p>
          {plan && (plan.debtPen > 0 || plan.debtUsd > 0)
            ? `${mask(hidden, soles(plan.debtPen))} y ${mask(hidden, dolares(plan.debtUsd))}`
            : 'Tarjetas y préstamos. El sueldo no entra aquí.'}
        </p>
        {plan && plan.cuotaTotalPen > 0 && <p>Cuotas de este mes: {mask(hidden, soles(plan.cuotaTotalPen))}</p>}
      </section>
      <label className="field">
        Tipo de cambio
        <input inputMode="decimal" value={fx} onChange={(event) => setFx(event.target.value)} onBlur={() => void saveFx()} />
      </label>
      {plan?.debts.map((item) => (
        <button key={item.id} type="button" className="money-row plan-row" onClick={() => setDebt(item)}>
          <div>
            <strong>{item.name}</strong>
            <p className="meta">{debtMeta(item, hidden)}</p>
          </div>
          <strong>{mask(hidden, debtAmount(item))}</strong>
        </button>
      ))}
      <button type="button" className="ghost" onClick={() => setDebt(null)}>Agregar deuda</button>

      <h2 className="section-label">Cuentas</h2>
      {plan?.accounts.map((item) => (
        <button key={item.id} type="button" className="money-row plan-row" onClick={() => setAccount(item)}>
          <div>
            <strong>{item.name}</strong>
            <p className="meta">{item.payday ? `Sueldo el ${item.payday}` : 'Sin sueldo programado'}</p>
          </div>
          <strong>{item.paydayCents ? mask(hidden, soles(item.paydayCents)) : ''}</strong>
        </button>
      ))}
      <button type="button" className="ghost" onClick={() => setAccount(null)}>Agregar cuenta</button>

      <h2 className="section-label">Cada mes</h2>
      {plan && plan.bills.length === 0 && <p className="hint">Universidad y otros pagos fijos. No son deuda.</p>}
      {plan?.bills.map((item) => (
        <button key={item.id} type="button" className="money-row plan-row" onClick={() => setBill(item)}>
          <div>
            <strong>{item.name}</strong>
            <p className="meta">Día {item.dueDay}{item.category ? ` · ${item.category}` : ''}</p>
          </div>
          <strong>{mask(hidden, soles(item.amountCents))}</strong>
        </button>
      ))}
      <button type="button" className="ghost" onClick={() => setBill(null)}>Agregar pago</button>

      {account !== undefined && <AccountSheet account={account} onClose={() => setAccount(undefined)} onSaved={reload} />}
      {debt !== undefined && <DebtSheet debt={debt} onClose={() => setDebt(undefined)} onSaved={reload} />}
      {bill !== undefined && <BillSheet bill={bill} categories={money?.categories ?? []} onClose={() => setBill(undefined)} onSaved={reload} />}
      {editing && money && (
        <MoneySheet
          money={money}
          movement={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await api.updateMovement(editing.id, input)
            setEditing(null)
            onChanged()
          }}
          onDelete={async () => {
            await api.deleteMovement(editing.id)
            setEditing(null)
            onChanged()
          }}
          onCreateCategory={async (name, kind) => {
            const category = await api.createCategory(name, kind)
            onChanged()
            return category
          }}
        />
      )}
    </Shell>
  )
}

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return currentMonthKey(date)
}

function monthTitle(key: string, current: string) {
  if (key === current) return 'Este mes'
  const [year, month] = key.split('-').map(Number)
  const text = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function headline(money: MonthMoney | null, hidden: boolean, viewingNow: boolean) {
  if (!money) return 'Cargando'
  if (hidden && (money.spentCents > 0 || money.incomeCents > 0)) return 'S/ ••••'
  if (money.incomeCents > 0 && money.remainingCents !== null) {
    return viewingNow ? `Te quedan ${soles(money.remainingCents)}` : `Te quedaron ${soles(money.remainingCents)}`
  }
  if (money.spentCents > 0) return viewingNow ? `Llevas ${soles(money.spentCents)} gastados` : `Gastaste ${soles(money.spentCents)}`
  return viewingNow ? 'Aún sin movimientos' : 'Sin movimientos'
}

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function movementDate(day: string) {
  const [, month, date] = day.split('-').map(Number)
  if (!month || !date) return day
  return `${date} ${monthNames[month - 1]}`
}

function movementAmount(kind: 'gasto' | 'ingreso', cents: number, hidden: boolean) {
  if (hidden) return 'S/ ••••'
  const number = soles(cents).replace(/^S\/\s*/, '')
  return kind === 'gasto' ? `S/ -${number}` : `S/ ${number}`
}

function mask(hidden: boolean, text: string) {
  if (!hidden) return text
  return text.startsWith('$') ? '$ ••••' : 'S/ ••••'
}

function debtAmount(debt: Debt) {
  if (debt.balancePen && debt.balanceUsd) return `${soles(debt.balancePen)}`
  if (debt.balanceUsd) return dolares(debt.balanceUsd)
  return soles(debt.balancePen)
}

function debtMeta(debt: Debt, hidden: boolean) {
  const bits = [`pago el ${debt.dueDay}`]
  if (debt.cuotaPen) bits.push(`cuota ${mask(hidden, soles(debt.cuotaPen))}`)
  if (debt.cuotaUsd) bits.push(`cuota ${mask(hidden, dolares(debt.cuotaUsd))}`)
  if (debt.balancePen && debt.balanceUsd) bits.unshift(mask(hidden, dolares(debt.balanceUsd)))
  return bits.join(' · ')
}
