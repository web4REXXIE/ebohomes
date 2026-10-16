/* EboHomes service worker: Web Push only.
   It does NOT cache pages, API calls or user data, and it has no fetch
   handler, so it cannot interfere with navigation or the installed app. */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function safeUrl(value) {
  try {
    if (typeof value !== 'string') return '/notifications'
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
      return '/notifications'
    }
    return value
  } catch (e) {
    return '/notifications'
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = {}
  }

  const title = typeof data.title === 'string' && data.title ? data.title : 'EboHomes'
  const options = {
    body: typeof data.body === 'string' ? data.body : 'You have a new notification.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    data: { url: safeUrl(data.url) },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(safeUrl(event.notification.data && event.notification.data.url), self.location.origin).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          try {
            await client.focus()
            if ('navigate' in client) await client.navigate(target)
            return
          } catch (e) {
            /* fall through to openWindow */
          }
        }
      }
      await self.clients.openWindow(target)
    })()
  )
})

// If the browser rotates the subscription, the app re-saves it the next time
// it opens (see components/push-sync.tsx).
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription
  if (!old || !old.options || !old.options.applicationServerKey) return
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: old.options.applicationServerKey })
      .catch(() => {})
  )
})