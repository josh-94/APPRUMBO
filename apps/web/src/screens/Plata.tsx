import type { MonthMoney } from '../types'
import { soles } from '../format'
import { Shell } from '../components/Shell'

export function Plata({ money, onCreate }: { money: MonthMoney | null; onCreate: () => void }) {
  return (
    <Shell tabs>
      <p className="kicker">Este mes</p>
      <h1 className="headline">{headline(money)}</h1>
      <button type="button" className="primary" onClick={onCreate}>Anotar gasto</button>
      {money && money.movements.length === 0 && (
        <p className="empty">Aún no registras nada este mes. Empieza con lo último que gastaste.</p>
      )}
      {money?.movements.map((item) => (
        <div key={item.id} className={item.kind === 'ingreso' ? 'money-row ingreso' : 'money-row'}>
          <div>
            <strong>{item.category || (item.kind === 'ingreso' ? 'Ingreso' : 'Gasto')}</strong>
            <p className="meta">{item.occurredOn}</p>
          </div>
          <strong>{item.kind === 'ingreso' ? `+ ${soles(item.amountCents)}` : `− ${soles(item.amountCents)}`}</strong>
        </div>
      ))}
    </Shell>
  )
}

function headline(money: MonthMoney | null) {
  if (!money) return 'Cargando'
  if (money.incomeCents > 0 && money.remainingCents !== null) return `Te quedan ${soles(money.remainingCents)}`
  if (money.spentCents > 0) return `Llevas ${soles(money.spentCents)} gastados`
  return 'Aún sin movimientos'
}
