import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { categoryIcon, categoryTint } from '../categories'
import { CategorySheet, MoneySheet } from '../components/CaptureSheets'
import { AccountSheet, BillSheet, DebtSheet } from '../components/PlanSheets'
import { EyeButton, useHideMoney } from '../components/HideMoney'
import { Shell } from '../components/Shell'
import { dolares, soles } from '../format'
import type { Bill, Debt, MoneyCategory, MoneyPlan, MonthMoney, Movement, PayAccount } from '../types'

export function Plata({ onCreate, onChanged, refresh }: { onCreate: () => void; onChanged: () => void; refresh: number }) {
  const current = currentMonthKey()
  const { hidden, toggle } = useHideMoney()
  const [month, setMonth] = useState(current)
  const [money, setMoney] = useState<MonthMoney | null>(null)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [adding, setAdding] = useState(false)
  const viewingNow = month === current
  const rows = spendRows(money)
  const tallest = Math.max(...rows.map((row) => row.cents), 1)

  useEffect(() => {
    api.month(month).then(setMoney).catch(() => setMoney(null))
  }, [month, refresh])

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
      <div className="spend-row">
        {rows.map((row) => (
          <div key={row.category.id} className="spend-col">
            <span className={`spend-bar tint ${categoryTint(row.category.tint)}`} style={{ height: barHeight(row.cents, tallest) }}>
              <span className="spend-icon" aria-hidden="true">{categoryIcon(row.category.icon)}</span>
            </span>
            <strong>{hidden ? '••••' : shortAmount(row.cents)}</strong>
            <span className="spend-name">{row.category.name}</span>
          </div>
        ))}
        <button type="button" className="spend-col add" onClick={() => setAdding(true)}>
          <span className="spend-bar add">+</span>
          <span className="spend-name">Añadir categoría</span>
        </button>
      </div>
      <button type="button" className="spend-fab" aria-label="Anotar gasto" onClick={() => { setMonth(current); onCreate() }}>
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
        </svg>
      </button>
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
      <nav className="plan-links">
        <Link className="plan-link deudas" to="/plata/deudas">
          <i aria-hidden="true"><CardIcon /></i>
          Deudas
        </Link>
        <Link className="plan-link cuentas" to="/plata/cuentas">
          <i aria-hidden="true"><WalletIcon /></i>
          Cuentas
        </Link>
        <Link className="plan-link pagos" to="/plata/pagos">
          <i aria-hidden="true"><CalendarIcon /></i>
          Pagos recurrentes
        </Link>
      </nav>
      {adding && (
        <CategorySheet
          onClose={() => setAdding(false)}
          onSave={async (name, icon, tint) => {
            await api.createCategory(name, 'gasto', { icon, tint })
            onChanged()
          }}
        />
      )}
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

export function DeudasPage() {
  const { hidden, toggle } = useHideMoney()
  const { plan, reload } = usePlan()
  const [debt, setDebt] = useState<Debt | null | undefined>(undefined)

  return (
    <Shell title="Deudas" back="/plata">
      <section className="summary">
        <div className="summary-top">
          <p className="label">Deuda total</p>
          <EyeButton hidden={hidden} onToggle={toggle} />
        </div>
        <strong>{plan ? mask(hidden, soles(plan.debtTotalPen)) : '…'}</strong>
        <p>
          {plan && (plan.debtPen > 0 || plan.debtUsd > 0)
            ? `${mask(hidden, soles(plan.debtPen))} y ${mask(hidden, dolares(plan.debtUsd))}`
            : 'Tarjetas y préstamos. El sueldo no entra aquí.'}
        </p>
        {plan && plan.cuotaTotalPen > 0 && <p>Cuotas de este mes: {mask(hidden, soles(plan.cuotaTotalPen))}</p>}
      </section>
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
      {debt !== undefined && <DebtSheet debt={debt} onClose={() => setDebt(undefined)} onSaved={reload} />}
    </Shell>
  )
}

export function CuentasPage() {
  const { hidden, toggle } = useHideMoney()
  const { plan, reload } = usePlan()
  const [account, setAccount] = useState<PayAccount | null | undefined>(undefined)

  return (
    <Shell title="Cuentas" back="/plata" action={<EyeButton hidden={hidden} onToggle={toggle} />}>
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
      {account !== undefined && <AccountSheet account={account} onClose={() => setAccount(undefined)} onSaved={reload} />}
    </Shell>
  )
}

export function PagosPage() {
  const { hidden, toggle } = useHideMoney()
  const { plan, reload } = usePlan()
  const [categories, setCategories] = useState<MoneyCategory[]>([])
  const [bill, setBill] = useState<Bill | null | undefined>(undefined)

  useEffect(() => {
    api.month().then((money) => setCategories(money.categories)).catch(() => setCategories([]))
  }, [plan])

  return (
    <Shell title="Pagos recurrentes" back="/plata" action={<EyeButton hidden={hidden} onToggle={toggle} />}>
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
      {bill !== undefined && <BillSheet bill={bill} categories={categories} onClose={() => setBill(undefined)} onSaved={reload} />}
    </Shell>
  )
}

function usePlan() {
  const [plan, setPlan] = useState<MoneyPlan | null>(null)
  function reload() {
    api.plan().then(setPlan).catch(() => setPlan(null))
  }
  useEffect(() => {
    reload()
  }, [])
  return { plan, reload }
}

function spendRows(money: MonthMoney | null) {
  const totals = new Map<number, number>()
  for (const move of money?.movements ?? []) {
    if (move.kind !== 'gasto' || !move.categoryId) continue
    totals.set(move.categoryId, (totals.get(move.categoryId) ?? 0) + move.amountCents)
  }
  return (money?.categories ?? [])
    .filter((item) => item.kind === 'gasto')
    .map((category) => ({ category, cents: totals.get(category.id) ?? 0 }))
    .sort((a, b) => b.cents - a.cents || a.category.position - b.category.position)
}

function barHeight(cents: number, tallest: number) {
  return 72 + Math.round((cents / tallest) * 108)
}

function shortAmount(cents: number) {
  if (!cents) return '0'
  return soles(cents)
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

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M16 12.5h3M7 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}
