import { useEffect, useState } from "react"

const urlBase64ToUint8Array = (value) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)

  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

const unsupportedMessage =
  "Push notifications are not available in this browser. On iPhone or iPad, install LEIGHPOGO to the Home Screen first."

const PUSH_OPTIONS = [
  {
    key: "PUSH_RAIDS",
    label: "Raid alerts",
    description: "Raid Hour, Raid Day and event raid notifications.",
  },
  {
    key: "PUSH_TRADES",
    label: "Trade alerts",
    description: "Wanted-trade and listing-match notifications.",
  },
  {
    key: "PUSH_NEW_GYMS",
    label: "New gym alerts",
    description: "Notifications when a new gym is added to the community map.",
  },
]

const DEFAULT_PUSH_PREFERENCES = {
  PUSH_RAIDS: true,
  PUSH_TRADES: true,
  PUSH_NEW_GYMS: true,
}

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"
  } catch {
    return "Europe/London"
  }
}

const saveSubscription = (subscription) =>
  fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timeZone: browserTimeZone(),
    }),
  })

export default function PushNotificationSettings() {
  const [checking, setChecking] = useState(true)
  const [supported, setSupported] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [publicKey, setPublicKey] = useState("")
  const [permission, setPermission] = useState("default")
  const [subscribed, setSubscribed] = useState(false)
  const [activeAction, setActiveAction] = useState("")
  const [message, setMessage] = useState("")
  const [preferences, setPreferences] = useState(DEFAULT_PUSH_PREFERENCES)
  const [savingPreference, setSavingPreference] = useState("")

  const busy = Boolean(activeAction)

  useEffect(() => {
    let cancelled = false

    const inspectPushState = async () => {
      const hasSupport =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window

      if (!hasSupport) {
        if (!cancelled) {
          setSupported(false)
          setMessage(unsupportedMessage)
          setChecking(false)
        }
        return
      }

      setSupported(true)
      setPermission(Notification.permission)

      try {
        const [registration, configResponse, preferenceResponse] = await Promise.all([
          navigator.serviceWorker.ready,
          fetch("/api/push/config", { cache: "no-store" }),
          fetch("/api/push/preferences", { cache: "no-store" }),
        ])

        if (!configResponse.ok) {
          throw new Error("Unable to load push configuration.")
        }

        const config = await configResponse.json()
        const preferenceBody = preferenceResponse.ok
          ? await preferenceResponse.json()
          : { preferences: DEFAULT_PUSH_PREFERENCES }
        const existingSubscription = await registration.pushManager.getSubscription()

        if (existingSubscription) {
          saveSubscription(existingSubscription).catch((error) => {
            console.warn("Unable to sync push subscription timezone", error)
          })
        }

        if (!cancelled) {
          setConfigured(Boolean(config.configured && config.publicKey))
          setPublicKey(config.publicKey || "")
          setSubscribed(Boolean(existingSubscription))
          setPreferences({
            ...DEFAULT_PUSH_PREFERENCES,
            ...(preferenceBody.preferences || {}),
          })
          if (!config.configured) {
            setMessage(
              "Push is wired into V3, but the server VAPID configuration is not complete yet.",
            )
          }
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || "Unable to check push notification status.")
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    inspectPushState()

    return () => {
      cancelled = true
    }
  }, [])

  const enablePush = async () => {
    if (!supported || !configured || !publicKey || busy) return

    setActiveAction("enable")
    setMessage("")

    let createdSubscription = null

    try {
      const nextPermission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission()

      setPermission(nextPermission)

      if (nextPermission !== "granted") {
        setMessage(
          nextPermission === "denied"
            ? "Notifications are blocked for LEIGHPOGO in this browser."
            : "Notification permission was not granted.",
        )
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
        createdSubscription = subscription
      }

      const response = await saveSubscription(subscription)

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "Unable to save push subscription.")
      }

      setSubscribed(true)
      setMessage("Push notifications are enabled on this device.")
    } catch (error) {
      if (createdSubscription) {
        await createdSubscription.unsubscribe().catch(() => {})
      }
      setSubscribed(false)
      setMessage(error.message || "Unable to enable push notifications.")
    } finally {
      setActiveAction("")
    }
  }

  const disablePush = async () => {
    if (!supported || busy) return

    setActiveAction("disable")
    setMessage("")

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        const response = await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error || "Unable to remove push subscription.")
        }

        await subscription.unsubscribe()
      }

      setSubscribed(false)
      setMessage("Push notifications are disabled on this device.")
    } catch (error) {
      setMessage(error.message || "Unable to disable push notifications.")
    } finally {
      setActiveAction("")
    }
  }

  const updatePreference = async (key, enabled) => {
    if (savingPreference) return

    const previous = preferences[key]
    setSavingPreference(key)
    setPreferences((current) => ({ ...current, [key]: enabled }))
    setMessage("")

    try {
      const response = await fetch("/api/push/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      })
      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body.error || "Unable to save notification preference.")
      }
    } catch (error) {
      setPreferences((current) => ({ ...current, [key]: previous }))
      setMessage(error.message || "Unable to save notification preference.")
    } finally {
      setSavingPreference("")
    }
  }

  const sendTestPush = async () => {
    if (!subscribed || busy) return

    setActiveAction("test")
    setMessage("")

    try {
      const response = await fetch("/api/push/send-test", { method: "POST" })
      const body = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(body.error || "Unable to send a test notification.")
      }

      const deviceLabel = body.sent === 1 ? "device" : "devices"
      setMessage(`Test notification sent to ${body.sent} subscribed ${deviceLabel}.`)
    } catch (error) {
      setMessage(error.message || "Unable to send a test notification.")
    } finally {
      setActiveAction("")
    }
  }

  const statusLabel = checking
    ? "Checking..."
    : subscribed
      ? "Enabled on this device"
      : "Disabled on this device"

  return (
    <div className="card push-settings">
      <div className="push-settings-row">
        <div>
          <h2>Push notifications</h2>
          <p className="muted">
            Get LEIGHPOGO alerts even when the site is not open. Permission is only requested when you choose Enable.
          </p>
          <p className="muted">
            Raid alerts follow the event schedule: Raid Hour reminders are sent around the evening raid window, while Raid Days and major weekend events are sent before their actual start time.
          </p>
        </div>
        <span className={`push-status ${subscribed ? "enabled" : "disabled"}`}>
          {statusLabel}
        </span>
      </div>

      <div className="push-preference-list">
        <h3>Choose your alerts</h3>
        {PUSH_OPTIONS.map((option) => (
          <label key={option.key} className="push-preference-option">
            <input
              type="checkbox"
              checked={preferences[option.key] !== false}
              disabled={checking || Boolean(savingPreference)}
              onChange={(event) => updatePreference(option.key, event.target.checked)}
            />
            <span>
              <strong>{option.label}</strong>
              <span className="muted"> — {option.description}</span>
            </span>
          </label>
        ))}
        <p className="muted">
          Pokédex import completion alerts are kept separate because they report the result of an import you started yourself.
        </p>
      </div>

      {permission === "denied" && (
        <p className="push-warning">
          Notifications are blocked in your browser settings. Allow notifications for LEIGHPOGO before trying again.
        </p>
      )}

      {message && <p className="muted push-message">{message}</p>}

      <div className="push-settings-actions">
        {subscribed ? (
          <>
            <button type="button" disabled={busy} onClick={sendTestPush}>
              {activeAction === "test" ? "Sending..." : "Send test push"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={disablePush}
            >
              {activeAction === "disable" ? "Disabling..." : "Disable push notifications"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={checking || busy || !supported || !configured || permission === "denied"}
            onClick={enablePush}
          >
            {activeAction === "enable" ? "Enabling..." : "Enable push notifications"}
          </button>
        )}
      </div>
    </div>
  )
}
