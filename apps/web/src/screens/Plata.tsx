import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { categoryIcon, categoryTint } from '../categories'
import { CategorySheet, MoneySheet } from '../components/CaptureSheets'
import { MoneyChat } from '../components/MoneyChat'
import { AccountSheet, BillSheet, DebtMoveSheet, DebtSheet } from '../components/PlanSheets'
import { EyeButton, useHideMoney } from '../components/HideMoney'
import { Shell } from '../components/Shell'
import { cardTint } from '../cardTints'
import { currencySymbol, dolares, money, soles } from '../format'
import type { Bill, Debt, DebtMove, MoneyCategory, MoneyPlan, MonthMoney, Movement, PayAccount } from '../types'

export function Plata({ onCreate, onChanged, refresh }: { onCreate: () => void; onChanged: () => void; refresh: number }) {
  const current = currentMonthKey()
  const { hidden, toggle } = useHideMoney()
  const [month, setMonth] = useState(current)
  const [money, setMoney] = useState<MonthMoney | null>(null)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [adding, setAdding] = useState(false)
  const [chat, setChat] = useState(false)
  const [offlineNote, setOfflineNote] = useState(false)
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
      {offlineNote && <p className="hint">Hace falta conexión. Anótalo a mano.</p>}
      <button type="button" className="spend-fab chat" aria-label="Contar un gasto" onClick={() => {
        if (!navigator.onLine || !money) {
          setOfflineNote(!navigator.onLine)
          onCreate()
          return
        }
        setOfflineNote(false)
        setChat(true)
      }}>
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M5 6h14v9H8l-3 3V6Z" />
        </svg>
      </button>
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
                  <span className="meta">{item.accountName ? `${item.accountName} · ` : ''}{movementDate(item.occurredOn)}</span>
                </span>
                <strong className="move-amount">{movementAmount(item.kind, item.amountCents, hidden)}</strong>
                <span className="move-chevron" aria-hidden="true">›</span>
              </button>
            )
          })}
        </div>
      )}
      <nav className="plan-links four">
        <Link className="plan-link cuentas" to="/plata/cuentas">
          <i aria-hidden="true"><WalletIcon /></i>
          Cuentas
        </Link>
        <Link className="plan-link tarjetas" to="/plata/tarjetas">
          <i aria-hidden="true"><CardIcon /></i>
          Tarjetas
        </Link>
        <Link className="plan-link prestamos" to="/plata/prestamos">
          <i aria-hidden="true"><LoanIcon /></i>
          Préstamos
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
      {chat && money && (
        <MoneyChat
          money={money}
          onClose={() => setChat(false)}
          onSaved={onChanged}
          onOffline={() => {
            setChat(false)
            setOfflineNote(true)
            onCreate()
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

export function TarjetasPage() {
  const navigate = useNavigate()
  const { hidden, toggle } = useHideMoney()
  const { plan, reload } = usePlan()
  const cards = plan?.debts.filter((item) => item.kind === 'tarjeta') ?? []
  const [editing, setEditing] = useState<Debt | null | undefined>(undefined)
  const fx = plan?.fxHundredths ?? 340
  const totalPen = cards.reduce((sum, item) => sum + cardDebtPen(item, fx), 0)
  const totalUsd = cards.reduce((sum, item) => sum + item.balanceUsd, 0)

  return (
    <Shell title="Tarjetas" back="/plata">
      <section className="summary">
        <div className="summary-top">
          <p className="label">Deuda total</p>
          <EyeButton hidden={hidden} onToggle={toggle} />
        </div>
        <strong>{plan ? mask(hidden, soles(totalPen)) : '…'}</strong>
        <p>
          {cards.length
            ? `${mask(hidden, soles(cards.reduce((sum, item) => sum + item.balancePen, 0)))} y ${mask(hidden, dolares(totalUsd))}`
            : 'Elige una tarjeta para ver pagos y movimientos.'}
        </p>
      </section>

      {cards.length === 0 && <p className="hint">Agrega una tarjeta para ver línea, disponible y movimientos.</p>}

      <div className="card-list">
        {cards.map((item) => (
          <article key={item.id} className={`credit-card tone-${cardTint(item.tint)}`}>
            <button type="button" className="credit-open" onClick={() => navigate(`/plata/tarjetas/${item.id}`)}>
              <div className="credit-card-top">
                <strong>{item.name}</strong>
              </div>
              <div className="credit-metrics">
                <div>
                  <span>Consumido</span>
                  <strong>{mask(hidden, soles(cardDebtPen(item, fx)))}</strong>
                </div>
                <div>
                  <span>Disponible</span>
                  <strong>{mask(hidden, soles(cardAvailable(item, fx)))}</strong>
                </div>
              </div>
              <div className="credit-track" aria-hidden="true">
                <span style={{ width: `${cardUsedPct(item, fx)}%` }} />
              </div>
              <p className="credit-line">
                Línea de crédito: {item.limitCents ? mask(hidden, soles(item.limitCents)) : 'Sin línea'}
              </p>
            </button>
            <button type="button" className="account-edit" aria-label={`Editar ${item.name}`} onClick={() => setEditing(item)}>
              <PencilIcon />
            </button>
          </article>
        ))}
      </div>

      <button type="button" className="ghost" onClick={() => setEditing(null)}>Agregar tarjeta</button>
      {editing !== undefined && (
        <DebtSheet debt={editing} kind="tarjeta" onClose={() => setEditing(undefined)} onSaved={reload} />
      )}
    </Shell>
  )
}

export function TarjetaDetail() {
  const { id } = useParams()
  const cardId = Number(id)
  const { hidden, toggle } = useHideMoney()
  const { plan, reload } = usePlan()
  const [editing, setEditing] = useState<Debt | null | undefined>(undefined)
  const [addingMove, setAddingMove] = useState(false)
  const [moves, setMoves] = useState<DebtMove[]>([])
  const card = plan?.debts.find((item) => item.id === cardId && item.kind === 'tarjeta')
  const fx = plan?.fxHundredths ?? 340

  useEffect(() => {
    if (!card) {
      setMoves([])
      return
    }
    api.debtMoves(card.id).then(setMoves).catch(() => setMoves([]))
  }, [card?.id, plan])

  function refresh() {
    reload()
  }

  return (
    <Shell back="/plata/tarjetas" action={<EyeButton hidden={hidden} onToggle={toggle} />}>
      {!card && <p className="empty">Esa tarjeta ya no está.</p>}
      {card && (
        <>
          <article className={`credit-card tone-${cardTint(card.tint)}`}>
            <div className="credit-card-top">
              <strong>{card.name}</strong>
              <button type="button" className="account-edit" aria-label={`Editar ${card.name}`} onClick={() => setEditing(card)}>
                <PencilIcon />
              </button>
            </div>
            <div className="credit-metrics">
              <div>
                <span>Consumido</span>
                <strong>{mask(hidden, soles(cardDebtPen(card, fx)))}</strong>
              </div>
              <div>
                <span>Disponible</span>
                <strong>{mask(hidden, soles(cardAvailable(card, fx)))}</strong>
              </div>
            </div>
            <div className="credit-track" aria-hidden="true">
              <span style={{ width: `${cardUsedPct(card, fx)}%` }} />
            </div>
            <p className="credit-line">
              Línea de crédito: {card.limitCents ? mask(hidden, soles(card.limitCents)) : 'Sin línea'}
            </p>
          </article>

          <section className="card-facts">
            <div className="card-fact">
              <span>Prox. pago</span>
              <strong>{nextPayLabel(card.dueDay)}</strong>
            </div>
            <div className="card-fact">
              <span>A pagar</span>
              <strong>
                {mask(hidden, soles(card.cuotaPen))}
                {card.cuotaUsd ? ` · ${mask(hidden, dolares(card.cuotaUsd))}` : ''}
              </strong>
            </div>
            {(card.balancePen > 0 || card.balanceUsd > 0) && (
              <div className="card-fact">
                <span>Consumido</span>
                <strong>
                  {mask(hidden, soles(card.balancePen))}
                  {card.balanceUsd ? ` · ${mask(hidden, dolares(card.balanceUsd))}` : ''}
                </strong>
              </div>
            )}
          </section>

          <div className="section-head">
            <h2>Movimientos</h2>
            <button type="button" className="text-button" onClick={() => setAddingMove(true)}>Anotar</button>
          </div>
          {moves.length === 0 && <p className="empty">Aún no hay consumos ni pagos en esta tarjeta.</p>}
          {moves.length > 0 && (
            <div className="ledger">
              {moves.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.kind === 'pago' ? 'move ingreso' : 'move gasto'}
                  onClick={() => {
                    if (!window.confirm('¿Borrar este movimiento?')) return
                    const done = item.source === 'month'
                      ? api.deleteMovement(item.id)
                      : api.deleteDebtMove(card.id, item.id)
                    void done.then(refresh)
                  }}
                >
                  <span className="move-mark" aria-hidden="true">{(item.note || item.kind).trim().charAt(0).toUpperCase()}</span>
                  <span className="move-copy">
                    <strong>{item.note || (item.kind === 'pago' ? 'Pago' : 'Consumo')}</strong>
                    <span className="meta">{item.kind === 'pago' ? 'Pago' : 'Consumo'} · {movementDate(item.occurredOn)}</span>
                  </span>
                  <strong className="move-amount">{debtMoveAmount(item, hidden)}</strong>
                  <span className="move-chevron" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {editing !== undefined && (
        <DebtSheet debt={editing} kind="tarjeta" onClose={() => setEditing(undefined)} onSaved={refresh} />
      )}
      {addingMove && card && (
        <DebtMoveSheet debtId={card.id} onClose={() => setAddingMove(false)} onSaved={refresh} />
      )}
    </Shell>
  )
}

export function PrestamosPage() {
  const { hidden, toggle } = useHideMoney()
  const { plan, reload } = usePlan()
  const loans = plan?.debts.filter((item) => item.kind === 'prestamo') ?? []
  const [debt, setDebt] = useState<Debt | null | undefined>(undefined)
  const totalPen = loans.reduce((sum, item) => sum + cardDebtPen(item, plan?.fxHundredths ?? 340), 0)
  const totalUsd = loans.reduce((sum, item) => sum + item.balanceUsd, 0)
  const cuotaPen = loans.reduce((sum, item) => sum + item.cuotaPen + Math.floor((item.cuotaUsd * (plan?.fxHundredths ?? 340)) / 100), 0)

  return (
    <Shell title="Préstamos" back="/plata">
      <section className="summary">
        <div className="summary-top">
          <p className="label">Deuda total</p>
          <EyeButton hidden={hidden} onToggle={toggle} />
        </div>
        <strong>{plan ? mask(hidden, soles(totalPen)) : '…'}</strong>
        <p>
          {loans.length
            ? `${mask(hidden, soles(loans.reduce((sum, item) => sum + item.balancePen, 0)))} y ${mask(hidden, dolares(totalUsd))}`
            : 'Cuotas fijas. El sueldo no entra aquí.'}
        </p>
        {cuotaPen > 0 && <p>Cuotas de este mes: {mask(hidden, soles(cuotaPen))}</p>}
      </section>
      {loans.map((item) => (
        <button key={item.id} type="button" className="money-row plan-row" onClick={() => setDebt(item)}>
          <div>
            <strong>{item.name}</strong>
            <p className="meta">{debtMeta(item, hidden)}</p>
          </div>
          <strong>{mask(hidden, debtAmount(item))}</strong>
        </button>
      ))}
      <button type="button" className="ghost" onClick={() => setDebt(null)}>Agregar préstamo</button>
      {debt !== undefined && <DebtSheet debt={debt} kind="prestamo" onClose={() => setDebt(undefined)} onSaved={reload} />}
    </Shell>
  )
}

export function CuentasPage() {
  const navigate = useNavigate()
  const { hidden, toggle } = useHideMoney()
  const { plan, reload } = usePlan()
  const [account, setAccount] = useState<PayAccount | null | undefined>(undefined)

  return (
    <Shell title="Cuentas" back="/plata" action={<EyeButton hidden={hidden} onToggle={toggle} />}>
      {plan?.accounts.map((item) => (
        <article key={item.id} className="account-card">
          <button type="button" className="account-open" onClick={() => navigate(`/plata/cuentas/${item.id}`)}>
            <p className="account-name">{item.name}</p>
            <strong>{hidden ? `${currencySymbol(item.currency)} ••••` : money(item.balanceCents, item.currency)}</strong>
          </button>
          <button type="button" className="account-edit" aria-label={`Editar ${item.name}`} onClick={() => setAccount(item)}>
            <PencilIcon />
          </button>
        </article>
      ))}
      <button type="button" className="ghost" onClick={() => setAccount(null)}>Agregar cuenta</button>
      {account !== undefined && <AccountSheet account={account} onClose={() => setAccount(undefined)} onSaved={reload} />}
    </Shell>
  )
}

export function AccountHistory() {
  const { id } = useParams()
  const accountId = Number(id)
  const current = currentMonthKey()
  const { hidden, toggle } = useHideMoney()
  const { plan, reload } = usePlan()
  const [month, setMonth] = useState(current)
  const [money, setMoney] = useState<MonthMoney | null>(null)
  const [editing, setEditing] = useState<Movement | null>(null)
  const account = plan?.accounts.find((item) => item.id === accountId)
  const moves = (money?.movements ?? []).filter((item) => item.accountId === accountId)

  useEffect(() => {
    api.month(month).then(setMoney).catch(() => setMoney(null))
  }, [month, plan])

  return (
    <Shell title={account?.name ?? 'Cuenta'} back="/plata/cuentas" action={<EyeButton hidden={hidden} onToggle={toggle} />}>
      <div className="month-nav">
        <button type="button" className="month-step" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <p className="kicker">{monthTitle(month, current)}</p>
        <button type="button" className="month-step" aria-label="Mes siguiente" disabled={month === current} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      {money && moves.length === 0 && <p className="empty">Esta cuenta no tiene movimientos en este mes.</p>}
      {moves.length > 0 && (
        <div className="ledger">
          {moves.map((item) => {
            const title = item.note || item.category || (item.kind === 'ingreso' ? 'Ingreso' : 'Gasto')
            return (
              <button key={item.id} type="button" className={item.kind === 'ingreso' ? 'move ingreso' : 'move gasto'} onClick={() => setEditing(item)}>
                <span className="move-mark" aria-hidden="true">{title.trim().charAt(0).toUpperCase()}</span>
                <span className="move-copy">
                  <strong>{title}</strong>
                  <span className="meta">{item.kind === 'ingreso' ? 'Ingreso' : 'Gasto'} · {movementDate(item.occurredOn)}</span>
                </span>
                <strong className="move-amount">{movementAmount(item.kind, item.amountCents, hidden)}</strong>
                <span className="move-chevron" aria-hidden="true">›</span>
              </button>
            )
          })}
        </div>
      )}
      {editing && money && (
        <MoneySheet
          money={money}
          movement={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await api.updateMovement(editing.id, input)
            setEditing(null)
            reload()
          }}
          onDelete={async () => {
            await api.deleteMovement(editing.id)
            setEditing(null)
            reload()
          }}
          onCreateCategory={async (name, kind) => api.createCategory(name, kind)}
        />
      )}
    </Shell>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m13.5 6.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
  return kind === 'gasto' ? `S/\u00A0\u2212${number}` : `S/\u00A0+${number}`
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

function cardDebtPen(debt: Debt, fx: number) {
  return debt.balancePen + Math.floor((debt.balanceUsd * fx) / 100)
}

function cardAvailable(debt: Debt, fx: number) {
  if (!debt.limitCents) return 0
  return Math.max(0, debt.limitCents - cardDebtPen(debt, fx))
}

function cardUsedPct(debt: Debt, fx: number) {
  if (!debt.limitCents) return 0
  return Math.min(100, Math.round((cardDebtPen(debt, fx) / debt.limitCents) * 100))
}

function nextPayLabel(dueDay: number) {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth()
  if (now.getDate() > dueDay) month += 1
  if (month > 11) {
    month = 0
    year += 1
  }
  const last = new Date(year, month + 1, 0).getDate()
  const day = Math.min(dueDay, last)
  return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}`
}

function debtMoveAmount(item: DebtMove, hidden: boolean) {
  if (hidden) return item.currency === 'usd' ? '$ ••••' : 'S/ ••••'
  if (item.currency === 'usd') return item.kind === 'pago' ? dolares(item.amountCents) : `− ${dolares(item.amountCents)}`
  const number = soles(item.amountCents).replace(/^S\/\s*/, '')
  return item.kind === 'pago' ? `S/ ${number}` : `S/ −${number}`
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  )
}

function LoanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 7h16v10H4z" />
      <path d="M8 11h8M8 14h5" />
      <path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V7" />
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
