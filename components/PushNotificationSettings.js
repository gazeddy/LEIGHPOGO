import { useEffect, useState } from "react"

const urlBase64ToUint8Array = (value) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)

  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

const unsupportedMessage =
  "Push notifications are not available in this browser. On iPhone or iPad, install LEIGHPOGO to the Home Screen first."

export default function PushNotificationSettings() {
  const [checking, setChecking] = useState(true)
  const [supported, setSupported] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [publicKey, setPublicKey] = useState("")
  const [permission, setPermission] = useState("default")
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

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
        const [registration, configResponse] = await Promise.all([
          navigator.serviceWorker.ready,
          fetch("/api/push/config", { cache: "no-store" }),
        ])

        if (!configResponse.ok) {
          throw new Error("Unable to load push configuration.")
        }

        const config = await configResponse.json()
        const existingSubscription = await registration.pushManager.getSubscription()

        if (!cancelled) {
          setConfigured(Boolean(config.configured && config.publicKey))
          setPublicKey(config.publicKey || "")
          setSubscribed(Boolean(existingSubscription))
          if (!config.configured) {
            setMessage("Push is ready in V3, but the server VAPID public key has not been configured yet.")
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

    setBusy(true)
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

      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      })

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
      setBusy(false)
    }
  }

  const disablePush = async () => {
    if (!supported || busy) return

    setBusy(true)
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
      setBusy(false)
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
        </div>
        <span className={`push-status ${subscribed ? "enabled" : "disabled"}`}>
          {statusLabel}
        </span>
      </div>

      {permission === "denied" && (
        <p className="push-warning">
          Notifications are blocked in your browser settings. Allow notifications for LEIGHPOGO before trying again.
        </p>
      )}

      {message && <p className="muted push-message">{message}</p>}

      <div className="push-settings-actions">
        {subscribed ? (
          <button type="button" className="secondary-button" disabled={busy} onClick={disablePush}>
            {busy ? "Disabling..." : "Disable push notifications"}
          </button>
        ) : (
          <button
            type="button"
            disabled={checking || busy || !supported || !configured || permission === "denied"}
            onClick={enablePush}
          >
            {busy ? "Enabling..." : "Enable push notifications"}
          </button>
        )}
      </div>
    </div>
  )
}
