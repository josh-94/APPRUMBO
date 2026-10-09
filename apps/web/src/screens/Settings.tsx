import { useState } from 'react'
import { api } from '../api'
import { Shell } from '../components/Shell'

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

export function Settings({ pushReady, onLogout }: { pushReady: boolean; onLogout: () => void }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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
