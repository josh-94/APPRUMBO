import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Shell } from '../components/Shell'
import { centsToInput, soles, todayKey } from '../format'
import type { Goal, PayAccount } from '../types'

export function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [accounts, setAccounts] = useState<PayAccount[]>([])
  const [editing, setEditing] = useState<Goal | null | undefined>(undefined)
  const [paying, setPaying] = useState<Goal | null>(null)

  function reload() {
    api.goals().then((data) => setGoals(data.goals)).catch(() => setGoals([]))
    api.plan().then((data) => setAccounts(data.accounts)).catch(() => setAccounts([]))
  }

  useEffect(() => { reload() }, [])

  return (
    <Shell title="Metas" back="/plata">
      {goals.length === 0 && <p className="empty">Define una meta de ahorro con monto y fecha.</p>}
      {goals.map((goal) => (
        <article key={goal.id} className="goal-card">
          <div className="goal-top">
            <div>
              <strong>{goal.name}</strong>
              <p className="meta">
                {soles(goal.savedCents)} de {soles(goal.targetCents)}
                {goal.daysLeft != null ? ` · ${goal.daysLeft >= 0 ? `faltan ${goal.daysLeft} d` : 'vencida'}` : ''}
              </p>
            </div>
            <div className="goal-ring" style={{ ['--pct' as string]: `${goal.pct}%` }}>
              <span>{goal.pct}%</span>
            </div>
          </div>
          <div className="switch-row">
            <button type="button" className="pill on" onClick={() => setPaying(goal)}>Abonar</button>
            <button type="button" className="pill quiet" onClick={() => setEditing(goal)}>Editar</button>
          </div>
        </article>
      ))}
      <button type="button" className="ghost" onClick={() => setEditing(null)}>Nueva meta</button>
      {editing !== undefined && (
        <GoalSheet
          goal={editing}
          accounts={accounts}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); reload() }}
        />
      )}
      {paying && (
        <ContributeSheet
          goal={paying}
          accounts={accounts}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); reload() }}
        />
      )}
    </Shell>
  )
}

function GoalSheet({ goal, accounts, onClose, onSaved }: {
  goal: Goal | null
  accounts: PayAccount[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? centsToInput(goal.targetCents) : '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [accountId, setAccountId] = useState(goal?.accountId || accounts[0]?.id || 0)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const targetCents = Math.round(Number(target.replace(',', '.')) * 100)
    if (!name.trim() || !targetCents) {
      setError('Pon nombre y monto objetivo.')
      return
    }
    try {
      await api.saveGoal({
        id: goal?.id,
        name: name.trim(),
        kind: 'ahorro',
        targetCents,
        deadline: deadline || undefined,
        accountId: accountId || undefined,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>{goal ? 'Editar meta' : 'Nueva meta'}</h2>
        <label className="field">Nombre<input value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field">Objetivo (S/)<input inputMode="decimal" value={target} required onChange={(event) => setTarget(event.target.value)} /></label>
        <label className="field">Fecha límite<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        {accounts.length > 0 && (
          <label className="field">
            Cuenta de abono
            <select value={accountId} onChange={(event) => setAccountId(Number(event.target.value))}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Guardar</button>
        {goal && (
          <button type="button" className="ghost danger" onClick={() => void api.deleteGoal(goal.id).then(onSaved)}>
            Archivar
          </button>
        )}
      </form>
    </div>
  )
}

function ContributeSheet({ goal, accounts, onClose, onSaved }: {
  goal: Goal
  accounts: PayAccount[]
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(goal.accountId || accounts[0]?.id || 0)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const amountCents = Math.round(Number(amount.replace(',', '.')) * 100)
    if (!amountCents) {
      setError('Monto inválido')
      return
    }
    try {
      await api.contributeGoal(goal.id, { amountCents, accountId, day: todayKey() })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abonar')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void submit(event)}>
        <div className="sheet-handle" />
        <h2>Abonar a {goal.name}</h2>
        <label className="field">Monto<input inputMode="decimal" value={amount} autoFocus required onChange={(event) => setAmount(event.target.value)} /></label>
        {accounts.length > 0 && (
          <label className="field">
            Desde
            <select value={accountId} onChange={(event) => setAccountId(Number(event.target.value))}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Abonar</button>
      </form>
    </div>
  )
}
