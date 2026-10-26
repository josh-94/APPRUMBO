import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { categoryIcon, categoryTint } from '../categories'
import { CategorySheet, MoneySheet } from '../components/CaptureSheets'
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
  const [tab, setTab] = useState<'resumen' | 'movimientos'>('movimientos')
  const [money, setMoney] = useState<MonthMoney | null>(null)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'todos' | 'gasto' | 'ingreso'>('todos')
  const viewingNow = month === current
  const rows = spendRows(money)
  const tallest = Math.max(...rows.map((row) => row.cents), 1)
  const dayBars = daySpendBars(money)
  const filtered = (money?.movements ?? []).filter((item) => {
    if (kindFilter !== 'todos' && item.kind !== kindFilter) return false
    const title = `${item.note} ${item.category} ${item.accountName}`.toLowerCase()
    return !query.trim() || title.includes(query.trim().toLowerCase())
  })

  useEffect(() => {
    api.month(month).then(setMoney).catch(() => setMoney(null))
  }, [month, refresh])

  return (
    <Shell tabs>
      <div className="month-nav">
        <button type="button" className="month-step" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <p className="month-title">{monthTitle(month, current)}</p>
        <button type="button" className="month-step" aria-label="Mes siguiente" disabled={viewingNow} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      <section className="summary home-card">
        <div className="summary-top">
          <p className="label">Tu mes</p>
          <EyeButton hidden={hidden} onToggle={toggle} />
        </div>
        <strong>{headline(money, hidden, viewingNow)}</strong>
        <p>Ingresos menos gastos este mes.</p>
      </section>
      <div className="switch-row plata-tabs">
        <button type="button" className={tab === 'movimientos' ? 'pill on' : 'pill quiet'} onClick={() => setTab('movimientos')}>Movimientos</button>
        <button type="button" className={tab === 'resumen' ? 'pill on' : 'pill quiet'} onClick={() => setTab('resumen')}>Resumen</button>
        <Link className="pill quiet" to="/plata/metas">Metas</Link>
      </div>
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
          Pagos
        </Link>
      </nav>

      {tab === 'resumen' && (
        <>
          <section className="chart-card">
            <h2 className="section-label">Gasto por categoría</h2>
            <DonutChart rows={rows} hidden={hidden} currency={money?.currency || 'PEN'} />
          </section>
          <section className="chart-card">
            <div className="section-head">
              <h2 className="section-label">Gasto por día</h2>
              <span className="meta">
                {dayBars.peakDay
                  ? `Pico día ${dayBars.peakDay}`
                  : dayBars.avg
                    ? `Prom. ${hidden ? '••••' : soles(dayBars.avg, money?.currency || 'PEN')}`
                    : ''}
              </span>
            </div>
            <DayBars
              bars={dayBars.bars}
              avg={dayBars.avg}
              max={dayBars.max}
              peakDay={dayBars.peakDay}
              hidden={hidden}
              currency={money?.currency || 'PEN'}
              todayDay={viewingNow ? new Date().getDate() : 0}
            />
            {dayBars.peakDay > 0 && (
              <p className="day-bars-foot">
                {hidden ? '••••' : soles(dayBars.peakCents, money?.currency || 'PEN')}
                {dayBars.avg > 0 && !hidden ? ` · prom. ${soles(dayBars.avg, money?.currency || 'PEN')}` : ''}
              </p>
            )}
          </section>
        </>
      )}

      {tab === 'movimientos' && (
        <>
          <div className="spend-row">
            {rows.map((row) => (
              <div key={row.category.id} className="spend-col">
                <span className={`spend-bar tint ${categoryTint(row.category.tint)}`} style={{ height: barHeight(row.cents, tallest) }}>
                  <span className="spend-icon" aria-hidden="true">{categoryIcon(row.category.icon)}</span>
                </span>
                <strong>{hidden ? '••••' : shortAmount(row.cents, money?.currency || 'PEN')}</strong>
                <span className="spend-name">{row.category.name}</span>
              </div>
            ))}
            <button type="button" className="spend-col add" onClick={() => setAdding(true)}>
              <span className="spend-bar add">+</span>
              <span className="spend-name">Añadir categoría</span>
            </button>
          </div>
          <label className="field">
            <input value={query} placeholder="Buscar movimiento…" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="switch-row">
            {(['todos', 'gasto', 'ingreso'] as const).map((value) => (
              <button key={value} type="button" className={kindFilter === value ? 'pill on' : 'pill quiet'} onClick={() => setKindFilter(value)}>
                {value === 'todos' ? 'Todos' : value === 'gasto' ? 'Gastos' : 'Ingresos'}
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="empty">{viewingNow ? 'Aún no registras nada este mes. Empieza con lo último que gastaste.' : 'En este mes no anotaste nada.'}</p>
          )}
          {filtered.length > 0 && (
            <div className="ledger">
              {filtered.map((item) => {
                const title = item.note || item.category || (item.kind === 'ingreso' ? 'Ingreso' : 'Gasto')
                return (
                  <button key={item.id} type="button" className={item.kind === 'ingreso' ? 'move ingreso' : 'move gasto'} onClick={() => setEditing(item)}>
                    <span className="move-mark" aria-hidden="true">{title.trim().charAt(0).toUpperCase()}</span>
                    <span className="move-copy">
                      <strong>{title}</strong>
                      <span className="meta">
                        {[item.category, item.accountName, movementDate(item.occurredOn)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <strong className="move-amount">{movementAmount(item.kind, item.amountCents, item.currency, money?.currency || 'PEN', hidden)}</strong>
                    <span className="move-chevron" aria-hidden="true">›</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      <button type="button" className="spend-fab" aria-label="Anotar gasto" onClick={() => { setMonth(current); onCreate() }}>
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
        </svg>
      </button>
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
                Línea de crédito: {item.limitCents ? mask(hidden, cardLimitLabel(item)) : 'Sin línea'}
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
              Línea de crédito: {card.limitCents ? mask(hidden, cardLimitLabel(card)) : 'Sin línea'}
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
        <p className="month-title">{monthTitle(month, current)}</p>
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
                  <span className="meta">
                    {[item.category || (item.kind === 'ingreso' ? 'Ingreso' : 'Gasto'), movementDate(item.occurredOn)].join(' · ')}
                  </span>
                </span>
                <strong className="move-amount">{movementAmount(item.kind, item.amountCents, item.currency, money?.currency || 'PEN', hidden)}</strong>
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

function movePenCents(move: Movement, fx: number) {
  if (move.currency === 'usd') return Math.floor((move.amountCents * fx) / 100)
  return move.amountCents
}

function spendRows(money: MonthMoney | null) {
  const fx = money?.fxHundredths ?? 340
  const totals = new Map<number, number>()
  for (const move of money?.movements ?? []) {
    if (move.kind !== 'gasto' || !move.categoryId) continue
    totals.set(move.categoryId, (totals.get(move.categoryId) ?? 0) + movePenCents(move, fx))
  }
  return (money?.categories ?? [])
    .filter((item) => item.kind === 'gasto')
    .map((category) => ({ category, cents: totals.get(category.id) ?? 0 }))
    .sort((a, b) => b.cents - a.cents || a.category.position - b.category.position)
}

function daySpendBars(money: MonthMoney | null) {
  const fx = money?.fxHundredths ?? 340
  const byDay = new Map<number, number>()
  for (const move of money?.movements ?? []) {
    if (move.kind !== 'gasto') continue
    const day = Number(move.occurredOn.slice(8, 10))
    byDay.set(day, (byDay.get(day) ?? 0) + movePenCents(move, fx))
  }
  const daysInMonth = money?.movements[0]
    ? new Date(Number(money.movements[0].occurredOn.slice(0, 4)), Number(money.movements[0].occurredOn.slice(5, 7)), 0).getDate()
    : 31
  const bars = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    cents: byDay.get(index + 1) ?? 0,
  }))
  const active = bars.filter((item) => item.cents > 0)
  const avg = active.length ? Math.round(active.reduce((sum, item) => sum + item.cents, 0) / active.length) : 0
  const peak = bars.reduce((best, item) => (item.cents > best.cents ? item : best), { day: 0, cents: 0 })
  const rawMax = Math.max(...bars.map((item) => item.cents), 1)
  const displayMax = avg > 0 ? Math.max(avg * 2, ...bars.filter((item) => item.cents <= avg * 3).map((item) => item.cents), 1) : rawMax
  return {
    bars,
    avg,
    max: displayMax,
    peakDay: peak.cents ? peak.day : 0,
    peakCents: peak.cents,
    truncated: rawMax > displayMax,
  }
}

const donutPalette = [
  '#3C5FB8',
  '#066B49',
  '#8E3A9E',
  '#C46B66',
  '#0A7C8A',
  '#B57A1A',
  '#5B4B9A',
  '#2A6F4E',
  '#A14D6D',
  '#3E6B8A',
]

function DonutChart({ rows, hidden, currency }: { rows: ReturnType<typeof spendRows>; hidden: boolean; currency: string }) {
  const total = rows.reduce((sum, row) => sum + row.cents, 0) || 1
  const spent = rows.reduce((sum, row) => sum + row.cents, 0)
  let offset = 0
  const slices = rows.filter((row) => row.cents > 0).map((row, index) => {
    const pct = (row.cents / total) * 100
    const color = donutPalette[index % donutPalette.length]
    const slice = { ...row, pct, offset, color }
    offset += pct
    return slice
  })
  const gradient = slices.length
    ? `conic-gradient(${slices.map((slice) => `${slice.color} ${slice.offset}% ${slice.offset + slice.pct}%`).join(', ')})`
    : 'conic-gradient(#E3ECE4 0% 100%)'
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: gradient }}>
        <div className="donut-hole">
          <strong>{hidden ? '••••' : soles(spent, currency)}</strong>
        </div>
      </div>
      <ul className="donut-legend">
        {slices.slice(0, 6).map((slice) => (
          <li key={slice.category.id}>
            <span className="donut-legend-name">
              <i className="donut-swatch" style={{ background: slice.color }} aria-hidden="true" />
              {slice.category.name}
            </span>
            <strong>{hidden ? '••••' : soles(slice.cents, currency)} · {Math.round(slice.pct)}%</strong>
          </li>
        ))}
        {slices.length === 0 && <li><span>Sin gastos</span><strong>{soles(0, currency)}</strong></li>}
      </ul>
    </div>
  )
}

function DayBars({ bars, avg, max, peakDay, hidden, currency, todayDay }: {
  bars: { day: number; cents: number }[]
  avg: number
  max: number
  peakDay: number
  hidden: boolean
  currency: string
  todayDay: number
}) {
  const last = bars.length
  return (
    <div className="day-bars" aria-hidden={hidden}>
      <div className="day-bars-plot">
        {bars.map((bar) => {
          const hot = avg > 0 && bar.cents > avg * 1.5
          const peak = bar.day === peakDay && bar.cents > 0
          const height = bar.cents ? Math.max(6, Math.round((Math.min(bar.cents, max) / max) * 104)) : 3
          const cut = bar.cents > max
          return (
            <div
              key={bar.day}
              className={peak ? 'day-bar-col peak' : 'day-bar-col'}
              title={hidden || !bar.cents ? undefined : `Día ${bar.day}: ${soles(bar.cents, currency)}`}
            >
              {cut && <span className="day-bar-cut" aria-hidden="true" />}
              <span className={hot || peak ? 'day-bar hot' : bar.cents ? 'day-bar' : 'day-bar empty'} style={{ height }} />
            </div>
          )
        })}
        {avg > 0 && (
          <span
            className="day-avg-line"
            style={{ bottom: `${Math.round((Math.min(avg, max) / max) * 104)}px` }}
            title={hidden ? undefined : `Promedio ${soles(avg, currency)}`}
          />
        )}
      </div>
      <div className="day-bars-axis">
        {bars.map((bar) => {
          const mark = bar.day === 1 || bar.day === 15 || bar.day === last || bar.day === todayDay || bar.day === peakDay
          return (
            <span
              key={bar.day}
              className={
                bar.day === todayDay ? 'day-axis-label today'
                  : bar.day === peakDay ? 'day-axis-label peak'
                    : 'day-axis-label'
              }
            >
              {mark ? bar.day : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function barHeight(cents: number, tallest: number) {
  return 72 + Math.round((cents / tallest) * 108)
}

function shortAmount(cents: number, currency = 'PEN') {
  if (!cents) return '0'
  return soles(cents, currency)
}

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return currentMonthKey(date)
}

function monthTitle(key: string, _current?: string) {
  const [year, month] = key.split('-').map(Number)
  const nowYear = new Date().getFullYear()
  const text = new Intl.DateTimeFormat('es', {
    month: 'long',
    ...(year === nowYear ? {} : { year: 'numeric' as const }),
  }).format(new Date(year, month - 1, 1))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function headline(money: MonthMoney | null, hidden: boolean, viewingNow: boolean) {
  if (!money) return 'Cargando'
  const code = money.currency || 'PEN'
  const sym = currencySymbol(code)
  if (hidden && (money.spentCents > 0 || money.incomeCents > 0)) return `${sym} ••••`
  if (money.incomeCents > 0 && money.remainingCents !== null) {
    return viewingNow ? `Te quedan ${soles(money.remainingCents, code)}` : `Te quedaron ${soles(money.remainingCents, code)}`
  }
  if (money.spentCents > 0) return viewingNow ? `Llevas ${soles(money.spentCents, code)} gastados` : `Gastaste ${soles(money.spentCents, code)}`
  return viewingNow ? 'Aún sin movimientos' : 'Sin movimientos'
}

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function movementDate(day: string) {
  const [, month, date] = day.split('-').map(Number)
  if (!month || !date) return day
  return `${date} ${monthNames[month - 1]}`
}

function movementAmount(kind: 'gasto' | 'ingreso', cents: number, currency: 'pen' | 'usd' | undefined, homeCurrency: string, hidden: boolean) {
  if (currency === 'usd') {
    if (hidden) return '$ ••••'
    const number = dolares(cents).replace(/^\$\s*/, '')
    return kind === 'gasto' ? `$\u00A0\u2212${number}` : `$\u00A0+${number}`
  }
  const code = homeCurrency || 'PEN'
  const sym = currencySymbol(code)
  if (hidden) return `${sym} ••••`
  const formatted = soles(cents, code)
  const number = formatted.slice(sym.length).trim()
  return kind === 'gasto' ? `${sym}\u00A0\u2212${number}` : `${sym}\u00A0+${number}`
}

function mask(hidden: boolean, text: string, homeCurrency = 'PEN') {
  if (!hidden) return text
  return text.startsWith('$') ? '$ ••••' : `${currencySymbol(homeCurrency)} ••••`
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

function cardLimitPen(debt: Debt, fx: number) {
  if (!debt.limitCents) return 0
  if (debt.currency === 'usd') return Math.floor((debt.limitCents * fx) / 100)
  return debt.limitCents
}

function cardLimitLabel(debt: Debt) {
  return debt.currency === 'usd' ? dolares(debt.limitCents) : soles(debt.limitCents)
}

function cardAvailable(debt: Debt, fx: number) {
  const limit = cardLimitPen(debt, fx)
  if (!limit) return 0
  return Math.max(0, limit - cardDebtPen(debt, fx))
}

function cardUsedPct(debt: Debt, fx: number) {
  const limit = cardLimitPen(debt, fx)
  if (!limit) return 0
  return Math.min(100, Math.round((cardDebtPen(debt, fx) / limit) * 100))
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
