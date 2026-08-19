const STATIC_CACHE = "leighpogo-static-v5"
const OFFLINE_URL = "/offline.html"
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-icon-maskable-512.png",
  "/apple-touch-icon.png",
]
const DEFAULT_ICON = "/pwa-icon-192.png"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("leighpogo-static-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim(),
    ])
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") || STATIC_ASSETS.includes(url.pathname)

  if (!isStaticAsset) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response
        }

        const copy = response.clone()
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
        return response
      })
    })
  )
})

self.addEventListener("push", (event) => {
  let payload = {}

  if (event.data) {
    try {
      payload = event.data.json()
    } catch {
      payload = { body: event.data.text() }
    }
  }

  const title = payload.title || "LEIGHPOGO"
  const options = {
    body: payload.body || "",
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_ICON,
    tag: payload.tag,
    renotify: Boolean(payload.renotify),
    data: {
      url: payload.url || "/",
      notificationKind: payload.notificationKind || null,
      notificationId: Number(payload.notificationId) || null,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

async function consumeClickedNotification(data = {}) {
  try {
    const kind = String(data.notificationKind || "").toUpperCase()
    const notificationId = Number(data.notificationId)

    if (kind === "TRADE" && Number.isInteger(notificationId) && notificationId > 0) {
      await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      return
    }

    const target = new URL(data.url || "/", self.location.origin)
    if (target.pathname === "/pokedex-import") {
      const jobId = Number(target.searchParams.get("job"))
      if (Number.isInteger(jobId) && jobId > 0) {
        await fetch(`/api/pokedex-import/jobs/${jobId}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "DISMISS_NOTIFICATION" }),
        })
      }
    }
  } catch {
    // Notification cleanup is best-effort; never block opening the destination.
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const targetUrl = new URL(data.url || "/", self.location.origin).href

  const navigate = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => {
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus()
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }

      return undefined
    })

  event.waitUntil(Promise.all([consumeClickedNotification(data), navigate]))
})
