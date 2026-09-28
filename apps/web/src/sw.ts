/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: PrecacheEntry[] }

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  const data = event.data?.json() as { title?: string; body?: string; tag?: string; url?: string } | undefined
  const url = data?.url || '/dia'
  event.waitUntil(
    self.registration.showNotification(data?.title || 'Hoy', {
      body: data?.body || '',
      tag: data?.tag,
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/dia'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if ('navigate' in client) {
        await client.navigate(url)
        return client.focus()
      }
    }
    await self.clients.openWindow(url)
  })())
})
