self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (err) {
    data = { body: event.data ? event.data.text() : '' }
  }
  const url = data.url || '/dia'
  event.waitUntil(self.registration.showNotification(data.title || 'Hoy', {
    body: data.body || '',
    tag: data.tag,
    data: { url },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dia'
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
