import { useEffect, useState } from 'react'
import { api } from '../api'
import { hideOnOpen, setHideOnOpen } from '../components/HideMoney'
import { Shell } from '../components/Shell'
import { currencies, currencySymbol, todayKey } from '../format'
import type { GoogleCalendarStatus, HomeCard } from '../types'
import { addDays } from '../components/plan/calendarUtils'

const homeOptions: { id: HomeCard; label: string; hint: string }[] = [
  { id: 'agenda', label: 'Agenda', hint: 'Del día' },
  { id: 'habits', label: 'Hábitos', hint: 'De hoy' },
  { id: 'goals', label: 'Objetivos', hint: 'Metas' },
  { id: 'workouts', label: 'Entrenos', hint: 'Gimnasio' },
]

function iosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function standalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function keyBytes(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

function syncLabel(iso?: string) {
  if (!iso) return null
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function Settings({ pushReady, onLogout, onCurrencyChange }: {
  pushReady: boolean
  onLogout: () => void
  onCurrencyChange?: () => void
}) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [hideBalance, setHideBalance] = useState(hideOnOpen)
  const [cards, setCards] = useState<HomeCard[]>(['agenda', 'habits', 'goals', 'workouts'])
  const [currency, setCurrency] = useState('PEN')
  const [gcal, setGcal] = useState<GoogleCalendarStatus | null>(null)
  const [gcalState, setGcalState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [gcalBusy, setGcalBusy] = useState(false)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    api.homePrefs().then((data) => setCards(data.cards)).catch(() => undefined)
    api.plan().then((data) => setCurrency(data.currency || 'PEN')).catch(() => undefined)
    api.googleCalendarStatus()
      .then((status) => {
        setGcal(status)
        setGcalState('ready')
      })
      .catch(() => {
        setGcal(null)
        setGcalState('error')
      })
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'ok') {
      setMessage('Google Calendar conectado.')
      window.history.replaceState({}, '', '/cuenta')
    } else if (params.get('error') === 'gcal' || params.get('error') === 'gcal_refresh') {
      setError('No se pudo conectar Google Calendar. Vuelve a intentarlo.')
      window.history.replaceState({}, '', '/cuenta')
    }
  }, [])

  useEffect(() => {
    void detectPush()
  }, [])

  async function detectPush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushOn(false)
        return
      }
      if (Notification.permission !== 'granted') {
        setPushOn(false)
        return
      }
      const ready = await navigator.serviceWorker.ready
      const sub = await ready.pushManager.getSubscription()
      setPushOn(Boolean(sub))
    } catch {
      setPushOn(false)
    }
  }

  async function refreshGcal() {
    try {
      setGcal(await api.googleCalendarStatus())
      setGcalState('ready')
    } catch {
      setGcal(null)
      setGcalState('error')
    }
  }

  async function disconnectGcal() {
    setError('')
    setMessage('')
    setGcalBusy(true)
    try {
      await api.disconnectGoogleCalendar()
      setMessage('Google Calendar desconectado.')
      await refreshGcal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desconectar')
    } finally {
      setGcalBusy(false)
    }
  }

  async function syncGcalNow() {
    setError('')
    setMessage('')
    setGcalBusy(true)
    try {
      const from = todayKey()
      const to = addDays(from, 28)
      await api.syncGoogleCalendar(from, to)
      setMessage('Calendario sincronizado.')
      await refreshGcal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo sincronizar')
      await refreshGcal()
    } finally {
      setGcalBusy(false)
    }
  }

  async function saveCurrency(next: string) {
    setCurrency(next)
    setError('')
    setMessage('')
    try {
      await api.setHomeCurrency(next)
      setMessage('Moneda principal actualizada.')
      onCurrencyChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la moneda')
    }
  }

  async function toggleCard(id: HomeCard) {
    const next = cards.includes(id) ? cards.filter((card) => card !== id) : [...cards, id]
    const ordered = homeOptions.map((item) => item.id).filter((card) => next.includes(card))
    setCards(ordered)
    setError('')
    setMessage('')
    try {
      const saved = await api.saveHomePrefs(ordered)
      setCards(saved.cards)
      setMessage('Inicio actualizado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  async function download() {
    setError('')
    setMessage('')
    try {
      const data = await api.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'rumbo.json'
      link.click()
      URL.revokeObjectURL(url)
      setMessage('Listo, archivo descargado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar')
    }
  }

  async function enable() {
    setError('')
    setMessage('')
    setPushBusy(true)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Este navegador no puede recibir notificaciones')
      }
      if (iosDevice() && !standalone()) {
        throw new Error('En el iPhone, primero añade RUMBO a la pantalla de inicio y ábrelo desde el icono')
      }
      const ready = await navigator.serviceWorker.ready
      const { publicKey } = await api.vapid()
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Permiso de notificaciones denegado')
      const subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      })
      const json = subscription.toJSON()
      await api.savePush({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' },
      })
      setPushOn(true)
      setMessage('Listo. Los recordatorios llegarán a este teléfono.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar')
    } finally {
      setPushBusy(false)
    }
  }

  const selectedCurrency = currencies.find((item) => item.code === currency)

  return (
    <Shell title="Cuenta" tabs>
      {(message || error) && (
        <div className={`cuenta-flash ${error ? 'is-error' : 'is-ok'}`} role="status" aria-live="polite">
          <p>{error || message}</p>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar"
            onClick={() => {
              setMessage('')
              setError('')
            }}
          >
            ×
          </button>
        </div>
      )}

      <section className="panel cuenta-panel">
        <header className="cuenta-head">
          <h2>Inicio</h2>
          <p>Qué tarjetas ves al abrir la app.</p>
        </header>
        <div className="cuenta-tiles" role="group" aria-label="Tarjetas de inicio">
          {homeOptions.map((item) => {
            const on = cards.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                className={on ? 'cuenta-tile on' : 'cuenta-tile'}
                aria-pressed={on}
                onClick={() => void toggleCard(item.id)}
              >
                <span className="cuenta-tile-label">{item.label}</span>
                <span className="cuenta-tile-hint">{item.hint}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="panel cuenta-panel">
        <header className="cuenta-head">
          <h2>Preferencias</h2>
        </header>
        <div className="cuenta-rows">
          <label className="cuenta-row">
            <span className="cuenta-row-copy">
              <strong>Moneda</strong>
              <span>Para anotar gastos y ver saldos</span>
            </span>
            <span className="cuenta-row-control">
              <span className="cuenta-currency-mark" aria-hidden="true">
                {currencySymbol(currency)}
              </span>
              <select
                value={currency}
                aria-label="Moneda principal"
                onChange={(event) => void saveCurrency(event.target.value)}
              >
                {currencies.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.symbol} · {item.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
          {selectedCurrency && (
            <p className="cuenta-row-note">{selectedCurrency.name} ({selectedCurrency.code})</p>
          )}
          <label className="cuenta-row">
            <span className="cuenta-row-copy">
              <strong>Ocultar saldo</strong>
              <span>Al abrir Finanzas, hasta que pulses el ojo</span>
            </span>
            <span className="cuenta-row-control">
              <input
                className="cuenta-switch"
                type="checkbox"
                role="switch"
                checked={hideBalance}
                aria-checked={hideBalance}
                onChange={(event) => {
                  const next = event.target.checked
                  setHideBalance(next)
                  setHideOnOpen(next)
                }}
              />
            </span>
          </label>
        </div>
      </section>

      <section className="panel cuenta-panel">
        <header className="cuenta-head">
          <div className="cuenta-head-row">
            <h2>Google Calendar</h2>
            <GcalBadge state={gcalState} status={gcal} />
          </div>
          <p>Solo lectura en Planificar. No se editan desde Rumbo.</p>
        </header>
        <div className="cuenta-actions">
          {gcalState === 'loading' ? (
            <p className="cuenta-muted">Comprobando conexión…</p>
          ) : gcalState === 'error' ? (
            <>
              <p className="cuenta-muted">No se pudo leer el estado. Revisa la red e inténtalo de nuevo.</p>
              <button type="button" className="ghost" onClick={() => void refreshGcal()}>
                Reintentar
              </button>
            </>
          ) : !gcal?.configured ? (
            <p className="cuenta-muted">Falta configurar Google en el servidor (Client ID, Secret y redirect).</p>
          ) : gcal.connected ? (
            <>
              {gcal.lastSyncAt && (
                <p className="cuenta-muted">Última sync · {syncLabel(gcal.lastSyncAt)}</p>
              )}
              <div className="cuenta-btn-row">
                <button type="button" className="primary" disabled={gcalBusy} onClick={() => void syncGcalNow()}>
                  Sincronizar
                </button>
                <button type="button" className="ghost" disabled={gcalBusy} onClick={() => void disconnectGcal()}>
                  Desconectar
                </button>
              </div>
            </>
          ) : (
            <a className="primary" href="/api/google/calendar/connect">
              Conectar Google Calendar
            </a>
          )}
        </div>
      </section>

      <section className="panel cuenta-panel">
        <header className="cuenta-head">
          <div className="cuenta-head-row">
            <h2>Notificaciones</h2>
            <span className={`cuenta-badge ${pushOn ? 'is-on' : pushReady ? 'is-idle' : 'is-off'}`}>
              {pushOn ? 'Activas' : pushReady ? 'Listas' : 'No disponibles'}
            </span>
          </div>
          <p>Avisos push de eventos y recordatorios. El teléfono necesita red.</p>
        </header>
        <div className="cuenta-actions">
          {iosDevice() && !standalone() && (
            <p className="cuenta-tip">
              En el iPhone: Safari → Compartir → Añadir a pantalla de inicio, y ábrelo desde el icono.
            </p>
          )}
          {!iosDevice() && !standalone() && (
            <p className="cuenta-tip">
              En Chrome puedes instalar la app o añadirla a la pantalla de inicio para un aviso más fiable.
            </p>
          )}
          {!pushReady && (
            <p className="cuenta-muted">Faltan las llaves VAPID en el servidor.</p>
          )}
          <button
            type="button"
            className={pushOn ? 'ghost' : 'primary'}
            disabled={!pushReady || pushBusy || pushOn}
            onClick={() => void enable()}
          >
            {pushOn ? 'Ya activadas en este teléfono' : pushBusy ? 'Activando…' : 'Activar notificaciones'}
          </button>
        </div>
      </section>

      <section className="panel cuenta-panel">
        <header className="cuenta-head">
          <h2>Tus datos</h2>
          <p>Exporta un respaldo con tareas, hábitos y movimientos.</p>
        </header>
        <div className="cuenta-actions">
          <button type="button" className="ghost" onClick={() => void download()}>
            Exportar rumbo.json
          </button>
        </div>
      </section>

      <div className="cuenta-footer">
        <button type="button" className="ghost danger cuenta-logout" onClick={onLogout}>
          Salir
        </button>
        <p className="cuenta-copy">© 2026 Rumbo</p>
      </div>
    </Shell>
  )
}

function GcalBadge({
  state,
  status,
}: {
  state: 'loading' | 'ready' | 'error'
  status: GoogleCalendarStatus | null
}) {
  if (state === 'loading') {
    return <span className="cuenta-badge is-idle">…</span>
  }
  if (state === 'error') {
    return <span className="cuenta-badge is-off">Sin estado</span>
  }
  if (!status?.configured) {
    return <span className="cuenta-badge is-off">Sin config</span>
  }
  if (status.connected) {
    return <span className="cuenta-badge is-on">Conectado</span>
  }
  return <span className="cuenta-badge is-idle">Desconectado</span>
}
