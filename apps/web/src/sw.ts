/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: PrecacheEntry[] }

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  const data = event.data?.json() as { title?: string; body?: string; tag?: string } | undefined
  event.waitUntil(
    self.registration.showNotification(data?.title || 'Hoy', {
      body: data?.body || '',
      tag: data?.tag,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/dia'))
})
