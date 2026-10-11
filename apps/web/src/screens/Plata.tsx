import { useEffect, useState } from 'react'
import { api } from '../api'
import { AccountSheet, BillSheet, DebtSheet } from '../components/PlanSheets'
import { EyeButton, useHideMoney } from '../components/HideMoney'
import { Shell } from '../components/Shell'
import { dolares, soles } from '../format'
import type { Bill, Debt, MoneyPlan, MonthMoney, PayAccount } from '../types'

export function Plata({ money, onCreate }: { money: MonthMoney | null; onCreate: () => void }) {
  const { hidden, toggle } = useHideMoney()
  const [plan, setPlan] = useState<MoneyPlan | null>(null)
  const [fx, setFx] = useState('')
  const [account, setAccount] = useState<PayAccount | null | undefined>(undefined)
  const [debt, setDebt] = useState<Debt | null | undefined>(undefined)
  const [bill, setBill] = useState<Bill | null | undefined>(undefined)

  function reload() {
    api.plan().then((next) => {
      setPlan(next)
      setFx((next.fxHundredths / 100).toFixed(2))
    }).catch(() => setPlan(null))
  }

  useEffect(() => {
    reload()
  }, [])

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
      <p className="kicker">Este mes</p>
      <div className="headline-row">
        <h1 className="headline">{headline(money, hidden)}</h1>
        <EyeButton hidden={hidden} onToggle={toggle} />
      </div>
      <button type="button" className="primary" onClick={onCreate}>Anotar gasto</button>
      {money && money.movements.length === 0 && (
        <p className="empty">Aún no registras nada este mes. Empieza con lo último que gastaste.</p>
      )}
      {money?.movements.map((item) => (
        <div key={item.id} className={item.kind === 'ingreso' ? 'money-row ingreso' : 'money-row'}>
          <div>
            <strong>{item.note || item.category || (item.kind === 'ingreso' ? 'Ingreso' : 'Gasto')}</strong>
            <p className="meta">{item.note && item.category ? `${item.category} · ${item.occurredOn}` : item.occurredOn}</p>
          </div>
          <strong>{movementAmount(item.kind, item.amountCents, hidden)}</strong>
        </div>
      ))}

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
    </Shell>
  )
}

function headline(money: MonthMoney | null, hidden: boolean) {
  if (!money) return 'Cargando'
  if (hidden && (money.spentCents > 0 || money.incomeCents > 0)) return 'S/ ••••'
  if (money.incomeCents > 0 && money.remainingCents !== null) return `Te quedan ${soles(money.remainingCents)}`
  if (money.spentCents > 0) return `Llevas ${soles(money.spentCents)} gastados`
  return 'Aún sin movimientos'
}

function movementAmount(kind: 'gasto' | 'ingreso', cents: number, hidden: boolean) {
  if (hidden) return kind === 'ingreso' ? '+ S/ ••••' : '− S/ ••••'
  return kind === 'ingreso' ? `+ ${soles(cents)}` : `− ${soles(cents)}`
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
