import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Shell } from '../components/Shell'
import { todayKey, weekdayLabel, weekChips, weekStartKey } from '../format'
import type { DayMacros, FoodHit, GymWeek, Meal } from '../types'

export function WorkoutsPage() {
  const today = todayKey()
  const [week, setWeek] = useState<GymWeek | null>(null)
  const [selectedDay, setSelectedDay] = useState(today)
  const [meals, setMeals] = useState<Meal[]>([])
  const [error, setError] = useState('')
  const [addingFoodFor, setAddingFoodFor] = useState<number | null>(null)
  const [pickingMeal, setPickingMeal] = useState(false)
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

  async function createMealWithTitle(title: string, openFood = false) {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      const meal = await api.createMeal({ day: selectedDay, title: trimmed })
      setMeals((items) => [...items, meal])
      setNewMealTitle('')
      setError('')
      setPickingMeal(false)
      if (openFood) setAddingFoodFor(meal.id)
      void reloadWeek()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la comida')
    }
  }

  async function createMeal(event: FormEvent) {
    event.preventDefault()
    await createMealWithTitle(newMealTitle)
  }

  async function startAddFood(mealId?: number) {
    if (mealId != null) {
      setPickingMeal(false)
      setAddingFoodFor(mealId)
      return
    }
    if (meals.length === 1) {
      setAddingFoodFor(meals[0].id)
      return
    }
    if (meals.length === 0) {
      await createMealWithTitle('Comida', true)
      return
    }
    setPickingMeal(true)
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

  const selectedChip = chips.find((chip) => chip.key === selectedDay)
  const selectedPlanned = selectedChip ? planned.has(selectedChip.weekday) : false
  const plannedCount = planned.size
  const attendedCount = chips.filter((chip) => logs.get(chip.key)?.attended).length

  return (
    <Shell title="Entrenamientos" back="/tiempo">
      <section className="gym-panel paper-card">
        <div className="gym-panel-head">
          <div>
            <h2 className="section-label">Esta semana</h2>
            <p className="meta">Toca un día · ✓ fuiste · borde planeado</p>
          </div>
          <p className="gym-panel-count">{attendedCount} asist. · {plannedCount} plan</p>
        </div>
        <div className="gym-week">
          {chips.map((chip, index) => {
            const log = logs.get(chip.key)
            const isPlanned = planned.has(index)
            const attended = Boolean(log?.attended)
            const selected = chip.key === selectedDay
            const className = [
              'gym-day',
              selected ? 'is-selected' : '',
              chip.today ? 'is-today' : '',
              attended ? 'is-attended' : '',
              !attended && isPlanned ? 'is-planned' : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={chip.key}
                type="button"
                className={className}
                aria-pressed={selected}
                aria-label={`${weekdayLabel(chip.weekday + 1)} ${chip.day}${attended ? ', asististe' : isPlanned ? ', planeado' : ''}`}
                onClick={() => setSelectedDay(chip.key)}
              >
                <small>{weekdayLabel(chip.weekday + 1)}</small>
                <strong>{chip.day}</strong>
                <span className="gym-day-mark" aria-hidden>
                  {attended ? '✓' : isPlanned ? '·' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="gym-panel paper-card">
        <h2 className="section-label">Plan de entrenamiento</h2>
        <p className="meta">Días que quieres ir</p>
        <div className="gym-plan">
          {chips.map((chip, index) => (
            <button
              key={`plan-${chip.key}`}
              type="button"
              className={planned.has(index) ? 'gym-plan-day on' : 'gym-plan-day'}
              aria-pressed={planned.has(index)}
              onClick={() => void togglePlan(index)}
            >
              <small>{weekdayLabel(chip.weekday + 1)}</small>
              <strong>{chip.day}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="gym-panel paper-card">
        <h2 className="section-label">{dayHeading(selectedDay, today)}</h2>
        <p className="meta gym-day-status">
          {selectedPlanned ? 'Día planeado' : 'Sin plan este día'}
          {dayLog?.attended ? ' · asistencia marcada' : ''}
        </p>
        <button
          type="button"
          className={dayLog?.attended ? 'gym-attend on' : 'gym-attend'}
          onClick={() => void setAttended(!dayLog?.attended, dayLog?.attendedAt || currentTime())}
        >
          <span className={dayLog?.attended ? 'check on' : 'check'} aria-hidden />
          <span className="gym-attend-copy">
            <strong>Fui al gym</strong>
            <span className="meta">
              {dayLog?.attended
                ? (dayLog.attendedAt ? `A las ${dayLog.attendedAt}` : 'Asistencia marcada')
                : 'Toca si entrenaste'}
            </span>
          </span>
        </button>
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

        <div className="macro-summary">
          <div className="macro-kcal">
            <strong>{fmt(macros.kcal)}</strong>
            <span>kcal hoy</span>
          </div>
          <div className="macro-bars">
            <MacroBar label="Proteína" short="P" grams={macros.proteinG} kcal={macros.proteinG * 4} totalKcal={macros.kcal} />
            <MacroBar label="Carbos" short="C" grams={macros.carbsG} kcal={macros.carbsG * 4} totalKcal={macros.kcal} />
            <MacroBar label="Grasas" short="G" grams={macros.fatG} kcal={macros.fatG * 9} totalKcal={macros.kcal} />
          </div>
          <button type="button" className="primary macro-add" onClick={() => void startAddFood()}>
            Añadir alimento
          </button>
        </div>
      </section>

      {pickingMeal && (
        <section className="gym-panel paper-card">
          <h2 className="section-label">¿A qué comida?</h2>
          <div className="meal-pick">
            {meals.map((meal) => (
              <button key={meal.id} type="button" className="pill quiet" onClick={() => void startAddFood(meal.id)}>
                {meal.title}
              </button>
            ))}
            <button type="button" className="ghost" onClick={() => setPickingMeal(false)}>Cancelar</button>
          </div>
        </section>
      )}

      <section className="gym-panel paper-card">
        <h2 className="section-label">Comidas</h2>
        <div className="meal-presets">
          {MEAL_PRESETS.map((title) => (
            <button
              key={title}
              type="button"
              className="pill quiet"
              onClick={() => void createMealWithTitle(title)}
            >
              {title}
            </button>
          ))}
        </div>
        {meals.length === 0 && <p className="empty">Elige un atajo o crea una comida.</p>}
        {meals.map((meal) => (
          <article key={meal.id} className="meal-card">
            <div className="section-head">
              <strong>{meal.title}</strong>
              <button type="button" className="ghost danger" onClick={() => void removeMeal(meal.id)}>Borrar</button>
            </div>
            {meal.items.length === 0 && <p className="meta">Sin alimentos aún.</p>}
            {meal.items.map((item) => (
              <div key={item.id} className="food-row">
                <div>
                  <strong>{item.foodName}</strong>
                  <p className="meta">
                    {item.grams} g
                    {item.brand ? ` · ${item.brand}` : ''}
                    {` · ${fmt(item.kcal)} kcal`}
                  </p>
                </div>
                <button type="button" className="ghost" onClick={() => void removeItem(meal.id, item.id)}>×</button>
              </div>
            ))}
            <button type="button" className="pill quiet" onClick={() => void startAddFood(meal.id)}>
              Añadir
            </button>
          </article>
        ))}
        <form className="meal-create" onSubmit={(event) => void createMeal(event)}>
          <label className="field" style={{ flex: 1, margin: 0 }}>
            Otra comida
            <input
              value={newMealTitle}
              maxLength={80}
              placeholder="Nombre…"
              onChange={(event) => setNewMealTitle(event.target.value)}
            />
          </label>
          <button type="submit" className="primary">Crear</button>
        </form>
      </section>

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

const MEAL_PRESETS = ['Desayuno', 'Almuerzo', 'Cena', 'Snack']

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

  async function search(event?: FormEvent) {
    event?.preventDefault()
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

  function pickHit(hit: FoodHit) {
    setSelected(hit)
    const serving = hit.servingGrams && hit.servingGrams > 0 ? hit.servingGrams : 100
    setGrams(String(serving))
    setError('')
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

  const portionGrams = Math.max(1, Math.round(Number(grams.replace(',', '.') || 0)))
  const preview = selected ? scaleMacros(selected, portionGrams) : null
  const shortcuts = selected
    ? [
        selected.servingGrams && selected.servingGrams > 0
          ? { label: selected.servingLabel || `${selected.servingGrams} g`, grams: selected.servingGrams }
          : null,
        { label: '50 g', grams: 50 },
        { label: '100 g', grams: 100 },
        { label: '150 g', grams: 150 },
      ].filter((item): item is { label: string; grams: number } => Boolean(item))
    : []

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void (selected ? addFood(event) : search(event))}>
        <div className="sheet-handle" />
        <h2>Añadir alimento</h2>
        {!selected && (
          <>
            <label className="field">
              Buscar
              <input
                value={query}
                autoFocus
                placeholder="Huevo, arroz, pollo…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Buscando…' : 'Buscar'}
            </button>
            <div className="food-hits">
              {hits.map((hit) => (
                <button
                  key={`${hit.id}-${hit.name}`}
                  type="button"
                  className="food-hit"
                  onClick={() => pickHit(hit)}
                >
                  <span className="food-hit-top">
                    <strong>{hit.name}</strong>
                    {hit.source === 'local' && <span className="food-badge">Común</span>}
                  </span>
                  <span className="meta">
                    {hit.brand ? `${hit.brand} · ` : ''}
                    {fmt(hit.kcal)} kcal / {hit.perGrams || 100} g
                    {hit.servingLabel ? ` · ${hit.servingLabel}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        {selected && (
          <>
            <div className="food-selected">
              <strong>{selected.name}</strong>
              <p className="meta">
                {selected.source === 'local' ? 'Común' : selected.brand || 'Open Food Facts'}
              </p>
            </div>
            <div className="portion-shortcuts">
              {shortcuts.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={Number(grams) === item.grams ? 'pill on' : 'pill quiet'}
                  onClick={() => setGrams(String(item.grams))}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="field">
              Gramos
              <input
                inputMode="numeric"
                value={grams}
                onChange={(event) => setGrams(event.target.value)}
              />
            </label>
            {preview && (
              <div className="portion-preview">
                <strong>{fmt(preview.kcal)} kcal</strong>
                <span className="meta">
                  P {fmt(preview.proteinG)} g · C {fmt(preview.carbsG)} g · G {fmt(preview.fatG)} g
                </span>
              </div>
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

function MacroBar({ label, short, grams, kcal, totalKcal }: {
  label: string
  short: string
  grams: number
  kcal: number
  totalKcal: number
}) {
  const pct = totalKcal > 0 ? Math.min(100, Math.round((kcal / totalKcal) * 100)) : 0
  return (
    <div className="macro-bar">
      <div className="macro-bar-head">
        <span><strong>{short}</strong> {label}</span>
        <span>{fmt(grams)} g · {pct}%</span>
      </div>
      <div className="macro-bar-track" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>
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
