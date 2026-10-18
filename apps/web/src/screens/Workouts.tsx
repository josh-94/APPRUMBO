import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Shell } from '../components/Shell'
import { todayKey, weekChips, weekStartKey } from '../format'
import type { DayMacros, FoodHit, GymWeek, Meal } from '../types'

export function WorkoutsPage() {
  const today = todayKey()
  const [week, setWeek] = useState<GymWeek | null>(null)
  const [selectedDay, setSelectedDay] = useState(today)
  const [meals, setMeals] = useState<Meal[]>([])
  const [error, setError] = useState('')
  const [addingFoodFor, setAddingFoodFor] = useState<number | null>(null)
  const [newMealTitle, setNewMealTitle] = useState('')

  const chips = useMemo(() => weekChips(), [])
  const planned = useMemo(() => new Set(week?.weekdays ?? []), [week])
  const logs = useMemo(() => new Map((week?.logs ?? []).map((log) => [log.day, log])), [week])
  const dayLog = logs.get(selectedDay)
  const dayMacros = week?.dayMacros.find((item) => item.day === selectedDay) ?? emptyMacros(selectedDay)
  const mealTotals = useMemo(() => sumMeals(meals), [meals])
  const macros = mealTotals.kcal > 0 || meals.length > 0 ? mealTotals : dayMacros

  function reloadWeek() {
    return api.gymWeek().then(setWeek).catch(() => setWeek(null))
  }

  function reloadMeals(day = selectedDay) {
    return api.meals(day).then((data) => setMeals(data.meals)).catch(() => setMeals([]))
  }

  useEffect(() => {
    void reloadWeek()
  }, [])

  useEffect(() => {
    void reloadMeals(selectedDay)
  }, [selectedDay])

  async function togglePlan(weekday: number) {
    const weekStart = week?.weekStart || weekStartKey()
    const next = new Set(week?.weekdays ?? [])
    if (next.has(weekday)) next.delete(weekday)
    else next.add(weekday)
    try {
      setWeek(await api.setGymWeek(weekStart, [...next].sort((a, b) => a - b)))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el plan')
    }
  }

  async function setAttended(attended: boolean, attendedAt?: string) {
    try {
      const log = await api.setGymLog({
        day: selectedDay,
        attended,
        attendedAt: attended ? (attendedAt || currentTime()) : undefined,
      })
      setWeek((prev) => {
        if (!prev) return prev
        const others = prev.logs.filter((item) => item.day !== log.day)
        return { ...prev, logs: [...others, log].sort((a, b) => a.day.localeCompare(b.day)) }
      })
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  async function createMeal(event: FormEvent) {
    event.preventDefault()
    const title = newMealTitle.trim()
    if (!title) return
    try {
      const meal = await api.createMeal({ day: selectedDay, title })
      setMeals((items) => [...items, meal])
      setNewMealTitle('')
      setError('')
      void reloadWeek()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la comida')
    }
  }

  async function removeMeal(id: number) {
    try {
      await api.deleteMeal(id)
      setMeals((items) => items.filter((meal) => meal.id !== id))
      void reloadWeek()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    }
  }

  async function removeItem(mealId: number, itemId: number) {
    try {
      await api.deleteMealItem(mealId, itemId)
      setMeals((items) => items.map((meal) => (
        meal.id === mealId
          ? { ...meal, items: meal.items.filter((item) => item.id !== itemId) }
          : meal
      )))
      void reloadWeek()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    }
  }

  return (
    <Shell title="Entrenamientos" back="/tiempo">
      <section className="summary">
        <p className="label">Esta semana</p>
        <div className="week-row">
          {chips.map((chip, index) => {
            const log = logs.get(chip.key)
            const isPlanned = planned.has(index)
            const attended = Boolean(log?.attended)
            const selected = chip.key === selectedDay
            const className = [
              'day-chip',
              selected ? 'today' : '',
              !selected && isPlanned ? 'planned' : '',
              !selected && attended ? 'attended' : '',
              chip.today && !selected ? 'is-today' : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={chip.key}
                type="button"
                className={className}
                aria-pressed={selected}
                onClick={() => setSelectedDay(chip.key)}
              >
                <small>{chip.label.slice(0, 1)}</small>
                <strong>{attended ? '●' : isPlanned ? '○' : chip.day}</strong>
              </button>
            )
          })}
        </div>
        <p className="meta">Plan de la semana</p>
        <div className="switch-row">
          {chips.map((chip, index) => (
            <button
              key={`plan-${chip.key}`}
              type="button"
              className={planned.has(index) ? 'pill on' : 'pill quiet'}
              onClick={() => void togglePlan(index)}
            >
              {chip.label.slice(0, 1)}
            </button>
          ))}
        </div>
      </section>

      <section className="paper-card home-card">
        <h2 className="section-label">{dayHeading(selectedDay, today)}</h2>
        <label className="habit" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={dayLog?.attended ? 'check on' : 'check'}
            aria-label="Fui al gym"
            onClick={() => void setAttended(!dayLog?.attended, dayLog?.attendedAt || currentTime())}
          />
          <span className="habit-copy">
            <strong>Fui al gym</strong>
            <span className="meta">{dayLog?.attended ? (dayLog.attendedAt ? `A las ${dayLog.attendedAt}` : 'Asistencia marcada') : 'Sin marcar'}</span>
          </span>
        </label>
        {dayLog?.attended && (
          <label className="field">
            Hora
            <input
              type="time"
              value={dayLog.attendedAt || ''}
              onChange={(event) => void setAttended(true, event.target.value)}
            />
          </label>
        )}

        <h3 className="section-label">Macros del día</h3>
        <div className="macro-row">
          <MacroStat label="P" value={`${fmt(macros.proteinG)} g`} />
          <MacroStat label="C" value={`${fmt(macros.carbsG)} g`} />
          <MacroStat label="G" value={`${fmt(macros.fatG)} g`} />
          <MacroStat label="kcal" value={fmt(macros.kcal)} />
        </div>
      </section>

      <h2 className="section-label">Comidas libres</h2>
      {meals.length === 0 && <p className="empty">Añade comidas del día y busca alimentos.</p>}
      {meals.map((meal) => (
        <article key={meal.id} className="goal-card">
          <div className="section-head">
            <strong>{meal.title}</strong>
            <button type="button" className="ghost danger" onClick={() => void removeMeal(meal.id)}>Borrar</button>
          </div>
          {meal.items.length === 0 && <p className="meta">Sin alimentos aún.</p>}
          {meal.items.map((item) => (
            <div key={item.id} className="money-row">
              <div>
                <strong>{item.foodName}</strong>
                <p className="meta">
                  {item.grams} g
                  {item.brand ? ` · ${item.brand}` : ''}
                  {` · P ${fmt(item.proteinG)} · C ${fmt(item.carbsG)} · G ${fmt(item.fatG)} · ${fmt(item.kcal)} kcal`}
                </p>
              </div>
              <button type="button" className="ghost" onClick={() => void removeItem(meal.id, item.id)}>×</button>
            </div>
          ))}
          <button type="button" className="pill quiet" onClick={() => setAddingFoodFor(meal.id)}>
            Añadir alimento
          </button>
        </article>
      ))}

      <form className="switch-row" onSubmit={(event) => void createMeal(event)}>
        <label className="field" style={{ flex: 1, margin: 0 }}>
          Nueva comida
          <input
            value={newMealTitle}
            maxLength={80}
            placeholder="Desayuno, snack…"
            onChange={(event) => setNewMealTitle(event.target.value)}
          />
        </label>
        <button type="submit" className="primary">Crear</button>
      </form>

      {error && <p className="error">{error}</p>}

      {addingFoodFor != null && (
        <FoodSearchSheet
          mealId={addingFoodFor}
          onClose={() => setAddingFoodFor(null)}
          onAdded={(item) => {
            setMeals((items) => items.map((meal) => (
              meal.id === addingFoodFor ? { ...meal, items: [...meal.items, item] } : meal
            )))
            setAddingFoodFor(null)
            void reloadWeek()
          }}
        />
      )}
    </Shell>
  )
}

function FoodSearchSheet({ mealId, onClose, onAdded }: {
  mealId: number
  onClose: () => void
  onAdded: (item: Meal['items'][number]) => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<FoodHit[]>([])
  const [selected, setSelected] = useState<FoodHit | null>(null)
  const [grams, setGrams] = useState('100')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function search(event: FormEvent) {
    event.preventDefault()
    const q = query.trim()
    if (!q) return
    setBusy(true)
    setError('')
    try {
      const data = await api.searchFoods(q)
      setHits(data.foods)
      setSelected(null)
      if (data.foods.length === 0) setError('No encontré ese alimento.')
    } catch (err) {
      setHits([])
      setError(err instanceof Error ? err.message : 'No pude buscar alimentos ahora.')
    } finally {
      setBusy(false)
    }
  }

  async function addFood(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const portion = Math.max(1, Math.round(Number(grams.replace(',', '.') || 0)))
    if (!portion) {
      setError('Indica los gramos')
      return
    }
    const macros = scaleMacros(selected, portion)
    setBusy(true)
    setError('')
    try {
      const item = await api.addMealItem(mealId, {
        foodName: selected.name,
        brand: selected.brand || '',
        offId: selected.id || '',
        grams: portion,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        kcal: macros.kcal,
      })
      onAdded(item)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setBusy(false)
    }
  }

  const preview = selected ? scaleMacros(selected, Math.max(1, Math.round(Number(grams.replace(',', '.') || 0)))) : null

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void (selected ? addFood(event) : search(event))}>
        <div className="sheet-handle" />
        <h2>Añadir alimento</h2>
        <label className="field">
          Buscar
          <input
            value={query}
            autoFocus
            placeholder="Ej. yogurt, pan, pollo"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!selected && (
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Buscando…' : 'Buscar'}
          </button>
        )}
        {!selected && hits.map((hit) => (
          <button
            key={`${hit.id}-${hit.name}`}
            type="button"
            className="goal-card"
            style={{ textAlign: 'left', width: '100%' }}
            onClick={() => setSelected(hit)}
          >
            <strong>{hit.name}</strong>
            <p className="meta">
              {hit.brand || 'Sin marca'}
              {` · ${fmt(hit.kcal)} kcal / ${hit.perGrams || 100} g`}
            </p>
          </button>
        ))}
        {selected && (
          <>
            <p className="meta">{selected.name}{selected.brand ? ` · ${selected.brand}` : ''}</p>
            <label className="field">
              Gramos
              <input
                inputMode="numeric"
                value={grams}
                onChange={(event) => setGrams(event.target.value)}
              />
            </label>
            {preview && (
              <p className="meta">
                P {fmt(preview.proteinG)} · C {fmt(preview.carbsG)} · G {fmt(preview.fatG)} · {fmt(preview.kcal)} kcal
              </p>
            )}
            <button type="submit" className="primary" disabled={busy}>Añadir</button>
            <button type="button" className="ghost" onClick={() => setSelected(null)}>Otra búsqueda</button>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}

function MacroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="macro-stat">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function emptyMacros(day: string): DayMacros {
  return { day, proteinG: 0, carbsG: 0, fatG: 0, kcal: 0 }
}

function sumMeals(meals: Meal[]): DayMacros {
  return meals.reduce((acc, meal) => {
    for (const item of meal.items) {
      acc.proteinG += item.proteinG
      acc.carbsG += item.carbsG
      acc.fatG += item.fatG
      acc.kcal += item.kcal
    }
    return acc
  }, emptyMacros(''))
}

function scaleMacros(hit: FoodHit, grams: number) {
  const base = hit.perGrams > 0 ? hit.perGrams : 100
  const factor = grams / base
  return {
    proteinG: round1(hit.proteinG * factor),
    carbsG: round1(hit.carbsG * factor),
    fatG: round1(hit.fatG * factor),
    kcal: round1(hit.kcal * factor),
  }
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function fmt(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function currentTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function dayHeading(day: string, today: string) {
  if (day === today) return 'Hoy'
  const [y, m, d] = day.split('-').map(Number)
  const text = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d))
  return text.charAt(0).toUpperCase() + text.slice(1)
}
