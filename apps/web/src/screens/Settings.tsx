import { useEffect, useState } from 'react'
import { api } from '../api'
import { hideOnOpen, setHideOnOpen } from '../components/HideMoney'
import { Shell } from '../components/Shell'
import { currencies, currencySymbol } from '../format'
import type { HomeCard } from '../types'

const homeOptions: { id: HomeCard; label: string }[] = [
  { id: 'agenda', label: 'Agenda del día' },
  { id: 'habits', label: 'Hábitos de hoy' },
  { id: 'goals', label: 'Objetivos' },
  { id: 'workouts', label: 'Entrenamientos' },
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

  useEffect(() => {
    api.homePrefs().then((data) => setCards(data.cards)).catch(() => undefined)
    api.plan().then((data) => setCurrency(data.currency || 'PEN')).catch(() => undefined)
  }, [])

  async function saveCurrency(next: string) {
    setCurrency(next)
    setError('')
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
      setMessage('Listo. Los recordatorios llegarán a este teléfono.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar')
    }
  }

  return (
    <Shell title="Cuenta" tabs>
      <section className="panel">
        <h2>Personalizar inicio</h2>
        <p className="hint">Elige qué tarjetas aparecen en Inicio.</p>
        {homeOptions.map((item) => (
          <label key={item.id} className="checkline">
            <input type="checkbox" checked={cards.includes(item.id)} onChange={() => void toggleCard(item.id)} />
            {item.label}
          </label>
        ))}
      </section>
      <section className="panel">
        <h2>Moneda principal</h2>
        <p className="hint">Es la moneda con la que anotas gastos. El símbolo aparece en Inicio y al registrar.</p>
        <label className="field">
          Moneda
          <select value={currency} onChange={(event) => void saveCurrency(event.target.value)}>
            {currencies.map((item) => (
              <option key={item.code} value={item.code}>
                {item.symbol} · {item.name} ({item.code})
              </option>
            ))}
          </select>
        </label>
        <p className="meta">Ahora: {currencySymbol(currency)} ({currency})</p>
      </section>
      <section className="panel">
        <h2>Saldo</h2>
        <label className="checkline">
          <input
            type="checkbox"
            checked={hideBalance}
            onChange={(event) => {
              const next = event.target.checked
              setHideBalance(next)
              setHideOnOpen(next)
            }}
          />
          Ocultar el saldo al abrir
        </label>
        <p className="hint">El ojo de Finanzas lo muestra solo en esta visita.</p>
      </section>
      <section className="panel">
        <h2>En el teléfono</h2>
        {iosDevice() ? (
          <p>En Safari: Compartir, luego Añadir a pantalla de inicio. Ábrelo desde el icono.</p>
        ) : (
          <p>En Chrome: menú del navegador, luego Instalar app. También puedes añadirlo a la pantalla de inicio.</p>
        )}
      </section>
      <section className="panel">
        <h2>Recordatorios</h2>
        <p>El aviso sale del servidor cuando llega la hora. El teléfono necesita red.</p>
        <button type="button" className="primary" disabled={!pushReady} onClick={() => void enable()}>
          Activar notificaciones
        </button>
        {!pushReady && <p className="hint">Faltan las llaves VAPID en el servidor.</p>}
        {message && <p className="ok">{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>
      <section className="panel">
        <h2>Tus datos</h2>
        <p>Tareas, hábitos y movimientos, en un archivo.</p>
        <button type="button" className="ghost" onClick={() => void download()}>Exportar</button>
      </section>
      <button type="button" className="ghost" onClick={onLogout}>
        Salir
      </button>
      <p className="hint">© 2026 Rumbo</p>
    </Shell>
  )
}
